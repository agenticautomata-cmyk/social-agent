/**
 * Safely repair Eventbrite Watchlist rows that collapsed to the homepage.
 * Preserves audit history (runs/snapshots/items) — only restores configured URL + status.
 *
 * Usage: pnpm --filter @social-agent/core exec tsx src/scripts/repair-eventbrite-watchlist-url.ts
 */
import { and, eq, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { sourceWatchers } from '../schema.js';
import { canonicalizeWatchSource } from '../benson-scout/canonical-source.js';
import { normalizeWatchlistUrl } from '../benson-scout/watchlist-url.js';

const KC_URL = 'https://www.eventbrite.com/d/mo--kansas-city/events/';

async function main() {
  const collapsed = await db
    .select()
    .from(sourceWatchers)
    .where(
      or(
        eq(sourceWatchers.sourceUrl, 'https://www.eventbrite.com'),
        eq(sourceWatchers.sourceUrl, 'https://www.eventbrite.com/'),
        sql`${sourceWatchers.submittedUrl} ILIKE ${'%eventbrite.com/d/%'}`,
        sql`${sourceWatchers.canonicalSourceUrl} ILIKE ${'%eventbrite.com/d/%'}`,
        sql`${sourceWatchers.sourceName} ILIKE ${'%Eventbrite%'}`,
      ),
    );

  const targets = collapsed.filter((row) => {
    const submitted = row.submittedUrl ?? '';
    const canonical = row.canonicalSourceUrl ?? '';
    const looksCollapsed =
      row.sourceUrl === 'https://www.eventbrite.com' ||
      row.sourceUrl === 'https://www.eventbrite.com/';
    const hadListing =
      /eventbrite\.com\/d\//i.test(submitted) ||
      /eventbrite\.com\/d\//i.test(canonical) ||
      /kansas.?city/i.test(row.sourceName);
    return looksCollapsed || hadListing || /eventbrite\.com\/d\//i.test(row.sourceUrl);
  });

  if (targets.length === 0) {
    console.log(JSON.stringify({ repaired: 0, message: 'No Eventbrite Watchlist rows needed repair.' }));
    return;
  }

  const repaired: Array<Record<string, unknown>> = [];
  const skipped: Array<Record<string, unknown>> = [];
  for (const row of targets) {
    let restoreUrl = KC_URL;
    for (const candidate of [row.submittedUrl, row.canonicalSourceUrl, row.sourceUrl]) {
      if (!candidate) continue;
      try {
        const n = normalizeWatchlistUrl(candidate);
        if (n.isEventbrite && !n.needsSetup) {
          restoreUrl = n.configuredUrl;
          break;
        }
      } catch {
        // ignore
      }
    }
    if (/kansas/i.test(row.sourceName) || /kansas-city/i.test(String(row.submittedUrl))) {
      restoreUrl = KC_URL;
    }

    // Already correct — do not rewrite health/config.
    try {
      const current = normalizeWatchlistUrl(row.sourceUrl);
      if (current.configuredUrl === restoreUrl && row.adapterType === 'eventbrite_directory') {
        skipped.push({ id: row.id, sourceUrl: row.sourceUrl, reason: 'already_correct' });
        continue;
      }
    } catch {
      // continue repair
    }

    const canonical = canonicalizeWatchSource(restoreUrl);
    const existingSameKey = await db
      .select({ id: sourceWatchers.id, sourceUrl: sourceWatchers.sourceUrl })
      .from(sourceWatchers)
      .where(and(eq(sourceWatchers.canonicalKey, canonical.key), sql`${sourceWatchers.id} <> ${row.id}`))
      .limit(1);
    if (existingSameKey[0]) {
      skipped.push({
        id: row.id,
        sourceUrl: row.sourceUrl,
        reason: 'canonical_key_owned_by',
        ownerId: existingSameKey[0].id,
        ownerUrl: existingSameKey[0].sourceUrl,
      });
      continue;
    }

    const priorConfig = (row.config ?? {}) as Record<string, unknown>;
    const nextConfig = {
      ...priorConfig,
      extractionMethod: 'eventbrite_directory',
      repairedAt: new Date().toISOString(),
      repairedFromSourceUrl: row.sourceUrl,
      statusExplanation:
        'Configured Kansas City Eventbrite listing restored. Run Re-run latest check to verify extraction.',
      suppressSchedule: false,
      needsSetup: false,
    };

    await db
      .update(sourceWatchers)
      .set({
        sourceUrl: restoreUrl,
        canonicalSourceUrl: restoreUrl,
        adapterType: 'eventbrite_directory',
        sourceCategory: 'event_directory',
        platform: 'web',
        canonicalKey: canonical.key,
        healthStatus: 'pending',
        paused: false,
        lastFailureMessage: null,
        config: nextConfig,
        updatedAt: new Date(),
      })
      .where(eq(sourceWatchers.id, row.id));

    repaired.push({
      id: row.id,
      before: row.sourceUrl,
      after: restoreUrl,
      submittedUrl: row.submittedUrl,
      canonicalKey: canonical.key,
    });
  }

  console.log(JSON.stringify({ repaired: repaired.length, skipped: skipped.length, rows: repaired, skippedRows: skipped }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
