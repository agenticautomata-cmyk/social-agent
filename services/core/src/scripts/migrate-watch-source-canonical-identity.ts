#!/usr/bin/env tsx
/**
 * Migration 80 — watch-source canonical identity.
 *
 * 1. Applies 80_watch_source_canonical_identity.sql (adds `canonical_key` column).
 * 2. Backfills `canonical_key` for every existing source_watchers row using the same
 *    normalization logic the app now uses at write time (canonical-source.ts) — not
 *    duplicated SQL, so the two can never drift apart.
 * 3. Groups rows by canonical_key. For any group with more than one row:
 *      - picks a keeper (healthiest / most-recently-successful row)
 *      - reassigns every FK-referencing child row (scout_items, scout_source_runs,
 *        source_snapshots, scout_social_sessions, curator_social_posts,
 *        curator_event_leads, curator_reliability_stats, url_watch_rules,
 *        early_signals) from the losing id(s) to the keeper id
 *      - deletes the now-empty loser source_watchers rows
 * 4. Adds the UNIQUE index on canonical_key (safe now that duplicates are gone).
 *
 * Usage:
 *   tsx src/scripts/migrate-watch-source-canonical-identity.ts           (dry run)
 *   tsx src/scripts/migrate-watch-source-canonical-identity.ts --apply   (apply)
 */
import postgres from 'postgres';
import { eq, inArray, sql as dsql } from 'drizzle-orm';
import { env } from '../env.js';
import { applyMigrationFile } from './migration-runner.js';
import { db } from '../db.js';
import {
  sourceWatchers,
  scoutItems,
  scoutSourceRuns,
  sourceSnapshots,
  scoutSocialSessions,
  curatorSocialPosts,
  curatorEventLeads,
  curatorReliabilityStats,
  urlWatchRules,
  earlySignals,
} from '../schema.js';
import { canonicalizeWatchSource } from '../benson-scout/canonical-source.js';

const apply = process.argv.includes('--apply');

