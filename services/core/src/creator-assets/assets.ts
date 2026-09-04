/**
 * Creator asset CRUD — durable photos with explicit public-use approval.
 *
 * Never silently publishes: create → draft/pending → Kellie approves → then assignable.
 */

import { and, asc, desc, eq, inArray, ne, or } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { db } from '../db.js';
import {
  creatorAssets,
  mediaKitAssetAssignments,
  mediaKits,
  mediaKitVersions,
  type CreatorAsset,
} from '../schema.js';
import {
  buildPublicDerivatives,
  deleteCreatorAssetFiles,
  saveOriginalAsset,
  validateCreatorAssetBytes,
} from './storage.js';
import {
  canAppearOnPublicKit,
  isCreatorAssetRole,
  mayServeCreatorAssetPrivateFile,
  type CreatorAssetPublicUseState,
  type CreatorAssetRole,
} from './types.js';

export type CreateCreatorAssetInput = {
  buffer: Buffer;
  originalFilename?: string | null;
  claimedMime?: string | null;
  role?: CreatorAssetRole;
  caption?: string | null;
  altText?: string | null;
  source?: string;
  askBensonMessageId?: string | null;
  /** If true, starts as pending_public_use (still needs Kellie approval). */
  requestPublicUse?: boolean;
};

export async function createCreatorAsset(input: CreateCreatorAssetInput): Promise<CreatorAsset> {
  const validation = validateCreatorAssetBytes(input.buffer, input.claimedMime);
  if (!validation.ok) throw new Error(validation.error);

  const saved = await saveOriginalAsset({ buffer: input.buffer, sniffed: validation.sniffed });
  const baseId = randomUUID();
  const derivatives = await buildPublicDerivatives({
    buffer: input.buffer,
    baseId,
  });

  const role = input.role && isCreatorAssetRole(input.role) ? input.role : 'other';
  const publicUseState: CreatorAssetPublicUseState = input.requestPublicUse
    ? 'pending_public_use'
    : 'draft';

  const inserted = await db
    .insert(creatorAssets)
    .values({
      contentHash: saved.contentHash,
      originalFilename: input.originalFilename ?? null,
      mimeType: validation.sniffed,
      fileSize: input.buffer.length,
      storageFilename: saved.storageFilename,
      publicStorageFilename: derivatives.publicFilename,
      thumbStorageFilename: derivatives.thumbFilename,
      webStorageFilename: derivatives.webFilename,
      printStorageFilename: derivatives.printFilename,
      widthPx: derivatives.widthPx || null,
      heightPx: derivatives.heightPx || null,
      role,
      publicUseState,
      caption: input.caption ?? null,
      altText: input.altText ?? null,
      source: input.source ?? 'ask_benson',
      askBensonMessageId: input.askBensonMessageId ?? null,
      sniffedMimeType: validation.sniffed,
      exifStripped: true,
      metadata: {},
    })
    .returning();

  return inserted[0]!;
}

export async function listCreatorAssets(input?: {
  states?: CreatorAssetPublicUseState[];
  role?: CreatorAssetRole;
  limit?: number;
  /** When true, include archived rows even if `states` is omitted. Default library hides them. */
  includeArchived?: boolean;
}): Promise<CreatorAsset[]> {
  const limit = Math.min(Math.max(input?.limit ?? 50, 1), 200);
  const conditions = [];
  if (input?.states?.length) {
    conditions.push(inArray(creatorAssets.publicUseState, input.states));
  } else if (!input?.includeArchived) {
    // Archived assets stay in private audit storage but leave the normal library.
    conditions.push(ne(creatorAssets.publicUseState, 'archived'));
  }
  if (input?.role) {
    conditions.push(eq(creatorAssets.role, input.role));
  }

  const rows = await db
    .select()
    .from(creatorAssets)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(creatorAssets.createdAt))
    .limit(limit);
  return rows;
}

