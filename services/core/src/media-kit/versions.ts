/**
 * Immutable media-kit versions.
 *
 * Regenerating a kit creates a new version row; prior approvals pin version id +
 * content hash so public content cannot drift after Kellie approved a pitch.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { desc, eq, sql } from 'drizzle-orm';

import { db } from '../db.js';
import { mediaKits, mediaKitVersions, type MediaKitVersion } from '../schema.js';
import {
  buildMediaKitContent,
  mediaKitSlug,
  mediaKitWebUrl,
  type MediaKitContent,
  type MediaKitVariant,
} from './build.js';
import { mediaKitContentHash } from './content-hash.js';
import { renderMediaKitPdf } from './pdf.js';

function pdfRoot(): string {
  return (
    process.env.MEDIA_KIT_PDF_DIR?.trim() || join(process.cwd(), 'uploads', 'media-kit-pdfs')
  );
}

export type PersistVersionedMediaKitResult = {
  kitId: string;
  versionId: string;
  versionNumber: number;
  contentHash: string;
  slug: string;
  webUrl: string;
  versionWebUrl: string;
  pdfFilename: string | null;
};

function layerForVariant(variant: MediaKitVariant): string {
  if (variant === 'core') return 'profile';
  return 'business_specific';
}

/**
 * Builds content, writes an immutable version, updates the kit pointer, and writes PDF.
 */
export async function persistVersionedMediaKit(input: {
  variant: MediaKitVariant;
  contactEmail?: string | null;
  generatedBy?: string;
  notes?: string | null;
}): Promise<
  | { ok: true; result: PersistVersionedMediaKitResult; content: MediaKitContent }
  | { ok: false; missing: string[] }
> {
  const built = await buildMediaKitContent({
    variant: input.variant,
    contactEmail: input.contactEmail,
  });
  if (!built.ok) return built;

  const content = built.content;
  const contentHash = mediaKitContentHash(content);
  const slug = mediaKitSlug(content.variant);

  const existing = await db
    .select({
      id: mediaKits.id,
      currentContentHash: mediaKits.currentContentHash,
      currentVersionId: mediaKits.currentVersionId,
    })
    .from(mediaKits)
    .where(eq(mediaKits.webSlug, slug))
    .limit(1);

  let kitId: string;
  if (existing[0]) {
    kitId = existing[0].id;
    // Same content — reuse version rather than inventing a duplicate.
    if (existing[0].currentContentHash === contentHash && existing[0].currentVersionId) {
      const version = await getMediaKitVersion(existing[0].currentVersionId);
      if (version) {
        return {
          ok: true,
          content,
          result: {
            kitId,
            versionId: version.id,
            versionNumber: version.versionNumber,
            contentHash,
            slug,
            webUrl: mediaKitWebUrl(slug),
            versionWebUrl: mediaKitVersionWebUrl(slug, version.versionNumber),
            pdfFilename: version.pdfStorageFilename,
          },
        };
      }
    }
  } else {
    const name =
      content.variant === 'core'
        ? 'Kellie — media kit'
        : `Kellie — media kit (${content.variant})`;
    const inserted = await db
      .insert(mediaKits)
      .values({
        name,
        description: content.headline,
        targetAudience: content.variant,
        kitKind: content.variant === 'core' ? 'generated_core' : 'generated_business',
        businessVariant: content.variant,
        webSlug: slug,
        analyticsSnapshot: content as unknown as Record<string, unknown>,
        analyticsCapturedAt: content.audience.lastSyncedAt
          ? new Date(content.audience.lastSyncedAt)
          : new Date(),
        generatedAt: new Date(),
        isTestArtifact: false,
        active: true,
      })
      .returning({ id: mediaKits.id });
    kitId = inserted[0]!.id;
  }

  const nextNumberRows = await db.execute(sql`
    SELECT coalesce(max(version_number), 0) + 1 AS next
    FROM media_kit_versions
    WHERE media_kit_id = ${kitId}::uuid
  `);
  const nextRows = (
    Array.isArray(nextNumberRows) ? nextNumberRows : ((nextNumberRows as { rows: unknown[] }).rows ?? [])
  ) as Array<{ next: number | string }>;
  const versionNumber = Number(nextRows[0]?.next ?? 1);

  // Write PDF for this immutable version.
  let pdfFilename: string | null = null;
  try {
    const root = pdfRoot();
    await mkdir(root, { recursive: true });
    pdfFilename = `${slug}-v${versionNumber}.pdf`;
    await writeFile(join(root, pdfFilename), renderMediaKitPdf(content));
  } catch {
    pdfFilename = null;
  }

  const versionRows = await db
    .insert(mediaKitVersions)
    .values({
      mediaKitId: kitId,
      versionNumber,
      contentHash,
      contentSnapshot: content as unknown as Record<string, unknown>,
      webSlug: slug,
      pdfStorageFilename: pdfFilename,
      pdfGeneratedAt: pdfFilename ? new Date() : null,
      layer: layerForVariant(content.variant),
      businessVariant: content.variant,
      generatedAt: new Date(content.generatedAt),
      generatedBy: input.generatedBy ?? 'benson',
      notes: input.notes ?? null,
    })
    .returning();

  const version = versionRows[0]!;

  await db
    .update(mediaKits)
    .set({
      name:
        content.variant === 'core'
          ? 'Kellie — media kit'
          : `Kellie — media kit (${content.variant})`,
      description: content.headline,
      analyticsSnapshot: content as unknown as Record<string, unknown>,
      analyticsCapturedAt: content.audience.lastSyncedAt
        ? new Date(content.audience.lastSyncedAt)
        : new Date(),
      generatedAt: new Date(),
      currentVersionId: version.id,
      currentContentHash: contentHash,
      version: String(versionNumber),
      isTestArtifact: false,
      active: true,
      updatedAt: new Date(),
    })
    .where(eq(mediaKits.id, kitId));

  return {
    ok: true,
    content,
    result: {
      kitId,
      versionId: version.id,
      versionNumber,
      contentHash,
      slug,
      webUrl: mediaKitWebUrl(slug),
      versionWebUrl: mediaKitVersionWebUrl(slug, versionNumber),
      pdfFilename,
    },
  };
}

