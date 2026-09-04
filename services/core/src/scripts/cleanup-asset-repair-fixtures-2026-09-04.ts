/**
 * One-shot cleanup for verified 2026-09-03 assignment-repair test fixtures.
 *
 * - Archives confirmed test assets out of the normal library
 * - Revokes public access on fixture-contaminated kit versions (history retained)
 * - Does NOT touch Kellie's real asset b5831e43 / 37436.jpg
 * - Writes a recoverable backup + manifest before mutating
 *
 * Usage (from repo root, against live DATABASE_URL):
 *   pnpm --filter @social-agent/core exec tsx src/scripts/cleanup-asset-repair-fixtures-2026-09-04.ts
 * Dry run:
 *   DRY_RUN=1 pnpm --filter @social-agent/core exec tsx src/scripts/cleanup-asset-repair-fixtures-2026-09-04.ts
 */

import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { eq, inArray, sql } from 'drizzle-orm';

import { db } from '../db.js';
import {
  creatorAssets,
  mediaKitAssetAssignments,
  mediaKitVersions,
  mediaKits,
} from '../schema.js';
import { archiveCreatorAsset } from '../creator-assets/assets.js';
import {
  revokeMediaKitVersionPublicAccess,
  isMediaKitVersionPublicAccessRevoked,
} from '../media-kit/versions.js';

const KELLIE_REAL_ASSET_ID = 'b5831e43-2012-4bbb-953f-8fcfa01a8076';

const FIXTURE_ASSET_IDS = [
  '7f259542-b134-4889-841c-9dd15add4c81',
  'a2743ce6-36fe-4036-9b28-60c11e32ae1d',
  '0dfb372e-8165-4abc-813d-9e7c0f8bfb5f',
] as const;

const CONTAMINATED_VERSION_IDS = [
  'ed3ed2ee-1aea-4f9b-95d2-2cac9a4cc09a', // destination v2 — 7f259542
  'e348cb0b-467f-485a-838a-915bdaad0c0d', // destination v4 — a2743ce6
  '6318b089-867a-4d32-8458-e43e951f2602', // hotel v7 — Kellie + a2743ce6
  'dc592c99-5776-42bf-bce9-156ab6f3a02f', // hotel v8 — Kellie + a2743ce6
] as const;

function pdfRoot(): string {
  return (
    process.env.MEDIA_KIT_PDF_DIR?.trim() || join(process.cwd(), 'uploads', 'media-kit-pdfs')
  );
}

