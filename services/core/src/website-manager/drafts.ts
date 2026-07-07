import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { websiteDrafts, websiteMediaItems, websiteSections } from '../schema.js';
import type { WebsiteMediaAnalysis } from './intelligence.js';
import type { WebsiteDraftStatus } from './constants.js';
import { buildWebsiteMediaFileUrl } from './storage.js';

export type WebsiteDraftRecord = {
  id: string;
  title: string;
  sectionId: string;
  sectionLabel: string | null;
  mediaItemId: string | null;
  caption: string | null;
  altText: string | null;
  headline: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  sortOrder: number;
  status: WebsiteDraftStatus;
  bensonReasoning: string | null;
  createdBy: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  media: {
    id: string;
    originalFilename: string;
    mimeType: string;
    mediaKind: string;
    fileUrl: string;
    thumbnailUrl: string | null;
    aiCategory: string | null;
    aiContentType: string | null;
    aiSuggestedPlacement: string | null;
  } | null;
};

async function enrichDraft(row: typeof websiteDrafts.$inferSelect): Promise<WebsiteDraftRecord> {
  const section = await db.query.websiteSections.findFirst({
    where: eq(websiteSections.id, row.sectionId),
  });
  let media: WebsiteDraftRecord['media'] = null;
  if (row.mediaItemId) {
    const m = await db.query.websiteMediaItems.findFirst({
      where: eq(websiteMediaItems.id, row.mediaItemId),
    });
    if (m) {
      media = {
        id: m.id,
        originalFilename: m.originalFilename,
        mimeType: m.mimeType,
        mediaKind: m.mediaKind,
        fileUrl: buildWebsiteMediaFileUrl(m.storageFilename),
        thumbnailUrl: m.thumbnailFilename
          ? buildWebsiteMediaFileUrl(m.thumbnailFilename)
          : null,
        aiCategory: m.aiCategory,
        aiContentType: m.aiContentType,
        aiSuggestedPlacement: m.aiSuggestedPlacement,
      };
    }
  }
  return {
    id: row.id,
    title: row.title,
    sectionId: row.sectionId,
    sectionLabel: section?.label ?? null,
    mediaItemId: row.mediaItemId,
    caption: row.caption,
    altText: row.altText,
    headline: row.headline,
    ctaLabel: row.ctaLabel,
    ctaHref: row.ctaHref,
    sortOrder: row.sortOrder,
    status: row.status as WebsiteDraftStatus,
    bensonReasoning: row.bensonReasoning,
    createdBy: row.createdBy,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    rejectionReason: row.rejectionReason,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    media,
  };
}

export async function createDraftFromMediaAnalysis(input: {
  mediaId: string;
  analysis: WebsiteMediaAnalysis;
  mediaKind: 'image' | 'video';
}): Promise<WebsiteDraftRecord> {
  const title =
    input.analysis.headline ??
    `${input.analysis.contentType} ${input.mediaKind} → ${input.analysis.suggestedSectionId.replace(/_/g, ' ')}`;

  const [row] = await db
    .insert(websiteDrafts)
    .values({
      title,
      sectionId: input.analysis.suggestedSectionId,
      mediaItemId: input.mediaId,
      caption: input.analysis.caption,
      altText: input.analysis.altText,
      headline: input.analysis.headline,
      status: 'draft',
      bensonReasoning: input.analysis.reasoning,
      createdBy: 'benson',
    })
    .returning();

  return enrichDraft(row!);
}

export async function listWebsiteDrafts(status?: WebsiteDraftStatus): Promise<WebsiteDraftRecord[]> {
  const rows = status
    ? await db
        .select()
        .from(websiteDrafts)
        .where(eq(websiteDrafts.status, status))
        .orderBy(desc(websiteDrafts.updatedAt))
        .limit(100)
    : await db
        .select()
        .from(websiteDrafts)
        .where(inArray(websiteDrafts.status, ['draft', 'approved', 'published']))
        .orderBy(desc(websiteDrafts.updatedAt))
        .limit(100);

  return Promise.all(rows.map(enrichDraft));
}

export async function getWebsiteDraft(id: string): Promise<WebsiteDraftRecord | null> {
  const row = await db.query.websiteDrafts.findFirst({
    where: eq(websiteDrafts.id, id),
  });
  return row ? enrichDraft(row) : null;
}

export async function updateWebsiteDraft(
  id: string,
  patch: Partial<{
    title: string;
    sectionId: string;
    caption: string | null;
    altText: string | null;
    headline: string | null;
    ctaLabel: string | null;
    ctaHref: string | null;
    sortOrder: number;
    category: string | null;
    contentType: string | null;
    suggestedPlacement: string | null;
  }>,
): Promise<WebsiteDraftRecord | null> {
  const { category, contentType, suggestedPlacement, ...draftPatch } = patch;
  const now = new Date();

  const [row] = await db
    .update(websiteDrafts)
    .set({ ...draftPatch, updatedAt: now })
    .where(eq(websiteDrafts.id, id))
    .returning();

  if (!row) return null;

  if (category !== undefined || contentType !== undefined || suggestedPlacement !== undefined) {
    if (row.mediaItemId) {
      await db
        .update(websiteMediaItems)
        .set({
          ...(category !== undefined ? { aiCategory: category } : {}),
          ...(contentType !== undefined ? { aiContentType: contentType } : {}),
          ...(suggestedPlacement !== undefined ? { aiSuggestedPlacement: suggestedPlacement } : {}),
          updatedAt: now,
        })
        .where(eq(websiteMediaItems.id, row.mediaItemId));
    }
  }

  return enrichDraft(row);
}

export async function approveWebsiteDraft(
  id: string,
  reviewedBy = 'kellie',
): Promise<WebsiteDraftRecord | null> {
  const now = new Date();
  const [row] = await db
    .update(websiteDrafts)
    .set({
      status: 'approved',
      reviewedBy,
      reviewedAt: now,
      rejectionReason: null,
      updatedAt: now,
    })
    .where(eq(websiteDrafts.id, id))
    .returning();
  return row ? enrichDraft(row) : null;
}

export async function rejectWebsiteDraft(
  id: string,
  reason?: string,
  reviewedBy = 'kellie',
): Promise<WebsiteDraftRecord | null> {
  const now = new Date();
  const [row] = await db
    .update(websiteDrafts)
    .set({
      status: 'rejected',
      reviewedBy,
      reviewedAt: now,
      rejectionReason: reason ?? 'Rejected by Kellie',
      updatedAt: now,
    })
    .where(eq(websiteDrafts.id, id))
    .returning();
  return row ? enrichDraft(row) : null;
}
