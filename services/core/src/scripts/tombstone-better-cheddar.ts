#!/usr/bin/env -S pnpm exec tsx
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems } from '../schema.js';
import { skipDiscoveryRecord } from '../creator-skip/index.js';

const STALE_IDS = ['78f7bb01-47e0-4c14-9f02-e22f40c024c9'];

for (const contentItemId of STALE_IDS) {
  await skipDiscoveryRecord({ contentItemId, sourceScreen: 'unknown' }).catch(() => undefined);
}

await db
  .update(contentItems)
  .set({
    creatorValueStatus: 'archived',
    lifecycleStatus: 'archived',
    updatedAt: new Date(),
  })
  .where(inArray(contentItems.id, STALE_IDS));

const [row] = await db
  .select({ id: contentItems.id, topic: contentItems.topic, creatorValueStatus: contentItems.creatorValueStatus })
  .from(contentItems)
  .where(eq(contentItems.id, STALE_IDS[0]!))
  .limit(1);

console.log(JSON.stringify({ ok: true, archived: STALE_IDS, row }, null, 2));
process.exit(0);
