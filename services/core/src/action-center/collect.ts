import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems, shareIntakeSubmissions } from '../schema.js';
import { loadAllPlannerItems } from '../content-planner/items.js';
import {
  enrichOpportunities,
  listSponsorOpportunities,
} from '../sponsor-pipeline/opportunities.js';
import { OPEN_PIPELINE_STATUSES, PIPELINE_STATUS_LABELS } from '../sponsor-pipeline/constants.js';
import {
  enrichOutreachEmails,
  listOutreachEmails,
} from '../sponsor-outreach/outreach.js';
import { listSponsorContacts } from '../sponsor-outreach/contacts.js';
import { listOutreachInboundMessages } from '../gmail-inbox/sync-replies.js';
import { loadIngestedInventoryItems } from '../inventory/load-ingested.js';
import { filterInventoryItems } from '../inventory/normalize.js';
import { computeTopSponsorCandidates } from '../sponsor-intelligence/top-candidates.js';
import {
  shouldPromoteSponsorCandidate,
  sponsorBriefingLinkFromCandidate,
} from '../sponsor-intelligence/priority.js';
import { listRecommendations } from '../tiktok-operator/recommendations.js';
import { resolveOperatorCreatorId } from '../tiktok-operator/resolve-creator.js';
import { dueBucketFor, effectiveDueIso } from './dates.js';
import { assignPriority } from './priorities.js';
import type { ActionCenterAction, ActionCenterItem, ActionCenterSections } from './types.js';

const STALE_PIPELINE_MS = 5 * 24 * 60 * 60 * 1000;

function finalize(item: Omit<ActionCenterItem, 'priority' | 'dueBucket'> & { dueAt: string | null }): ActionCenterItem {
  const dueBucket = dueBucketFor(item.dueAt);
  const withBucket = { ...item, dueBucket };
  return { ...withBucket, priority: assignPriority(withBucket) };
}

async function titleMap(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: contentItems.id, topic: contentItems.topic })
    .from(contentItems)
    .where(inArray(contentItems.id, ids));
  return new Map(rows.map((r) => [r.id, r.topic]));
}

