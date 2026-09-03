/**
 * Generates Kellie's media kits from live analytics and flags the test artifacts.
 *
 * Idempotent: one row per variant, refreshed in place, so links already sent keep
 * working and always show current numbers.
 */
import { eq, sql } from 'drizzle-orm';

import { db } from '../db.js';
import { mediaKits } from '../schema.js';
import {
  MEDIA_KIT_VARIANTS,
  buildMediaKitContent,
  persistMediaKit,
  type MediaKitVariant,
} from '../media-kit/build.js';

const dryRun = process.argv.includes('--dry-run');

async function flagTestArtifacts(): Promise<void> {
  // "Test Kit" has no file at all and "Upload Test" is a 69-byte PNG. Both are test
  // artifacts; neither should ever be attachable to a pitch. They are flagged rather
  // than deleted so the history stays intact.
  const rows = await db
    .select({
      id: mediaKits.id,
      name: mediaKits.name,
      fileSize: mediaKits.fileSize,
      kitKind: mediaKits.kitKind,
      isTestArtifact: mediaKits.isTestArtifact,
    })
    .from(mediaKits);

  for (const row of rows) {
    if (row.kitKind !== 'uploaded') continue;
    const tiny = (row.fileSize ?? 0) < 8 * 1024;
    const namedTest = /\b(test|sample|placeholder|dummy)\b/i.test(row.name ?? '');
    if (!tiny && !namedTest) continue;
    console.log(
      `  flagging "${row.name}" as a test artifact (${row.fileSize ?? 0} bytes)${
        dryRun ? ' [dry run]' : ''
      }`,
    );
    if (dryRun) continue;
    await db
      .update(mediaKits)
      .set({ isTestArtifact: true, active: false, updatedAt: new Date() })
      .where(eq(mediaKits.id, row.id));
  }
}

async function detachTestArtifactsFromPitches(): Promise<void> {
  // 60 queued pitches attached the 69-byte PNG. Detaching leaves the pitch intact and
  // lets the readiness gate report the missing media kit honestly instead of shipping
  // a broken attachment.
  const result = await db.execute(sql`
    SELECT count(*) AS affected
    FROM outreach_emails e
    JOIN media_kits m ON m.id = e.media_kit_id
    WHERE m.is_test_artifact = true
  `);
  const rows = (Array.isArray(result) ? result : ((result as { rows: unknown[] }).rows ?? [])) as
    Array<{ affected: string | number }>;
  const affected = Number(rows[0]?.affected ?? 0);
  console.log(`  ${affected} pitch(es) reference a test-artifact media kit${dryRun ? ' [dry run]' : ''}`);
  if (dryRun || affected === 0) return;

  await db.execute(sql`
    UPDATE outreach_emails e
    SET media_kit_id = NULL, updated_at = now()
    FROM media_kits m
    WHERE m.id = e.media_kit_id AND m.is_test_artifact = true
  `);
}

async function main(): Promise<void> {
  console.log(dryRun ? 'Media kit build (dry run)\n' : 'Media kit build\n');

  console.log('Test artifacts:');
  await flagTestArtifacts();
  await detachTestArtifactsFromPitches();

  console.log('\nGenerating kits from live analytics:');
  for (const variant of MEDIA_KIT_VARIANTS as readonly MediaKitVariant[]) {
    const built = await buildMediaKitContent({ variant });
    if (!built.ok) {
      console.log(`  ${variant}: BLOCKED`);
      for (const reason of built.missing) console.log(`      ${reason}`);
      continue;
    }
    const audience = built.content.audience;
    if (dryRun) {
      console.log(
        `  ${variant}: would build — ${audience.followersCount?.toLocaleString('en-US')} followers, ${built.content.examples.length} examples`,
      );
      continue;
    }
    const saved = await persistMediaKit(built.content);
    console.log(
      `  ${variant}: ${saved.webUrl} (${audience.followersCount?.toLocaleString('en-US')} followers, ${built.content.examples.length} examples)`,
    );
  }
}

void main();