async function main() {
  const raw = postgres(env.DATABASE_URL, { max: 1 });
  try {
    await applyMigrationFile(raw, {
      id: '80',
      file: '80_watch_source_canonical_identity.sql',
      label: 'Watch-source canonical identity (column only)',
      requires: ['source_watchers', 'benson_data_revisions'],
      priorCommand: 'pnpm migrate:benson-scout',
    });
  } finally {
    await raw.end();
  }

  const rows = await db.select().from(sourceWatchers);
  console.log(`Loaded ${rows.length} source_watchers rows (mode: ${apply ? 'APPLY' : 'DRY RUN'})`);

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const canonical = canonicalizeWatchSource(row.canonicalSourceUrl ?? row.sourceUrl);
    const list = groups.get(canonical.key) ?? [];
    list.push(row);
    groups.set(canonical.key, list);
  }

  let duplicateGroups = 0;
  let rowsDeleted = 0;
  const report: Array<{
    canonicalKey: string;
    keeperId: string;
    keeperCreatedAt: string;
    duplicateIds: string[];
  }> = [];

  for (const [canonicalKey, members] of groups) {
    if (members.length === 1) {
      if (apply) {
        await db
          .update(sourceWatchers)
          .set({ canonicalKey })
          .where(eq(sourceWatchers.id, members[0]!.id));
      }
      continue;
    }

    duplicateGroups += 1;
    // Keeper: prefer a row that has actually completed a successful check, then the
    // most recently updated row, so we retain the "latest healthy configuration".
    const sorted = [...members].sort((a, b) => {
      const aHealthy = a.lastSuccessfulCheck ? 1 : 0;
      const bHealthy = b.lastSuccessfulCheck ? 1 : 0;
      if (aHealthy !== bHealthy) return bHealthy - aHealthy;
      const aTime = (a.lastSuccessfulCheck ?? a.updatedAt ?? a.createdAt).getTime();
      const bTime = (b.lastSuccessfulCheck ?? b.updatedAt ?? b.createdAt).getTime();
      return bTime - aTime;
    });
    const keeper = sorted[0]!;
    const losers = sorted.slice(1);
    const loserIds = losers.map((l) => l.id);

    console.log(
      `\nDuplicate group "${canonicalKey}" — ${members.length} rows. Keeper: ${keeper.id} ` +
        `(created ${keeper.createdAt.toISOString()}, lastSuccessfulCheck=${keeper.lastSuccessfulCheck?.toISOString() ?? 'never'}). ` +
        `Removing: ${loserIds.join(', ')}`,
    );

    report.push({
      canonicalKey,
      keeperId: keeper.id,
      keeperCreatedAt: keeper.createdAt.toISOString(),
      duplicateIds: loserIds,
    });

    if (!apply) continue;

    // Reassign FK-referencing history to the keeper before deleting losers.
    await db.update(scoutItems).set({ watcherId: keeper.id }).where(inArray(scoutItems.watcherId, loserIds));
    await db
      .update(scoutSourceRuns)
      .set({ watcherId: keeper.id })
      .where(inArray(scoutSourceRuns.watcherId, loserIds));
    await db
      .update(sourceSnapshots)
      .set({ watcherId: keeper.id })
      .where(inArray(sourceSnapshots.watcherId, loserIds));
    await db
      .update(scoutSocialSessions)
      .set({ watcherId: keeper.id })
      .where(inArray(scoutSocialSessions.watcherId, loserIds));
    await db
      .update(urlWatchRules)
      .set({ watcherId: keeper.id })
      .where(inArray(urlWatchRules.watcherId, loserIds));
    await db
      .update(earlySignals)
      .set({ watcherId: keeper.id })
      .where(inArray(earlySignals.watcherId, loserIds));

    // These two have a UNIQUE(watcher_id, fingerprint) constraint — reassign row by row
    // and fall back to deleting the loser's copy if the keeper already has an equivalent.
    for (const loserId of loserIds) {
      const posts = await db.select().from(curatorSocialPosts).where(eq(curatorSocialPosts.watcherId, loserId));
      for (const post of posts) {
        try {
          await db.update(curatorSocialPosts).set({ watcherId: keeper.id }).where(eq(curatorSocialPosts.id, post.id));
        } catch {
          console.warn(`  curator_social_posts ${post.id} already exists under keeper — deleting duplicate`);
          await db.delete(curatorSocialPosts).where(eq(curatorSocialPosts.id, post.id));
        }
      }
      const leads = await db.select().from(curatorEventLeads).where(eq(curatorEventLeads.watcherId, loserId));
      for (const lead of leads) {
        try {
          await db.update(curatorEventLeads).set({ watcherId: keeper.id }).where(eq(curatorEventLeads.id, lead.id));
        } catch {
          console.warn(`  curator_event_leads ${lead.id} already exists under keeper — deleting duplicate`);
          await db.delete(curatorEventLeads).where(eq(curatorEventLeads.id, lead.id));
        }
      }
    }

    // curator_reliability_stats.watcher_id is itself the primary key — merge counters
    // into the keeper's row (creating one if the keeper never had one) then drop losers'.
    const loserStats = await db
      .select()
      .from(curatorReliabilityStats)
      .where(inArray(curatorReliabilityStats.watcherId, loserIds));
    if (loserStats.length > 0) {
      const [keeperStats] = await db
        .select()
        .from(curatorReliabilityStats)
        .where(eq(curatorReliabilityStats.watcherId, keeper.id));
      const totals = loserStats.reduce(
        (acc, s) => ({
          leadsExtracted: acc.leadsExtracted + s.leadsExtracted,
          leadsVerified: acc.leadsVerified + s.leadsVerified,
          leadsPartiallyVerified: acc.leadsPartiallyVerified + s.leadsPartiallyVerified,
          leadsConflicted: acc.leadsConflicted + s.leadsConflicted,
          leadsExpired: acc.leadsExpired + s.leadsExpired,
          acceptedCount: acc.acceptedCount + s.acceptedCount,
          coveredCount: acc.coveredCount + s.coveredCount,
          postsProcessed: acc.postsProcessed + s.postsProcessed,
          slidesProcessed: acc.slidesProcessed + s.slidesProcessed,
        }),
        keeperStats ?? {
          leadsExtracted: 0,
          leadsVerified: 0,
          leadsPartiallyVerified: 0,
          leadsConflicted: 0,
          leadsExpired: 0,
          acceptedCount: 0,
          coveredCount: 0,
          postsProcessed: 0,
          slidesProcessed: 0,
        },
      );
      if (keeperStats) {
        await db
          .update(curatorReliabilityStats)
          .set({ ...totals, updatedAt: new Date() })
          .where(eq(curatorReliabilityStats.watcherId, keeper.id));
      } else {
        await db.insert(curatorReliabilityStats).values({ watcherId: keeper.id, ...totals });
      }
      await db
        .delete(curatorReliabilityStats)
        .where(inArray(curatorReliabilityStats.watcherId, loserIds));
    }

    await db.delete(sourceWatchers).where(inArray(sourceWatchers.id, loserIds));
    rowsDeleted += loserIds.length;

    await db.update(sourceWatchers).set({ canonicalKey }).where(eq(sourceWatchers.id, keeper.id));
  }

  console.log(
    `\n${apply ? 'Applied' : 'Would apply'}: duplicate groups=${duplicateGroups} rows removed=${apply ? rowsDeleted : report.reduce((n, g) => n + g.duplicateIds.length, 0)}`,
  );

  if (apply) {
    const rawFinal = postgres(env.DATABASE_URL, { max: 1 });
    try {
      console.log('Adding UNIQUE constraint on canonical_key...');
      await rawFinal.unsafe(`
        DROP INDEX IF EXISTS idx_source_watchers_canonical_key_lookup;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_source_watchers_canonical_key_unique
          ON source_watchers (canonical_key)
          WHERE canonical_key IS NOT NULL;
      `);
      console.log('  ✓ unique index in place');
    } finally {
      await rawFinal.end();
    }
  } else {
    console.log('\nDry run — re-run with --apply to merge duplicates and add the unique index.');
  }

  console.log('\n=== Duplicate group report ===');
  console.log(JSON.stringify(report, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
