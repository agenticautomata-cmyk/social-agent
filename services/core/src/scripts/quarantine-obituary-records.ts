#!/usr/bin/env -S pnpm exec tsx
/**
 * One-off remediation: find any active content_items whose title/script matches
 * the obituary hard gate but is still classified as a business opening, and
 * quarantine them (creatorValueStatus=rejected, contentCategory=obituary,
 * lifecycleStatus=archived). Does not delete anything — preserves source history.
 */
import { db } from '../db.js';
import { contentItems } from '../schema.js';
import { eq, or, ilike, sql } from 'drizzle-orm';
import { isObituaryOrDeathContent } from '../classification-guards/obituary-gate.js';

const candidates = await db
  .select({
    id: contentItems.id,
    topic: contentItems.topic,
    script: contentItems.script,
    metadata: contentItems.metadata,
    creatorValueStatus: contentItems.creatorValueStatus,
    contentCategory: contentItems.contentCategory,
    lifecycleStatus: contentItems.lifecycleStatus,
  })
  .from(contentItems)
  .where(
    or(
      sql`${contentItems.metadata}->>'opportunityCategory' LIKE '%opening%'`,
      ilike(contentItems.topic, '%obitu%'),
    ),
  );

let quarantined = 0;
for (const row of candidates) {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const businessName =
    (meta.metroOpenings as Record<string, unknown> | undefined)?.businessName ??
    (meta.businessOpenings as Record<string, unknown> | undefined)?.businessName ??
    null;
  const hit = isObituaryOrDeathContent(row.topic, row.script, typeof businessName === 'string' ? businessName : null);
  if (!hit) continue;
  if (row.creatorValueStatus === 'rejected' && row.contentCategory === 'obituary') continue;

  await db
    .update(contentItems)
    .set({
      creatorValueStatus: 'rejected',
      contentCategory: 'obituary',
      lifecycleStatus: 'archived',
      metadata: sql`${contentItems.metadata} || '{"obituaryGate":"quarantined_by_remediation_script"}'::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(contentItems.id, row.id));
  quarantined += 1;
  console.log(`Quarantined: ${row.id} — "${row.topic}"`);
}

console.log(`\nScanned ${candidates.length} candidate rows, quarantined ${quarantined}.`);
process.exit(0);
