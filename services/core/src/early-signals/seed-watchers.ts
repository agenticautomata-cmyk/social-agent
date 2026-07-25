import { db } from '../db.js';
import { sourceWatchers } from '../schema.js';
import { eq, inArray } from 'drizzle-orm';
import {
  ACTIVE_KC_SOURCES,
  DEFAULT_KC_WATCHERS,
  REJECTED_SOURCE_URLS,
} from './source-catalog.js';

export { DEFAULT_KC_WATCHERS, ACTIVE_KC_SOURCES } from './source-catalog.js';

export async function seedDefaultWatchers(): Promise<{
  created: number;
  updated: number;
  skipped: number;
  disabled: number;
}> {
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let disabled = 0;

  for (const row of ACTIVE_KC_SOURCES) {
    const existing = await db
      .select()
      .from(sourceWatchers)
      .where(eq(sourceWatchers.sourceUrl, row.sourceUrl))
      .limit(1);

    if (existing[0]) {
      await db
        .update(sourceWatchers)
        .set({
          sourceName: row.sourceName,
          sourceCategory: row.sourceCategory,
          adapterType: row.adapterType,
          checkFrequencyMs: row.checkFrequencyMs,
          config: row.config ?? {},
          enabled: true,
          healthStatus: 'unknown',
          updatedAt: new Date(),
        })
        .where(eq(sourceWatchers.id, existing[0].id));
      updated += 1;
      continue;
    }

    await db.insert(sourceWatchers).values({
      sourceName: row.sourceName,
      sourceUrl: row.sourceUrl,
      sourceCategory: row.sourceCategory,
      adapterType: row.adapterType,
      checkFrequencyMs: row.checkFrequencyMs,
      config: row.config ?? {},
      enabled: true,
      healthStatus: 'unknown',
    });
    created += 1;
  }

  const rejectUrls = REJECTED_SOURCE_URLS.map((r) => r.url);
  if (rejectUrls.length) {
    const rejected = await db
      .update(sourceWatchers)
      .set({
        enabled: false,
        healthStatus: 'disabled',
        lastFailureMessage: 'URL rejected during source research — see source catalog',
        updatedAt: new Date(),
      })
      .where(inArray(sourceWatchers.sourceUrl, rejectUrls))
      .returning({ id: sourceWatchers.id });
    disabled = rejected.length;
  }

  // Disable legacy Crossroads URL if still present under old name
  const legacy = await db
    .update(sourceWatchers)
    .set({
      enabled: false,
      healthStatus: 'disabled',
      lastFailureMessage: 'Replaced by kccrossroads.org/events/',
      updatedAt: new Date(),
    })
    .where(eq(sourceWatchers.sourceUrl, 'https://crossroadskc.org/events/'))
    .returning({ id: sourceWatchers.id });
  disabled += legacy.length;

  skipped = 0;
  return { created, updated, skipped, disabled };
}
