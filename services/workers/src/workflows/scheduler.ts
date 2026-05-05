// Scheduler — picks `ready_to_publish` items, computes `scheduled_for` based on
// the campaign's posting_schedule (cron), creates publication rows for each
// active publishing target, transitions item to `scheduled`.

import { eq, and, gte, asc } from 'drizzle-orm';
import {
  db,
  campaigns,
  publishingTargets,
  publications,
  contentItems,
} from '@social-agent/core';
import { createWorker } from '../runtime.js';

// Minimal cron evaluator — supports simple "minute hour * * *" schedules.
// Returns the next firing instant strictly after `from`.
function nextCronFire(cron: string, from: Date): Date {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return new Date(from.getTime() + 60 * 60 * 1000);

  const [minPart, hourPart] = parts;
  const minutes = parseField(minPart!, 0, 59);
  const hours = parseField(hourPart!, 0, 23);

  const candidate = new Date(from);
  candidate.setSeconds(0, 0);
  candidate.setTime(candidate.getTime() + 60_000);

  for (let i = 0; i < 60 * 24 * 7; i++) {
    if (
      hours.includes(candidate.getHours()) &&
      minutes.includes(candidate.getMinutes())
    ) {
      return candidate;
    }
    candidate.setTime(candidate.getTime() + 60_000);
  }
  return new Date(from.getTime() + 60 * 60 * 1000);
}

function parseField(field: string, lo: number, hi: number): number[] {
  if (field === '*') {
    const out: number[] = [];
    for (let i = lo; i <= hi; i++) out.push(i);
    return out;
  }
  if (field.includes(',')) return field.split(',').flatMap((p) => parseField(p, lo, hi));
  if (field.includes('/')) {
    const [base, step] = field.split('/');
    const stepN = parseInt(step!, 10);
    const start = base === '*' ? lo : parseInt(base!, 10);
    const out: number[] = [];
    for (let i = start; i <= hi; i += stepN) out.push(i);
    return out;
  }
  if (field.includes('-')) {
    const [a, b] = field.split('-').map((n) => parseInt(n, 10));
    const out: number[] = [];
    for (let i = a!; i <= b!; i++) out.push(i);
    return out;
  }
  return [parseInt(field, 10)];
}

async function findNextSlot(campaignId: string, schedule: string): Promise<Date> {
  // Demo / "post immediately" cron — return now so publisher fires straight away.
  // Used by `pnpm demo` to make the pipeline visible end-to-end in a screencast.
  if (schedule.trim() === '* * * * *') return new Date();

  // Find the latest already-scheduled time for this campaign and start AFTER it.
  // This naturally rate-limits us to one post per cron fire.
  const latest = await db
    .select({ scheduledFor: contentItems.scheduledFor })
    .from(contentItems)
    .where(
      and(
        eq(contentItems.campaignId, campaignId),
        gte(contentItems.scheduledFor, new Date())
      )
    )
    .orderBy(asc(contentItems.scheduledFor))
    .limit(50);

  let cursor = new Date();
  for (const row of latest) {
    if (row.scheduledFor && row.scheduledFor.getTime() > cursor.getTime()) {
      cursor = row.scheduledFor;
    }
  }
  return nextCronFire(schedule, cursor);
}

export const schedulerWorker = createWorker({
  name: 'scheduler',
  inputState: 'ready_to_publish',
  process: async (item) => {
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, item.campaignId),
    });
    if (!campaign) throw new Error('campaign not found');

    const allTargets = await db
      .select()
      .from(publishingTargets)
      .where(
        and(
          eq(publishingTargets.campaignId, item.campaignId),
          eq(publishingTargets.active, true)
        )
      );

    if (allTargets.length === 0) {
      throw new Error('no active publishing targets for campaign');
    }

    // Apply campaign route_strategy. Group by platform, then pick.
    const byPlatform = new Map<string, typeof allTargets>();
    for (const t of allTargets) {
      const list = byPlatform.get(t.platform) ?? [];
      list.push(t);
      byPlatform.set(t.platform, list);
    }

    const targets: typeof allTargets = [];
    for (const [, group] of byPlatform) {
      if (group.length === 1 || campaign.routeStrategy === 'all') {
        targets.push(...group);
      } else if (campaign.routeStrategy === 'round_robin') {
        // Pick the least-recently-used in this group
        const sorted = [...group].sort((a, b) => {
          const aT = a.lastUsedAt?.getTime() ?? 0;
          const bT = b.lastUsedAt?.getTime() ?? 0;
          if (aT !== bT) return aT - bT;
          return a.postsCount - b.postsCount;
        });
        targets.push(sorted[0]!);
      } else if (campaign.routeStrategy === 'weighted') {
        // Weighted-random pick within the group
        const total = group.reduce((s, t) => s + t.weight, 0);
        let r = Math.random() * total;
        for (const t of group) {
          r -= t.weight;
          if (r <= 0) { targets.push(t); break; }
        }
      }
    }

    const slot = await findNextSlot(item.campaignId, campaign.postingSchedule);

    await db
      .update(contentItems)
      .set({ scheduledFor: slot })
      .where(eq(contentItems.id, item.id));

    for (const target of targets) {
      const caption =
        target.platform === 'instagram'
          ? item.captionInstagram
          : target.platform === 'tiktok'
            ? item.captionTiktok
            : item.captionInstagram;
      const hashtags =
        target.platform === 'instagram'
          ? (item.hashtagsInstagram ?? [])
          : (item.hashtagsTiktok ?? []);

      await db
        .insert(publications)
        .values({
          contentItemId: item.id,
          targetId: target.id,
          status: 'queued',
          scheduledFor: slot,
          caption,
          hashtags,
        })
        .onConflictDoNothing();

      // Track usage for round-robin / fairness
      await db
        .update(publishingTargets)
        .set({
          postsCount: target.postsCount + 1,
          lastUsedAt: new Date(),
        })
        .where(eq(publishingTargets.id, target.id));
    }

    return {
      nextState: 'scheduled',
      payload: { slot: slot.toISOString(), targets: targets.length, strategy: campaign.routeStrategy },
    };
  },
});
