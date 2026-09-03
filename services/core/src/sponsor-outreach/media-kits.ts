import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { mediaKits, mediaKitAssetAssignments, mediaKitVersions, outreachEmails } from '../schema.js';
import { deleteMediaKitFile } from './media-kit-storage.js';

export type MediaKitRecord = {
  id: string;
  name: string;
  description: string | null;
  targetAudience: string | null;
  fileUrl: string | null;
  originalFilename: string | null;
  mimeType: string | null;
  fileSize: number | null;
  storageFilename: string | null;
  version: string;
  active: boolean;
  kitKind: string;
  isTestArtifact: boolean;
  businessVariant: string | null;
  webSlug: string | null;
  generatedAt: string | null;
  currentVersionId: string | null;
  currentContentHash: string | null;
  currentVersionNumber: number | null;
  pdfAvailable: boolean;
  webAvailable: boolean;
  assignedAssetCount: number;
  pinnedByPitchCount: number;
  createdAt: string;
  updatedAt: string;
};

export type MediaKitInput = {
  name: string;
  description?: string | null;
  targetAudience?: string | null;
  fileUrl?: string | null;
  originalFilename?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  storageFilename?: string | null;
  version?: string;
  active?: boolean;
};

async function rowToRecord(row: typeof mediaKits.$inferSelect): Promise<MediaKitRecord> {
  let currentVersionNumber: number | null = null;
  let pdfAvailable = Boolean(row.storageFilename || row.fileUrl);
  if (row.currentVersionId) {
    const version = await db
      .select({
        versionNumber: mediaKitVersions.versionNumber,
        pdfStorageFilename: mediaKitVersions.pdfStorageFilename,
      })
      .from(mediaKitVersions)
      .where(eq(mediaKitVersions.id, row.currentVersionId))
      .limit(1);
    if (version[0]) {
      currentVersionNumber = version[0].versionNumber;
      if (version[0].pdfStorageFilename) pdfAvailable = true;
    }
  }

  const assigned = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(mediaKitAssetAssignments)
    .where(eq(mediaKitAssetAssignments.mediaKitId, row.id));
  const pinned = row.currentVersionId
    ? await db
        .select({ n: sql<number>`count(*)::int` })
        .from(outreachEmails)
        .where(eq(outreachEmails.approvedMediaKitVersionId, row.currentVersionId))
    : [{ n: 0 }];

  const generated = row.kitKind.startsWith('generated');
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    targetAudience: row.targetAudience,
    fileUrl: row.fileUrl,
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    storageFilename: row.storageFilename,
    version: row.version,
    active: row.active,
    kitKind: row.kitKind,
    isTestArtifact: row.isTestArtifact,
    businessVariant: row.businessVariant,
    webSlug: row.webSlug,
    generatedAt: row.generatedAt?.toISOString() ?? null,
    currentVersionId: row.currentVersionId,
    currentContentHash: row.currentContentHash,
    currentVersionNumber,
    pdfAvailable: generated ? pdfAvailable : Boolean(row.storageFilename || row.fileUrl),
    webAvailable: generated ? Boolean(row.webSlug) : Boolean(row.fileUrl || row.storageFilename),
    assignedAssetCount: Number(assigned[0]?.n ?? 0),
    pinnedByPitchCount: Number(pinned[0]?.n ?? 0),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listMediaKits(activeOnly = false): Promise<MediaKitRecord[]> {
  const query = db.select().from(mediaKits).orderBy(desc(mediaKits.updatedAt));
  const rows = activeOnly
    ? await query.where(eq(mediaKits.active, true))
    : await query;
  return Promise.all(rows.map((row) => rowToRecord(row)));
}

export async function getMediaKit(id: string): Promise<MediaKitRecord | null> {
  const rows = await db.select().from(mediaKits).where(eq(mediaKits.id, id)).limit(1);
  return rows[0] ? rowToRecord(rows[0]) : null;
}

export async function createMediaKit(input: MediaKitInput): Promise<MediaKitRecord> {
  if (!input.fileUrl?.trim() && !input.storageFilename) {
    throw new Error('Provide an uploaded file or a file URL.');
  }

  const [row] = await db
    .insert(mediaKits)
    .values({
      name: input.name,
      description: input.description ?? null,
      targetAudience: input.targetAudience ?? null,
      fileUrl: input.fileUrl?.trim() || null,
      originalFilename: input.originalFilename ?? null,
      mimeType: input.mimeType ?? null,
      fileSize: input.fileSize ?? null,
      storageFilename: input.storageFilename ?? null,
      version: input.version ?? '1.0',
      active: input.active ?? true,
    })
    .returning();
  return rowToRecord(row!);
}

export async function updateMediaKit(
  id: string,
  input: Partial<MediaKitInput>,
): Promise<MediaKitRecord | null> {
  const patch: Partial<typeof mediaKits.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.targetAudience !== undefined) patch.targetAudience = input.targetAudience;
  if (input.fileUrl !== undefined) patch.fileUrl = input.fileUrl;
  if (input.originalFilename !== undefined) patch.originalFilename = input.originalFilename;
  if (input.mimeType !== undefined) patch.mimeType = input.mimeType;
  if (input.fileSize !== undefined) patch.fileSize = input.fileSize;
  if (input.storageFilename !== undefined) patch.storageFilename = input.storageFilename;
  if (input.version !== undefined) patch.version = input.version;
  if (input.active !== undefined) patch.active = input.active;

  const [row] = await db.update(mediaKits).set(patch).where(eq(mediaKits.id, id)).returning();
  return row ? rowToRecord(row) : null;
}

export async function deleteMediaKit(id: string): Promise<boolean> {
  const existing = await getMediaKit(id);
  if (!existing) return false;

  await deleteMediaKitFile(existing.storageFilename);
  await db.delete(mediaKits).where(eq(mediaKits.id, id));
  return true;
}
