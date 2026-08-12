#!/usr/bin/env -S pnpm exec tsx
// One-off: persist an always_ignore mute policy on the KC Library Events source so
// routine library programming stays hidden across future ingestion runs, and quarantine
// any already-active KC library content items that aren't major-event exceptions.
import { db } from '../db.js';
import { contentItems, sources } from '../schema.js';
import { eq, and, ne } from 'drizzle-orm';
import { setSourceMutePolicy } from '../source-ingestion/registry.js';
import { evaluateSourceMute } from '../source-ingestion/mute-policy.js';

const libSource = await db.query.sources.findFirst({ where: eq(sources.type, 'kc_library') });
if (!libSource) {
  console.log('No kc_library source found.');
  process.exit(0);
}

const updated = await setSourceMutePolicy(libSource.id, 'always_ignore', 'prospect-demo-readiness-2026-08-01');
console.log(`Set mutePolicy=always_ignore on source ${updated.id} (${updated.name})`);

const rows = await db
  .select({
    id: contentItems.id,
    topic: contentItems.topic,
    script: contentItems.script,
    creatorValueStatus: contentItems.creatorValueStatus,
    lifecycleStatus: contentItems.lifecycleStatus,
  })
  .from(contentItems)
  .where(
    and(eq(contentItems.sourceId, libSource.id), ne(contentItems.lifecycleStatus, 'archived')),
  );

let quarantined = 0;
let exceptions = 0;
for (const row of rows) {
  const decision = evaluateSourceMute(updated.config, `${row.topic ?? ''} ${row.script ?? ''}`);
  if (decision.muted && row.creatorValueStatus !== 'hidden_raw_signal' && row.creatorValueStatus !== 'archived' && row.creatorValueStatus !== 'rejected') {
    await db
      .update(contentItems)
      .set({
        creatorValueStatus: 'hidden_raw_signal',
        contentCategory: 'muted_source',
        creatorRelevanceExplanation: [decision.reason],
        updatedAt: new Date(),
      })
      .where(eq(contentItems.id, row.id));
    quarantined++;
  } else if (!decision.muted) {
    exceptions++;
    console.log(`  exception kept visible: ${row.topic}`);
  }
}

console.log(`Checked ${rows.length} active kc_library items. Quarantined ${quarantined}. Major-event exceptions: ${exceptions}.`);
process.exit(0);
