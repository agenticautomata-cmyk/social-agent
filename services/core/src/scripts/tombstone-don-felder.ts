#!/usr/bin/env -S pnpm exec tsx
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems } from '../schema.js';
import { skipDiscoveryRecord } from '../creator-skip/index.js';

const FELDER_IDS = [
  '675e5d0c-aef5-4ebf-a750-f4db1ac1c1fc',
  'ffbe10a8-4b74-42c5-8a6a-736512374aad',
];

for (const contentItemId of FELDER_IDS) {
  await skipDiscoveryRecord({ contentItemId, sourceScreen: 'unknown' }).catch(() => undefined);
}

await db
  .update(contentItems)
  .set({
    creatorValueStatus: 'archived',
    lifecycleStatus: 'archived',
    updatedAt: new Date(),
  })
  .where(inArray(contentItems.id, FELDER_IDS));

console.log(JSON.stringify({ ok: true, archived: FELDER_IDS }, null, 2));
process.exit(0);