export async function getCreatorAsset(id: string): Promise<CreatorAsset | null> {
  const rows = await db.select().from(creatorAssets).where(eq(creatorAssets.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function requestPublicUseApproval(id: string): Promise<CreatorAsset> {
  const existing = await getCreatorAsset(id);
  if (!existing) throw new Error('Creator asset not found.');
  if (existing.publicUseState === 'approved_public_use') return existing;
  if (existing.publicUseState === 'archived') {
    throw new Error('Archived assets cannot be submitted for public use.');
  }

  const updated = await db
    .update(creatorAssets)
    .set({
      publicUseState: 'pending_public_use',
      publicUseRejectedAt: null,
      publicUseRejectionReason: null,
      updatedAt: new Date(),
    })
    .where(eq(creatorAssets.id, id))
    .returning();
  return updated[0]!;
}

export async function approvePublicUse(
  id: string,
  approvedBy = 'kellie',
): Promise<CreatorAsset> {
  const existing = await getCreatorAsset(id);
  if (!existing) throw new Error('Creator asset not found.');
  if (existing.publicUseState === 'archived') {
    throw new Error('Archived assets cannot be approved for public use.');
  }

  const updated = await db
    .update(creatorAssets)
    .set({
      publicUseState: 'approved_public_use',
      publicUseApprovedAt: new Date(),
      publicUseApprovedBy: approvedBy,
      publicUseRejectedAt: null,
      publicUseRejectionReason: null,
      updatedAt: new Date(),
    })
    .where(eq(creatorAssets.id, id))
    .returning();
  return updated[0]!;
}

export async function rejectPublicUse(
  id: string,
  reason?: string | null,
): Promise<CreatorAsset> {
  const existing = await getCreatorAsset(id);
  if (!existing) throw new Error('Creator asset not found.');

  const updated = await db
    .update(creatorAssets)
    .set({
      publicUseState: 'rejected_public_use',
      publicUseRejectedAt: new Date(),
      publicUseRejectionReason: reason?.trim() || 'Rejected by Kellie',
      updatedAt: new Date(),
    })
    .where(eq(creatorAssets.id, id))
    .returning();
  return updated[0]!;
}

export async function updateCreatorAssetRole(
  id: string,
  role: CreatorAssetRole,
): Promise<CreatorAsset> {
  if (!isCreatorAssetRole(role)) throw new Error('Invalid asset role.');
  const updated = await db
    .update(creatorAssets)
    .set({ role, updatedAt: new Date() })
    .where(eq(creatorAssets.id, id))
    .returning();
  if (!updated[0]) throw new Error('Creator asset not found.');
  return updated[0];
}

export async function archiveCreatorAsset(id: string): Promise<CreatorAsset> {
  const updated = await db
    .update(creatorAssets)
    .set({ publicUseState: 'archived', updatedAt: new Date() })
    .where(eq(creatorAssets.id, id))
    .returning();
  if (!updated[0]) throw new Error('Creator asset not found.');
  return updated[0];
}

/**
 * Assign an approved asset to a media kit. Refuses unapproved assets — never silent publish.
 */
export async function assignAssetToMediaKit(input: {
  mediaKitId: string;
  creatorAssetId: string;
  placement?: string;
  sortOrder?: number;
  assignedBy?: string;
  mediaKitVersionId?: string | null;
}): Promise<void> {
  const asset = await getCreatorAsset(input.creatorAssetId);
  if (!asset) throw new Error('Creator asset not found.');
  if (!canAppearOnPublicKit(asset.publicUseState)) {
    throw new Error(
      'Only photos Kellie has approved for public use can be assigned to a media kit.',
    );
  }

  const kit = await db
    .select({ id: mediaKits.id })
    .from(mediaKits)
    .where(eq(mediaKits.id, input.mediaKitId))
    .limit(1);
  if (!kit[0]) throw new Error('Media kit not found.');

  await db
    .insert(mediaKitAssetAssignments)
    .values({
      mediaKitId: input.mediaKitId,
      mediaKitVersionId: input.mediaKitVersionId ?? null,
      creatorAssetId: input.creatorAssetId,
      placement: input.placement ?? 'gallery',
      sortOrder: input.sortOrder ?? 0,
      assignedBy: input.assignedBy ?? 'kellie',
    })
    .onConflictDoNothing();
}

export async function listApprovedAssetsForKit(mediaKitId: string): Promise<CreatorAsset[]> {
  const rows = await listApprovedAssetsWithPlacementForKit(mediaKitId);
  return rows.map((row) => row.asset);
}

export async function listApprovedAssetsWithPlacementForKit(
  mediaKitId: string,
): Promise<Array<{ asset: CreatorAsset; placement: string }>> {
  const rows = await db
    .select({
      asset: creatorAssets,
      placement: mediaKitAssetAssignments.placement,
    })
    .from(mediaKitAssetAssignments)
    .innerJoin(creatorAssets, eq(creatorAssets.id, mediaKitAssetAssignments.creatorAssetId))
    .where(
      and(
        eq(mediaKitAssetAssignments.mediaKitId, mediaKitId),
        eq(creatorAssets.publicUseState, 'approved_public_use'),
      ),
    )
    .orderBy(asc(mediaKitAssetAssignments.sortOrder));

  return rows.map((row) => ({ asset: row.asset, placement: row.placement }));
}

/** Placement used when assigning; role never silently drops a photo from kits. */
export function placementForAssetRole(role: string): string {
  if (role === 'headshot') return 'headshot';
  if (role === 'hero') return 'hero';
  if (role === 'proof_still') return 'proof';
  if (role === 'lifestyle') return 'gallery';
  return 'gallery';
}

export async function deleteCreatorAsset(id: string): Promise<void> {
  const existing = await getCreatorAsset(id);
  if (!existing) return;
  await db.delete(creatorAssets).where(eq(creatorAssets.id, id));
  await deleteCreatorAssetFiles([
    existing.storageFilename,
    existing.publicStorageFilename,
    existing.thumbStorageFilename,
    existing.webStorageFilename,
    existing.printStorageFilename,
  ]);
}

/** Resolve an asset by any on-disk derivative / original filename (basename only). */
export async function findCreatorAssetByStorageFilename(
  storageFilename: string,
): Promise<CreatorAsset | null> {
  const safe = storageFilename.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safe || safe !== storageFilename) return null;
  const rows = await db
    .select()
    .from(creatorAssets)
    .where(
      or(
        eq(creatorAssets.storageFilename, safe),
        eq(creatorAssets.publicStorageFilename, safe),
        eq(creatorAssets.thumbStorageFilename, safe),
        eq(creatorAssets.webStorageFilename, safe),
        eq(creatorAssets.printStorageFilename, safe),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Private file bytes are served only when a matching asset row exists and is not
 * archived/rejected. Unknown/orphan filenames 404 (no silent disk serve).
 */
export async function resolveCreatorAssetPrivateFileAccess(
  storageFilename: string,
): Promise<{ ok: true; asset: CreatorAsset } | { ok: false; reason: 'not_found' | 'revoked' }> {
  const asset = await findCreatorAssetByStorageFilename(storageFilename);
  if (!asset) return { ok: false, reason: 'not_found' };
  if (!mayServeCreatorAssetPrivateFile(asset.publicUseState)) {
    return { ok: false, reason: 'revoked' };
  }
  return { ok: true, asset };
}

export function serializeCreatorAsset(asset: CreatorAsset) {
  return {
    id: asset.id,
    contentHash: asset.contentHash,
    originalFilename: asset.originalFilename,
    mimeType: asset.mimeType,
    fileSize: asset.fileSize,
    role: asset.role,
    publicUseState: asset.publicUseState,
    publicUseApprovedAt: asset.publicUseApprovedAt?.toISOString() ?? null,
    publicUseApprovedBy: asset.publicUseApprovedBy,
    caption: asset.caption,
    altText: asset.altText,
    source: asset.source,
    widthPx: asset.widthPx,
    heightPx: asset.heightPx,
    exifStripped: asset.exifStripped,
    thumbUrl: asset.thumbStorageFilename
      ? `/api/creator-assets/files/${asset.thumbStorageFilename}`
      : null,
    webUrl: asset.webStorageFilename
      ? `/api/creator-assets/files/${asset.webStorageFilename}`
      : null,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}

export const KIT_ASSIGN_TARGETS = ['hotel', 'restaurant', 'destination', 'all', 'unassigned'] as const;
export type KitAssignTarget = (typeof KIT_ASSIGN_TARGETS)[number];

export function displayPublicUseStatus(input: {
  publicUseState: string;
  assignmentCount: number;
}): string {
  if (input.publicUseState === 'rejected_public_use' || input.publicUseState === 'archived') {
    return 'Rejected/archived';
  }
  if (input.publicUseState === 'pending_public_use' || input.publicUseState === 'draft') {
    return 'Private/pending';
  }
  if (input.publicUseState === 'approved_public_use' && input.assignmentCount === 0) {
    return 'Approved/unassigned';
  }
  if (input.publicUseState === 'approved_public_use') {
    return 'Approved/assigned';
  }
  return input.publicUseState;
}

export type AssetAssignmentDetail = {
  mediaKitId: string;
  placement: string;
  assignedAt: Date;
  kitName: string | null;
  variant: string | null;
  webSlug: string | null;
  versionNumber: number | null;
  versionId: string | null;
  webUrl: string | null;
  pdfUrl: string | null;
  /**
   * ready — current kit version snapshot includes this asset.
   * pending_build — assignment row exists but current version is still the previous build.
   * generation_failed — last rebuild for this variant failed (assignment may still be saved).
   */
  generationStatus: 'ready' | 'pending_build' | 'generation_failed';
};

function assetIdsInSnapshot(snapshot: unknown): Set<string> {
  const assets =
    snapshot &&
    typeof snapshot === 'object' &&
    Array.isArray((snapshot as { assignedAssets?: unknown }).assignedAssets)
      ? ((snapshot as { assignedAssets: Array<{ id?: unknown }> }).assignedAssets ?? [])
      : [];
  const ids = new Set<string>();
  for (const row of assets) {
    if (typeof row?.id === 'string') ids.add(row.id);
  }
  return ids;
}

export async function listAssignmentsForAsset(creatorAssetId: string) {
  return db
    .select({
      mediaKitId: mediaKitAssetAssignments.mediaKitId,
      placement: mediaKitAssetAssignments.placement,
      assignedAt: mediaKitAssetAssignments.assignedAt,
    })
    .from(mediaKitAssetAssignments)
    .where(eq(mediaKitAssetAssignments.creatorAssetId, creatorAssetId));
}

export async function listAssignmentDetailsForAsset(
  creatorAssetId: string,
): Promise<AssetAssignmentDetail[]> {
  const dashboardBase =
    process.env.PUBLIC_DASHBOARD_URL?.replace(/\/$/, '') ?? 'https://benson.kckellie.com';
  const apiBase = process.env.PUBLIC_API_URL?.replace(/\/$/, '') ?? 'https://api.kckellie.com';

  const rows = await db
    .select({
      mediaKitId: mediaKitAssetAssignments.mediaKitId,
      placement: mediaKitAssetAssignments.placement,
      assignedAt: mediaKitAssetAssignments.assignedAt,
      kitName: mediaKits.name,
      variant: mediaKits.businessVariant,
      webSlug: mediaKits.webSlug,
      versionId: mediaKits.currentVersionId,
      versionText: mediaKits.version,
    })
    .from(mediaKitAssetAssignments)
    .innerJoin(mediaKits, eq(mediaKits.id, mediaKitAssetAssignments.mediaKitId))
    .where(eq(mediaKitAssetAssignments.creatorAssetId, creatorAssetId));

  // Prefer immutable version row over the denormalized kit.version text when available.
  const versionIds = rows
    .map((row) => row.versionId)
    .filter((id): id is string => typeof id === 'string');
  const versionRows =
    versionIds.length > 0
      ? await db
          .select({
            id: mediaKitVersions.id,
            versionNumber: mediaKitVersions.versionNumber,
            contentSnapshot: mediaKitVersions.contentSnapshot,
          })
          .from(mediaKitVersions)
          .where(inArray(mediaKitVersions.id, versionIds))
      : [];
  const versionById = new Map(versionRows.map((v) => [v.id, v]));

  return rows.map((row) => {
    const version = row.versionId ? versionById.get(row.versionId) : undefined;
    const versionNumber =
      version?.versionNumber ??
      (row.versionText && /^\d+$/.test(row.versionText) ? Number(row.versionText) : null);
    const slug = row.webSlug;
    const inSnapshot = version
      ? assetIdsInSnapshot(version.contentSnapshot).has(creatorAssetId)
      : false;
    const generationStatus: AssetAssignmentDetail['generationStatus'] = inSnapshot
      ? 'ready'
      : 'pending_build';

    return {
      mediaKitId: row.mediaKitId,
      placement: row.placement,
      assignedAt: row.assignedAt,
      kitName: row.kitName,
      variant: row.variant,
      webSlug: slug,
      versionNumber,
      versionId: row.versionId,
      webUrl: slug
        ? `${dashboardBase}/media-kit/${slug}${versionNumber != null ? `?v=${versionNumber}` : ''}`
        : null,
      pdfUrl: slug
        ? `${apiBase}/api/public/media-kit/${slug}/pdf${versionNumber != null ? `?v=${versionNumber}` : ''}`
        : null,
      generationStatus,
    };
  });
}

export async function unassignAssetFromMediaKit(input: {
  mediaKitId: string;
  creatorAssetId: string;
}): Promise<void> {
  await db
    .delete(mediaKitAssetAssignments)
    .where(
      and(
        eq(mediaKitAssetAssignments.mediaKitId, input.mediaKitId),
        eq(mediaKitAssetAssignments.creatorAssetId, input.creatorAssetId),
      ),
    );
}

async function kitsForTarget(target: KitAssignTarget): Promise<Array<{ id: string; variant: string }>> {
  if (target === 'unassigned') return [];
  const variants =
    target === 'all' ? (['hotel', 'restaurant', 'destination'] as const) : ([target] as const);
  const rows = await db
    .select({
      id: mediaKits.id,
      variant: mediaKits.businessVariant,
    })
    .from(mediaKits)
    .where(eq(mediaKits.active, true));
  return rows
    .filter((row) => row.variant && variants.includes(row.variant as (typeof variants)[number]))
    .map((row) => ({ id: row.id, variant: row.variant! }));
}

export type KitRebuildStatus = {
  variant: string;
  mediaKitId?: string;
  versionId?: string;
  versionNumber?: number;
  webUrl?: string;
  pdfUrl?: string;
  status: 'ready' | 'generation_failed' | 'unchanged';
  error?: string;
};

/** Merge just-built kit metadata onto assignment rows so labels/links share one version. */
export function reconcileAssignmentsWithRebuilds(
  assignments: AssetAssignmentDetail[],
  rebuilt: KitRebuildStatus[],
): AssetAssignmentDetail[] {
  const byVariant = new Map<string, KitRebuildStatus>();
  for (const row of rebuilt) {
    if (row.variant) byVariant.set(row.variant, row);
  }
  return assignments.map((assignment) => {
    const variant = assignment.variant;
    if (!variant) return assignment;
    const rebuild = byVariant.get(variant);
    if (!rebuild) return assignment;
    if (rebuild.status === 'ready' && rebuild.versionNumber != null) {
      return {
        ...assignment,
        versionNumber: rebuild.versionNumber,
        versionId: rebuild.versionId ?? assignment.versionId,
        webUrl: rebuild.webUrl ?? assignment.webUrl,
        pdfUrl: rebuild.pdfUrl ?? assignment.pdfUrl,
        generationStatus: 'ready',
      };
    }
    if (rebuild.status === 'generation_failed') {
      return {
        ...assignment,
        generationStatus: 'generation_failed',
      };
    }
    return assignment;
  });
}

/**
 * Replace the asset's kit assignments to match `targets`.
 * Approval alone never calls this. Empty / unassigned → zero assignments.
 */
export async function assignAssetToKitTarget(input: {
  creatorAssetId: string;
  target?: KitAssignTarget;
  /** Preferred: explicit multi-select. Replaces the current assignment set. */
  targets?: KitAssignTarget[];
  assignedBy?: string;
}): Promise<{
  assignedKitIds: string[];
  rebuilt: KitRebuildStatus[];
  assignments: AssetAssignmentDetail[];
  /** True once DB assignment rows match targets — even if kit generation later fails. */
  assignmentPersisted: boolean;
}> {
  const { persistVersionedMediaKit } = await import('../media-kit/versions.js');
  const apiBase = process.env.PUBLIC_API_URL?.replace(/\/$/, '') ?? 'https://api.kckellie.com';

  const rawTargets = input.targets?.length
    ? input.targets
    : input.target
      ? [input.target]
      : [];
  if (rawTargets.length === 0) {
    throw new Error('Select at least one kit target, or Approved but unassigned.');
  }

  const clearOnly = rawTargets.length === 1 && rawTargets[0] === 'unassigned';
  const desiredKits = new Map<string, { id: string; variant: string }>();
  if (!clearOnly) {
    for (const target of rawTargets) {
      if (target === 'unassigned') continue;
      for (const kit of await kitsForTarget(target)) {
        desiredKits.set(kit.id, kit);
      }
    }
  }

  const asset = await getCreatorAsset(input.creatorAssetId);
  if (!asset) throw new Error('Creator asset not found.');
  if (!canAppearOnPublicKit(asset.publicUseState)) {
    throw new Error(
      'Only photos Kellie has approved for public use can be assigned to a media kit.',
    );
  }
  const placement = placementForAssetRole(asset.role);

  const existing = await listAssignmentsForAsset(input.creatorAssetId);
  const existingIds = new Set(existing.map((row) => row.mediaKitId));
  const desiredIds = new Set(desiredKits.keys());

  for (const row of existing) {
    if (!desiredIds.has(row.mediaKitId)) {
      await unassignAssetFromMediaKit({
        mediaKitId: row.mediaKitId,
        creatorAssetId: input.creatorAssetId,
      });
    }
  }

  const assignedKitIds: string[] = [];
  const variantsToRebuild = new Set<string>();

  for (const kit of desiredKits.values()) {
    if (!existingIds.has(kit.id)) {
      await assignAssetToMediaKit({
        mediaKitId: kit.id,
        creatorAssetId: input.creatorAssetId,
        placement,
        assignedBy: input.assignedBy ?? 'kellie',
      });
      variantsToRebuild.add(kit.variant);
    } else {
      // Refresh placement if role changed since prior assign.
      await db
        .update(mediaKitAssetAssignments)
        .set({ placement })
        .where(
          and(
            eq(mediaKitAssetAssignments.mediaKitId, kit.id),
            eq(mediaKitAssetAssignments.creatorAssetId, input.creatorAssetId),
          ),
        );
      variantsToRebuild.add(kit.variant);
    }
    assignedKitIds.push(kit.id);
  }

  // Also rebuild variants we removed from, so kits drop the photo.
  for (const row of existing) {
    if (desiredIds.has(row.mediaKitId)) continue;
    const kit = await db
      .select({ variant: mediaKits.businessVariant })
      .from(mediaKits)
      .where(eq(mediaKits.id, row.mediaKitId))
      .limit(1);
    if (kit[0]?.variant) variantsToRebuild.add(kit[0].variant);
  }

  const assignmentPersisted = true;

  const rebuildVariants = [...variantsToRebuild].filter(
    (variant): variant is 'hotel' | 'restaurant' | 'destination' | 'core' =>
      variant === 'hotel' ||
      variant === 'restaurant' ||
      variant === 'destination' ||
      variant === 'core',
  );

  // Parallel kit builds — dual-target saves were timing out on serial ~25–30s each.
  const rebuilt = await Promise.all(
    rebuildVariants.map(async (variant): Promise<KitRebuildStatus> => {
      try {
        const result = await persistVersionedMediaKit({
          variant,
          generatedBy: 'kellie_asset_assignment',
          notes: `Rebuilt after assigning creator asset ${input.creatorAssetId}`,
        });
        if (result.ok) {
          return {
            variant,
            mediaKitId: result.result.kitId,
            versionId: result.result.versionId,
            versionNumber: result.result.versionNumber,
            webUrl: result.result.versionWebUrl,
            pdfUrl: `${apiBase}/api/public/media-kit/${result.result.slug}/pdf?v=${result.result.versionNumber}`,
            status: 'ready',
          };
        }
        return {
          variant,
          status: 'generation_failed',
          error: result.missing.join(' '),
        };
      } catch (err) {
        return {
          variant,
          status: 'generation_failed',
          error: err instanceof Error ? err.message : 'Kit rebuild failed',
        };
      }
    }),
  );

  const listed = await listAssignmentDetailsForAsset(input.creatorAssetId);
  const assignments = reconcileAssignmentsWithRebuilds(listed, rebuilt);
  return { assignedKitIds, rebuilt, assignments, assignmentPersisted };
}