export async function collectActionCenterItems(
  now = new Date(),
  options?: { excludeCategories?: string[] },
): Promise<ActionCenterItem[]> {
  const excludeCategories = options?.excludeCategories ?? [];
  const excludeSet = excludeCategories.length > 0 ? new Set(excludeCategories) : null;

  const allIngested = await loadIngestedInventoryItems();
  const categoryByContentId = new Map(
    allIngested.map((item) => [item.id, item.category ?? 'uncategorized']),
  );
  const ingestedForSponsors = excludeSet
    ? filterInventoryItems(allIngested, { excludeCategories })
    : allIngested;

  const items: ActionCenterItem[] = [];

  const [plannerMap, contacts, outreachRows, intakeRows, pipelineOpps, inboundReplies] =
    await Promise.all([
    loadAllPlannerItems(),
    listSponsorContacts(),
    listOutreachEmails('queue'),
    db
      .select()
      .from(shareIntakeSubmissions)
      .where(eq(shareIntakeSubmissions.reviewStatus, 'needs_review'))
      .orderBy(desc(shareIntakeSubmissions.createdAt))
      .limit(50),
    enrichOpportunities(
      (await listSponsorOpportunities({ openOnly: true })).filter((o) =>
        OPEN_PIPELINE_STATUSES.includes(o.status),
      ),
    ),
    listOutreachInboundMessages(20),
  ]);

  const contentIds = [...plannerMap.keys()];
  const titles = await titleMap(contentIds);

  for (const record of plannerMap.values()) {
    if (record.status === 'covered' || record.status === 'skipped') continue;
    if (excludeSet) {
      const cat = categoryByContentId.get(record.contentItemId) ?? 'uncategorized';
      if (excludeSet.has(cat)) continue;
    }

    const dueAt = effectiveDueIso(
      record.dueDate ? `${record.dueDate}T12:00:00.000Z` : null,
      record.followUpAt,
    );

    const isFollowUp =
      (record.followUpAt && dueBucketFor(record.followUpAt, now) !== 'none') ||
      (record.dueDate && dueBucketFor(`${record.dueDate}T12:00:00.000Z`, now) !== 'none');

    if (!isFollowUp && record.status !== 'planned' && record.status !== 'considering') continue;

    if (isFollowUp) {
      items.push(
        finalize({
          id: `planner-followup-${record.contentItemId}`,
          section: 'pending_follow_ups',
          entityType: 'planner',
          entityId: record.contentItemId,
          title: titles.get(record.contentItemId) ?? 'Planner follow-up',
          subtitle: `${record.listName} · ${record.status}`,
          dueAt,
          actions: [
            { kind: 'schedule_follow_up', label: 'Schedule follow-up' },
            { kind: 'mark_covered', label: 'Mark covered' },
            { kind: 'assign_due_date', label: 'Set due date' },
          ],
          href: `/review/inventory?id=${record.contentItemId}`,
          meta: { status: record.status, listName: record.listName },
        }),
      );
    }

    const plannedDue = record.plannedDate
      ? `${record.plannedDate}T12:00:00.000Z`
      : record.dueDate
        ? `${record.dueDate}T12:00:00.000Z`
        : null;

    if (
      (record.status === 'planned' || record.status === 'considering') &&
      plannedDue &&
      dueBucketFor(plannedDue, now) !== 'later'
    ) {
      items.push(
        finalize({
          id: `planner-upcoming-${record.contentItemId}`,
          section: 'upcoming_planned_content',
          entityType: 'planner',
          entityId: record.contentItemId,
          title: titles.get(record.contentItemId) ?? 'Planned content',
          subtitle: `${record.listName}${record.priority === 0 ? ' · pinned' : ''} · planned ${record.plannedDate ?? record.dueDate ?? '—'}`,
          dueAt: plannedDue,
          actions: [
            { kind: 'assign_due_date', label: 'Assign due date' },
            { kind: 'mark_covered', label: 'Mark covered' },
            {
              kind: 'create_planner_item',
              label: 'Move to today',
              href: `/planner`,
            },
          ],
          href: `/review/inventory?id=${record.contentItemId}`,
          meta: {
            status: record.status,
            listName: record.listName,
            plannerPriority: record.priority,
          },
        }),
      );
    }
  }

  for (const contact of contacts) {
    if (!contact.nextFollowUpAt) continue;
    if (dueBucketFor(contact.nextFollowUpAt, now) === 'none') continue;

    items.push(
      finalize({
        id: `sponsor-followup-${contact.id}`,
        section: 'pending_follow_ups',
        entityType: 'sponsor_contact',
        entityId: contact.id,
        title: `Follow up: ${contact.businessName}`,
        subtitle: contact.status,
        dueAt: contact.nextFollowUpAt,
        actions: [
          { kind: 'schedule_follow_up', label: 'Reschedule follow-up' },
          {
            kind: 'send_email',
            label: 'Compose email',
            href: `/email/approvals`,
          },
        ],
        href: `/sponsors/${contact.id}`,
        meta: { status: contact.status },
      }),
    );
  }

  const enrichedOutreach = await enrichOutreachEmails(outreachRows);

  for (const email of enrichedOutreach) {
    if (email.followUpDueAt && dueBucketFor(email.followUpDueAt, now) !== 'none') {
      items.push(
        finalize({
          id: `outreach-followup-${email.id}`,
          section: 'pending_follow_ups',
          entityType: 'outreach',
          entityId: email.id,
          title: `Outreach follow-up: ${email.sponsorBusinessName}`,
          subtitle: email.subject,
          dueAt: email.followUpDueAt,
          actions: [
            { kind: 'schedule_follow_up', label: 'Set follow-up date' },
            { kind: 'send_email', label: 'Open email' },
          ],
          href: `/email/approvals?id=${email.id}`,
          meta: { status: email.status },
        }),
      );
    }

    if (['draft', 'needs_approval', 'scheduled', 'sending'].includes(email.status)) {
      const emailActions: ActionCenterAction[] =
        email.status === 'needs_approval'
          ? [
              { kind: 'approve_email', label: 'Approve' },
              { kind: 'send_email', label: 'Send now' },
            ]
          : email.status === 'scheduled'
            ? [
                { kind: 'approve_email', label: 'Approve send' },
                { kind: 'send_email', label: 'Send now' },
              ]
            : [{ kind: 'send_email', label: 'Continue draft' }];

      items.push(
        finalize({
          id: `outreach-email-${email.id}`,
          section: 'pending_sponsor_emails',
          entityType: 'outreach',
          entityId: email.id,
          title: email.subject || `Email to ${email.sponsorBusinessName}`,
          subtitle: `${email.status.replace(/_/g, ' ')} · ${email.sponsorBusinessName}`,
          dueAt: email.scheduledSendAt,
          actions: emailActions,
          href: `/email/approvals?id=${email.id}`,
          meta: { status: email.status },
        }),
      );

      if (email.status === 'needs_approval') {
        items.push(
          finalize({
            id: `outreach-approval-${email.id}`,
            section: 'content_waiting_for_approval',
            entityType: 'outreach',
            entityId: email.id,
            title: `Approve outreach: ${email.sponsorBusinessName}`,
            subtitle: email.subject,
            dueAt: email.scheduledSendAt,
            actions: [
              { kind: 'approve_email', label: 'Approve email' },
              { kind: 'assign_due_date', label: 'Set follow-up due' },
            ],
            href: '/email/approvals',
            meta: { status: email.status },
          }),
        );
      }
    }
  }

  for (const reply of inboundReplies.filter((m) => !m.isRead)) {
    items.push(
      finalize({
        id: `inbox-reply-${reply.id}`,
        section: 'pending_sponsor_emails',
        entityType: 'outreach',
        entityId: reply.outreachEmailId ?? reply.id,
        title: `Reply: ${reply.businessName ?? reply.fromName ?? reply.fromEmail ?? 'Sponsor'}`,
        subtitle: reply.subject ?? reply.snippet ?? 'New sponsor reply',
        dueAt: reply.receivedAt,
        actions: [{ kind: 'send_email', label: 'Open inbox' }],
        href: '/email/inbox',
        meta: { matchKind: reply.matchKind },
      }),
    );
  }

  for (const intake of intakeRows) {
    items.push(
      finalize({
        id: `intake-${intake.id}`,
        section: 'content_waiting_for_approval',
        entityType: 'intake',
        entityId: intake.id,
        title: intake.extractedTitle ?? 'Share intake review',
        subtitle: intake.extractedCategory ?? intake.intakeType,
        dueAt: intake.createdAt.toISOString(),
        actions: [
          { kind: 'mark_covered', label: 'Review in intake', href: '/intake' },
        ],
        href: `/intake`,
        meta: { confidence: intake.confidenceScore ? Number(intake.confidenceScore) : null },
      }),
    );
  }

  const nowMs = now.getTime();
  for (const opp of pipelineOpps) {
    const dueAt = opp.dueDate;
    const stale = nowMs - new Date(opp.updatedAt).getTime() > STALE_PIPELINE_MS;
    const activeStage = opp.status === 'proposal_sent' || opp.status === 'negotiating';
    const dueSoon = dueAt ? dueBucketFor(dueAt, now) !== 'none' && dueBucketFor(dueAt, now) !== 'later' : false;

    if (!stale && !activeStage && !dueSoon) continue;

    items.push(
      finalize({
        id: `pipeline-${opp.id}`,
        section: 'sponsor_opportunities_needing_updates',
        entityType: 'pipeline',
        entityId: opp.id,
        title: `${opp.sponsorBusinessName}: ${opp.title}`,
        subtitle: `${PIPELINE_STATUS_LABELS[opp.status]}${stale ? ' · stale' : ''}`,
        dueAt,
        actions: [
          { kind: 'move_opportunity_stage', label: 'Update stage' },
          { kind: 'assign_due_date', label: 'Set due date' },
          { kind: 'create_planner_item', label: 'Add to planner' },
        ],
        href: '/pipeline',
        meta: {
          status: opp.status,
          sponsorContactId: opp.sponsorContactId,
          stale,
        },
      }),
    );
  }

  const topSponsors = await computeTopSponsorCandidates(ingestedForSponsors, { limit: 3 });
  for (const rec of topSponsors.items) {
    if (!shouldPromoteSponsorCandidate(rec)) continue;
    if (excludeSet) {
      const cat = rec.category ?? 'uncategorized';
      if (excludeSet.has(cat)) continue;
    }
    const link = sponsorBriefingLinkFromCandidate(rec);
    const hasDraft = enrichedOutreach.some(
      (e) =>
        e.sponsorContactId === rec.sponsorContactId &&
        ['draft', 'needs_approval'].includes(e.status),
    );
    if (hasDraft) continue;
    items.push(
      finalize({
        id: `sponsor-pitch-${rec.contentItemId}`,
        section: 'sponsor_opportunities_needing_updates',
        entityType: 'planner',
        entityId: rec.contentItemId,
        title: link.label,
        subtitle: rec.recommendedPitchAngle,
        dueAt: null,
        actions: [
          {
            kind: 'start_pitch',
            label: 'Finish pitch',
            href: link.href,
          },
        ],
        href: link.href,
        meta: { contactFirst: rec.scores.contactFirst },
      }),
    );
  }

  try {
    const { resolveTikTokAnalyticsContext } = await import('../creator-analytics/tiktok-context.js');
    const { FOLLOWERS_5000_TARGET } = await import('../push-notifications/constants.js');
    const { getMilestone } = await import('../push-notifications/milestones.js');
    const tiktokCtx = await resolveTikTokAnalyticsContext(false);
    const milestoneRow = await getMilestone('followers_5000');
    const count = tiktokCtx.followersAvailable ? tiktokCtx.followersCount : null;
    const milestoneDone =
      !!milestoneRow?.pushSentAt ||
      !!milestoneRow?.celebratedAt ||
      (count != null && count >= FOLLOWERS_5000_TARGET);
    if (
      count != null &&
      count >= 4500 &&
      count < FOLLOWERS_5000_TARGET &&
      !milestoneDone
    ) {
      items.push(
        finalize({
          id: 'milestone-5000-progress',
          section: 'sponsor_opportunities_needing_updates',
          entityType: 'planner',
          entityId: 'followers_5000',
          title: `${(FOLLOWERS_5000_TARGET - count).toLocaleString()} followers to 5K 🎆`,
          subtitle: 'Milestone unlocks celebration + Telegram blast at 5,000',
          dueAt: null,
          actions: [{ kind: 'create_planner_item', label: 'View TikTok analytics', href: '/analytics/tiktok' }],
          href: '/analytics/tiktok',
          meta: { followerCount: count },
        }),
      );
    }
  } catch {
    /* optional */
  }

  const approvalCount = enrichedOutreach.filter((e) => e.status === 'needs_approval').length;
  if (approvalCount > 0) {
    items.push(
      finalize({
        id: 'email-approvals-queue',
        section: 'content_waiting_for_approval',
        entityType: 'outreach',
        entityId: 'approvals',
        title: `${approvalCount} Benson pitch${approvalCount === 1 ? '' : 'es'} need approval`,
        subtitle: 'Email → Approvals — nothing sends without you',
        dueAt: now.toISOString(),
        actions: [{ kind: 'approve_email', label: 'Review pitches', href: '/email/approvals' }],
        href: '/email/approvals',
        meta: { count: approvalCount },
      }),
    );
  }

  const unreadReplies = inboundReplies.filter((m) => !m.isRead).length;
  if (unreadReplies > 0) {
    items.push(
      finalize({
        id: 'email-inbox-unread',
        section: 'pending_sponsor_emails',
        entityType: 'outreach',
        entityId: 'inbox',
        title: `${unreadReplies} unread sponsor repl${unreadReplies === 1 ? 'y' : 'ies'}`,
        subtitle: 'Email → Inbox',
        dueAt: now.toISOString(),
        actions: [{ kind: 'send_email', label: 'Open inbox', href: '/email/inbox' }],
        href: '/email/inbox',
        meta: { count: unreadReplies },
      }),
    );
  }

  try {
    const creatorId = await resolveOperatorCreatorId();
    const tiktokRecs = await listRecommendations(creatorId, { limit: 8 });
    for (const rec of tiktokRecs.filter((r) => r.status === 'new' || r.status === 'accepted')) {
      items.push(
        finalize({
          id: `tiktok-op-${rec.id}`,
          section: 'tiktok_operator_moves',
          entityType: 'tiktok_operator',
          entityId: rec.id,
          title: rec.title,
          subtitle: rec.explanation,
          dueAt: null,
          actions: [
            {
              kind: 'create_planner_item',
              label: 'Prepare for TikTok',
              href: `/analytics/tiktok/operator?rec=${rec.id}`,
            },
          ],
          href: `/analytics/tiktok/operator?rec=${rec.id}`,
          meta: {
            recommendationType: rec.recommendationType,
            confidence: rec.confidence,
            performanceIndex:
              (rec.supportingMetrics.performanceIndex as number | undefined) ?? null,
          },
        }),
      );
    }
  } catch {
    /* TikTok operator optional until migration */
  }

  return items;
}

export function sectionize(items: ActionCenterItem[]): ActionCenterSections {
  return {
    pendingFollowUps: items.filter((i) => i.section === 'pending_follow_ups'),
    pendingSponsorEmails: items.filter((i) => i.section === 'pending_sponsor_emails'),
    contentWaitingForApproval: items.filter(
      (i) => i.section === 'content_waiting_for_approval',
    ),
    upcomingPlannedContent: items.filter((i) => i.section === 'upcoming_planned_content'),
    sponsorOpportunitiesNeedingUpdates: items.filter(
      (i) => i.section === 'sponsor_opportunities_needing_updates',
    ),
    tiktokOperatorMoves: items.filter((i) => i.section === 'tiktok_operator_moves'),
  };
}
