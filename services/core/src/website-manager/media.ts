import { desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { websiteDrafts, websiteMediaItems } from '../schema.js';
import { analyzeWebsiteMedia } from './intelligence.js';
import { buildWebsiteMediaFileUrl } from './storage.js';
import { createDraftFromMediaAnalysis } from './drafts.js';
import {
  completeWebsiteAnalysisJob,
  createWebsiteAnalysisJob,
  failWebsiteAnalysisJob,
  getWebsiteAnalysisJob,
} from './jobs.js';

export type WebsiteMediaRecord = {
  id: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  mediaKind: 'image' | 'video';
  storageFilename: string;
  thumbnailFilename: string | null;
  fileUrl: string;
  thumbnailUrl: string | null;
  uploadedBy: string;
  uploadedAt: string;
  aiCategory: string | null;
  aiCaption: string | null;
  aiAltText: string | null;
  aiContentType: string | null;
  aiSuggestedPlacement: string | null;
  aiMetadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

function rowToRecord(row: typeof websiteMediaItems.$inferSelect): WebsiteMediaRecord {
  return {
    id: row.id,
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    fileSize: Number(row.fileSize),
    mediaKind: row.mediaKind as 'image' | 'video',
    storageFilename: row.storageFilename,
    thumbnailFilename: row.thumbnailFilename,
    fileUrl: buildWebsiteMediaFileUrl(row.storageFilename),
    thumbnailUrl: row.thumbnailFilename
      ? buildWebsiteMediaFileUrl(row.thumbnailFilename)
      : null,
    uploadedBy: row.uploadedBy,
    uploadedAt: row.uploadedAt.toISOString(),
    aiCategory: row.aiCategory,
    aiCaption: row.aiCaption,
    aiAltText: row.aiAltText,
    aiContentType: row.aiContentType,
    aiSuggestedPlacement: row.aiSuggestedPlacement,
    aiMetadata: (row.aiMetadata ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listWebsiteMedia(limit = 50): Promise<WebsiteMediaRecord[]> {
  const rows = await db
    .select()
    .from(websiteMediaItems)
    .orderBy(desc(websiteMediaItems.uploadedAt))
    .limit(limit);
  return rows.map(rowToRecord);
}

export async function getWebsiteMedia(id: string): Promise<WebsiteMediaRecord | null> {
  const row = await db.query.websiteMediaItems.findFirst({
    where: eq(websiteMediaItems.id, id),
  });
  return row ? rowToRecord(row) : null;
}

export async function uploadWebsiteMedia(input: {
  file: File;
  uploadedBy?: string;
}): Promise<{ media: WebsiteMediaRecord; draftId: string | null; jobId: string; analysisPending: boolean }> {
  const { saveWebsiteMediaFile } = await import('./storage.js');
  const saved = await saveWebsiteMediaFile(input.file);
  const imageBuffer =
    saved.mediaKind === 'image' ? Buffer.from(await input.file.arrayBuffer()) : undefined;

  const now = new Date();
  const [row] = await db
    .insert(websiteMediaItems)
    .values({
      originalFilename: saved.originalFilename,
      mimeType: saved.mimeType,
      fileSize: saved.fileSize,
      mediaKind: saved.mediaKind,
      storageFilename: saved.storageFilename,
      thumbnailFilename: saved.thumbnailFilename,
      uploadedBy: input.uploadedBy ?? 'kellie',
      uploadedAt: now,
      aiMetadata: { analysisStatus: 'processing' },
      updatedAt: now,
    })
    .returning();

  const job = createWebsiteAnalysisJob(row!.id);
  void runWebsiteMediaAnalysisJob({
    jobId: job.id,
    mediaId: row!.id,
    saved,
    imageBuffer,
  });

  return {
    media: rowToRecord(row!),
    draftId: null,
    jobId: job.id,
    analysisPending: true,
  };
}

async function runWebsiteMediaAnalysisJob(input: {
  jobId: string;
  mediaId: string;
  saved: Awaited<ReturnType<typeof import('./storage.js').saveWebsiteMediaFile>>;
  imageBuffer?: Buffer;
}): Promise<void> {
  try {
    const analysis = await analyzeWebsiteMedia({
      originalFilename: input.saved.originalFilename,
      mimeType: input.saved.mimeType,
      mediaKind: input.saved.mediaKind,
      imageBuffer: input.imageBuffer,
    });

    const now = new Date();
    const [row] = await db
      .update(websiteMediaItems)
      .set({
        aiCategory: analysis.category,
        aiCaption: analysis.caption,
        aiAltText: analysis.altText,
        aiContentType: analysis.contentType,
        aiSuggestedPlacement: analysis.suggestedPlacement,
        aiMetadata: {
          analysisStatus: 'complete',
          reasoning: analysis.reasoning,
          headline: analysis.headline,
        },
        updatedAt: now,
      })
      .where(eq(websiteMediaItems.id, input.mediaId))
      .returning();

    const draft = await createDraftFromMediaAnalysis({
      mediaId: input.mediaId,
      analysis,
      mediaKind: input.saved.mediaKind,
    });

    completeWebsiteAnalysisJob(input.jobId, {
      draftId: draft.id,
      draft,
      media: rowToRecord(row!) as unknown as Record<string, unknown>,
    });
  } catch (err) {
    failWebsiteAnalysisJob(
      input.jobId,
      err instanceof Error ? err.message : 'Media analysis failed',
    );
  }
}

export { getWebsiteAnalysisJob };

export async function isMediaPubliclyVisible(storageFilename: string): Promise<boolean> {
  const { websitePublishedItems } = await import('../schema.js');
  const { and, isNull, or } = await import('drizzle-orm');

  const rows = await db
    .select({ id: websitePublishedItems.id })
    .from(websitePublishedItems)
    .innerJoin(websiteMediaItems, eq(websitePublishedItems.mediaItemId, websiteMediaItems.id))
    .where(
      and(
        isNull(websitePublishedItems.unpublishedAt),
        or(
          eq(websiteMediaItems.storageFilename, storageFilename),
          eq(websiteMediaItems.thumbnailFilename, storageFilename),
        ),
      ),
    )
    .limit(1);

  return rows.length > 0;
}