async function main() {
  const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  // Prefer repo-root docs/ops when cwd is services/core
  const repoBackup = join(
    process.cwd().endsWith('services/core')
      ? join(process.cwd(), '..', '..')
      : process.cwd(),
    'docs',
    'ops',
    'backups',
    `asset-fixture-cleanup-${stamp}`,
  );

  await mkdir(repoBackup, { recursive: true });

  const assets = await db
    .select()
    .from(creatorAssets)
    .where(inArray(creatorAssets.id, [...FIXTURE_ASSET_IDS]));

  const kellie = await db
    .select()
    .from(creatorAssets)
    .where(eq(creatorAssets.id, KELLIE_REAL_ASSET_ID))
    .limit(1);

  const versions = await db
    .select()
    .from(mediaKitVersions)
    .where(inArray(mediaKitVersions.id, [...CONTAMINATED_VERSION_IDS]));

  const assignments = await db
    .select()
    .from(mediaKitAssetAssignments)
    .where(inArray(mediaKitAssetAssignments.creatorAssetId, [...FIXTURE_ASSET_IDS, KELLIE_REAL_ASSET_ID]));

  // Pitch pin conflict check
  const pinCheck = await db.execute(sql`
    SELECT id::text, approved_media_kit_version_id::text
    FROM outreach_emails
    WHERE approved_media_kit_version_id IN (
      'ed3ed2ee-1aea-4f9b-95d2-2cac9a4cc09a'::uuid,
      'e348cb0b-467f-485a-838a-915bdaad0c0d'::uuid,
      '6318b089-867a-4d32-8458-e43e951f2602'::uuid,
      'dc592c99-5776-42bf-bce9-156ab6f3a02f'::uuid
    )
  `);
  const pinRows = (
    Array.isArray(pinCheck) ? pinCheck : ((pinCheck as { rows: unknown[] }).rows ?? [])
  ) as Array<{ id: string; approved_media_kit_version_id: string }>;

  if (pinRows.length > 0) {
    console.error('STOP: contaminated versions are pinned by outreach_emails:', pinRows);
    process.exit(2);
  }

  // Verify provenance — refuse if IDs don't match expected filenames / states
  const expectedNames: Record<string, RegExp> = {
    '7f259542-b134-4889-841c-9dd15add4c81': /test-asset-assignment-2026-09-03/i,
    'a2743ce6-36fe-4036-9b28-60c11e32ae1d': /asset-repair-review-2026-09-03-fixture/i,
    '0dfb372e-8165-4abc-813d-9e7c0f8bfb5f': /asset-repair-review-2026-09-03-pending/i,
  };
  for (const asset of assets) {
    const re = expectedNames[asset.id];
    if (!re || !re.test(asset.originalFilename ?? '')) {
      console.error('STOP: asset provenance mismatch', asset.id, asset.originalFilename);
      process.exit(2);
    }
    if (asset.id === KELLIE_REAL_ASSET_ID) {
      console.error('STOP: refused to archive Kellie real asset');
      process.exit(2);
    }
  }
  if (assets.length !== FIXTURE_ASSET_IDS.length) {
    console.error('STOP: expected', FIXTURE_ASSET_IDS.length, 'fixture assets, found', assets.length);
    process.exit(2);
  }
  if (versions.length !== CONTAMINATED_VERSION_IDS.length) {
    console.error('STOP: expected', CONTAMINATED_VERSION_IDS.length, 'versions, found', versions.length);
    process.exit(2);
  }

  const currentKits = await db
    .select({
      id: mediaKits.id,
      webSlug: mediaKits.webSlug,
      version: mediaKits.version,
      currentVersionId: mediaKits.currentVersionId,
    })
    .from(mediaKits)
    .where(inArray(mediaKits.webSlug, ['kellie-hotel', 'kellie-destination', 'kellie-restaurant']));

  for (const kit of currentKits) {
    if (kit.currentVersionId && CONTAMINATED_VERSION_IDS.includes(kit.currentVersionId as (typeof CONTAMINATED_VERSION_IDS)[number])) {
      console.error('STOP: contaminated version is still the live current pointer', kit);
      process.exit(2);
    }
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    dryRun,
    backupPath: repoBackup,
    kellieRealAsset: kellie[0]
      ? {
          id: kellie[0].id,
          role: kellie[0].role,
          publicUseState: kellie[0].publicUseState,
          originalFilename: kellie[0].originalFilename,
        }
      : null,
    targets: {
      archiveAssetIds: [...FIXTURE_ASSET_IDS],
      revokeVersionIds: [...CONTAMINATED_VERSION_IDS],
    },
    before: {
      assets,
      versions: versions.map((v) => ({
        id: v.id,
        webSlug: v.webSlug,
        versionNumber: v.versionNumber,
        notes: v.notes,
        pdfStorageFilename: v.pdfStorageFilename,
        revoked: isMediaKitVersionPublicAccessRevoked(v.notes),
      })),
      assignments,
      currentKits,
      outreachPins: pinRows,
    },
  };

  await writeFile(join(repoBackup, 'manifest-before.json'), JSON.stringify(manifest, null, 2));

  // Copy PDFs for audit
  for (const v of versions) {
    if (!v.pdfStorageFilename) continue;
    try {
      await copyFile(join(pdfRoot(), v.pdfStorageFilename), join(repoBackup, v.pdfStorageFilename));
    } catch (err) {
      await writeFile(
        join(repoBackup, `${v.pdfStorageFilename}.missing.txt`),
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  if (dryRun) {
    console.log(JSON.stringify({ ok: true, dryRun: true, backupPath: repoBackup }, null, 2));
    return;
  }

  const archived: string[] = [];
  for (const id of FIXTURE_ASSET_IDS) {
    await archiveCreatorAsset(id);
    archived.push(id);
  }

  const revoked: Array<{ id: string; alreadyRevoked: boolean }> = [];
  for (const versionId of CONTAMINATED_VERSION_IDS) {
    const result = await revokeMediaKitVersionPublicAccess({
      versionId,
      reason: 'test_fixture_cleanup_2026-09-04',
    });
    if (!result.ok) {
      console.error('STOP: revoke failed', versionId, result.error);
      process.exit(2);
    }
    revoked.push({ id: versionId, alreadyRevoked: result.alreadyRevoked });
  }

  const afterAssets = await db
    .select({
      id: creatorAssets.id,
      publicUseState: creatorAssets.publicUseState,
      originalFilename: creatorAssets.originalFilename,
    })
    .from(creatorAssets)
    .where(inArray(creatorAssets.id, [...FIXTURE_ASSET_IDS, KELLIE_REAL_ASSET_ID]));

  const afterVersions = await db
    .select({
      id: mediaKitVersions.id,
      webSlug: mediaKitVersions.webSlug,
      versionNumber: mediaKitVersions.versionNumber,
      notes: mediaKitVersions.notes,
    })
    .from(mediaKitVersions)
    .where(inArray(mediaKitVersions.id, [...CONTAMINATED_VERSION_IDS]));

  const afterKellieAssign = await db
    .select()
    .from(mediaKitAssetAssignments)
    .where(eq(mediaKitAssetAssignments.creatorAssetId, KELLIE_REAL_ASSET_ID));

  const after = {
    archived,
    revoked,
    afterAssets,
    afterVersions,
    afterKellieAssign,
  };
  await writeFile(join(repoBackup, 'manifest-after.json'), JSON.stringify(after, null, 2));

  console.log(
    JSON.stringify(
      {
        ok: true,
        backupPath: repoBackup,
        archived,
        revoked,
        kellieUntouched: afterAssets.find((a) => a.id === KELLIE_REAL_ASSET_ID)?.publicUseState === 'approved_public_use',
        kellieAssignmentCount: afterKellieAssign.length,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