export function mediaKitVersionWebUrl(slug: string, versionNumber: number): string {
  const base = process.env.PUBLIC_DASHBOARD_URL?.replace(/\/$/, '') ?? 'https://benson.kckellie.com';
  return `${base}/media-kit/${slug}?v=${versionNumber}`;
}

export async function getMediaKitVersion(id: string): Promise<MediaKitVersion | null> {
  const rows = await db
    .select()
    .from(mediaKitVersions)
    .where(eq(mediaKitVersions.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getMediaKitVersionBySlug(
  slug: string,
  versionNumber?: number | null,
): Promise<{
  kitId: string;
  version: MediaKitVersion;
  content: MediaKitContent;
} | null> {
  if (versionNumber != null && Number.isFinite(versionNumber)) {
    const rows = await db
      .select()
      .from(mediaKitVersions)
      .where(
        sql`${mediaKitVersions.webSlug} = ${slug} AND ${mediaKitVersions.versionNumber} = ${versionNumber}`,
      )
      .limit(1);
    const version = rows[0];
    if (!version) return null;
    return {
      kitId: version.mediaKitId,
      version,
      content: version.contentSnapshot as unknown as MediaKitContent,
    };
  }

  // Latest current version via kit pointer, falling back to newest version row.
  const kit = await db
    .select({
      id: mediaKits.id,
      currentVersionId: mediaKits.currentVersionId,
      analyticsSnapshot: mediaKits.analyticsSnapshot,
    })
    .from(mediaKits)
    .where(eq(mediaKits.webSlug, slug))
    .limit(1);

  if (!kit[0]) return null;

  if (kit[0].currentVersionId) {
    const version = await getMediaKitVersion(kit[0].currentVersionId);
    if (version) {
      return {
        kitId: kit[0].id,
        version,
        content: version.contentSnapshot as unknown as MediaKitContent,
      };
    }
  }

  const latest = await db
    .select()
    .from(mediaKitVersions)
    .where(eq(mediaKitVersions.mediaKitId, kit[0].id))
    .orderBy(desc(mediaKitVersions.versionNumber))
    .limit(1);

  if (latest[0]) {
    return {
      kitId: kit[0].id,
      version: latest[0],
      content: latest[0].contentSnapshot as unknown as MediaKitContent,
    };
  }

  // Pre-versioning kits: serve live snapshot as ephemeral "current" without a version id.
  if (kit[0].analyticsSnapshot) {
    return null;
  }
  return null;
}

export async function resolveKitVersionForOutreach(mediaKitId: string | null): Promise<{
  versionId: string | null;
  contentHash: string | null;
} | null> {
  if (!mediaKitId) return { versionId: null, contentHash: null };
  const kit = await db
    .select({
      currentVersionId: mediaKits.currentVersionId,
      currentContentHash: mediaKits.currentContentHash,
    })
    .from(mediaKits)
    .where(eq(mediaKits.id, mediaKitId))
    .limit(1);
  if (!kit[0]) return null;
  return {
    versionId: kit[0].currentVersionId,
    contentHash: kit[0].currentContentHash,
  };
}
