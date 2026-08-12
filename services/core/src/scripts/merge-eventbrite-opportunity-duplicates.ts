#!/usr/bin/env -S pnpm exec tsx
/**
 * Merge duplicate Ask Benson / Eventbrite opportunities for the Aug 2026 manual adds.
 * Keeps the richest record (prefers canonical Eventbrite URL + userConfirmed metadata).
 */
import { eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  contentItems,
  creatorInterestRecords,
  creatorResearchJobs,
  creatorSkippedRecords,
} from '../schema.js';
import {
  extractEventbriteEventId,
  normalizeCanonicalEventUrl,
  normalizeOpportunityTitle,
  preferCanonicalSourceUrl,
} from '../ask-benson/url-intake-dedupe.js';

const TARGETS = [
  {
    titlePattern: 'conversations karaoke',
    eventDate: '2026-08-14',
    keeperHint: 'eventbrite.com/e/aura-cocktails',
  },
  {
    titlePattern: 'rock the bridge',
    eventDate: '2026-08-15',
    keeperHint: 'eventbrite.com',
  },
  {
    titlePattern: 'brushes beats',
    eventDate: '2026-08-15',
    keeperHint: 'eventbrite.com',
  },
];

function scoreRow(row: {
  sourceUrl: string | null;
  script: string | null;
  metadata: Record<string, unknown> | null;
  topic: string;
}): number {
  let score = 0;
  if (extractEventbriteEventId(row.sourceUrl ?? '')) score += 50;
  if (row.metadata?.userConfirmed) score += 20;
  if ((row.script ?? '').length > 80) score += 10;
  if ((row.sourceUrl ?? '').includes('eventbrite.com')) score += 15;
  return score;
}

async function reassignFk(fromId: string, toId: string) {
  await db
    .update(creatorInterestRecords)
    .set({ contentItemId: toId })
    .where(eq(creatorInterestRecords.contentItemId, fromId));
  await db
    .update(creatorResearchJobs)
    .set({ contentItemId: toId })
    .where(eq(creatorResearchJobs.contentItemId, fromId));
  await db
    .update(creatorSkippedRecords)
    .set({ contentItemId: toId })
    .where(eq(creatorSkippedRecords.contentItemId, fromId));
}

const rows = await db
  .select({
    id: contentItems.id,
    topic: contentItems.topic,
    sourceUrl: contentItems.sourceUrl,
    eventStartsAt: contentItems.eventStartsAt,
    locationName: contentItems.locationName,
    script: contentItems.script,
    metadata: contentItems.metadata,
    sourceExternalId: contentItems.sourceExternalId,
  })
  .from(contentItems)
  .where(
    sql`${contentItems.sourceExternalId} LIKE 'ask-benson-%'
        OR ${contentItems.metadata}->>'ingest' = 'ask_benson_link'`,
  );

const report: Array<Record<string, unknown>> = [];

for (const target of TARGETS) {
  const matches = rows.filter((row) => {
    const title = normalizeOpportunityTitle(row.topic);
    if (!title.includes(target.titlePattern)) return false;
    const date = row.eventStartsAt?.toISOString().slice(0, 10) ?? null;
    if (date && target.eventDate && date !== target.eventDate) return false;
    return true;
  });

  if (matches.length <= 1) {
    report.push({ target: target.titlePattern, status: matches.length === 1 ? 'ok_single' : 'missing', ids: matches.map((m) => m.id) });
    continue;
  }

  const ranked = [...matches].sort((a, b) => {
    const hintBoost = (url: string | null) => (url?.includes(target.keeperHint) ? 100 : 0);
    return (
      scoreRow({ ...b, metadata: (b.metadata ?? {}) as Record<string, unknown> }) +
      hintBoost(b.sourceUrl) -
      (scoreRow({ ...a, metadata: (a.metadata ?? {}) as Record<string, unknown> }) + hintBoost(a.sourceUrl))
    );
  });

  const keeper = ranked[0]!;
  const losers = ranked.slice(1);
  const keeperMeta = (keeper.metadata ?? {}) as Record<string, unknown>;
  const eventbriteEventId =
    (keeperMeta.eventbriteEventId as string | undefined) ??
    extractEventbriteEventId(keeper.sourceUrl ?? '') ??
    extractEventbriteEventId(losers.find((l) => l.sourceUrl)?.sourceUrl ?? '');

  let mergedScript = keeper.script;
  for (const loser of losers) {
    if (loser.script && (!mergedScript || loser.script.length > mergedScript.length)) {
      mergedScript = loser.script;
    }
  }

  await db
    .update(contentItems)
    .set({
      sourceUrl: preferCanonicalSourceUrl(keeper.sourceUrl, losers.find((l) => l.sourceUrl)?.sourceUrl ?? null),
      script: mergedScript,
      metadata: {
        ...keeperMeta,
        userConfirmed: true,
        eventbriteEventId: eventbriteEventId ?? keeperMeta.eventbriteEventId,
        canonicalEventUrl: normalizeCanonicalEventUrl(keeper.sourceUrl ?? '') ?? keeperMeta.canonicalEventUrl,
        mergedDuplicateIds: losers.map((l) => l.id),
      },
      sourceExternalId: eventbriteEventId
        ? `ask-benson-user-event-eb-${eventbriteEventId}`
        : keeper.sourceExternalId,
      updatedAt: new Date(),
    })
    .where(eq(contentItems.id, keeper.id));

  for (const loser of losers) {
    await reassignFk(loser.id, keeper.id);
    await db.delete(contentItems).where(eq(contentItems.id, loser.id));
  }

  report.push({
    target: target.titlePattern,
    status: 'merged',
    keeperId: keeper.id,
    deletedIds: losers.map((l) => l.id),
    topic: keeper.topic,
    sourceUrl: keeper.sourceUrl,
  });
}

console.log(JSON.stringify({ ok: true, report }, null, 2));
process.exit(0);
