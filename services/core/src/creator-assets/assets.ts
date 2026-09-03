/**
 * Creator asset CRUD — durable photos with explicit public-use approval.
 *
 * Never silently publishes: create → draft/pending → Kellie approves → then assignable.
 */

import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { db } from '../db.js';
import { creatorAssets, mediaKitAssetAssignments, mediaKits, type CreatorAsset } from '../schema.js';
import {
  buildPublicDerivatives,
  deleteCreatorAssetFiles,
  saveOriginalAsset,
  validateCreatorAssetBytes,
} from './storage.js';
import {
  canAppearOnPublicKit,
  isCreatorAssetRole,
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
}): Promise<CreatorAsset[]> {
  const limit = Math.min(Math.max(input?.limit ?? 50, 1), 200);
  const conditions = [];
  if (input?.states?.length) {
    conditions.push(inArray(creatorAssets.publicUseState, input.states));
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
  const rows = await db
    .select({ asset: creatorAssets })
    .from(mediaKitAssetAssignments)
    .innerJoin(creatorAssets, eq(creatorAssets.id, mediaKitAssetAssignments.creatorAssetId))
    .where(
      and(
        eq(mediaKitAssetAssignments.mediaKitId, mediaKitId),
        eq(creatorAssets.publicUseState, 'approved_public_use'),
      ),
    )
    .orderBy(asc(mediaKitAssetAssignments.sortOrder));


  return rows.map((row) => row.asset);
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
