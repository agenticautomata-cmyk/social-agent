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

export async function collectActionCenterItems(now = new Date()): Promise<ActionCenterItem[]> {
  const items: ActionCenterItem[] = [];

  const [plannerMap, contacts, outreachRows, intakeRows, pipelineOpps] = await Promise.all([
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
  ]);

  const contentIds = [...plannerMap.keys()];
  const titles = await titleMap(contentIds);

  for (const record of plannerMap.values()) {
    if (record.status === 'covered' || record.status === 'skipped') continue;

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
          subtitle: `${record.listName} · planned ${record.plannedDate ?? record.dueDate ?? '—'}`,
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
          href: `/planner/week`,
          meta: { status: record.status, listName: record.listName },
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
            href: `/outreach/compose?sponsor=${contact.id}`,
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
          href: `/outreach/compose?sponsor=${email.sponsorContactId}`,
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
          href: `/outreach/compose?sponsor=${email.sponsorContactId}`,
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
            href: '/outreach/queue',
            meta: { status: email.status },
          }),
        );
      }
    }
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
  };
}
