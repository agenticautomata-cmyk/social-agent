import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { websiteDrafts, websiteMediaItems } from '../schema.js';
import { getWebsiteDraft, type WebsiteDraftRecord } from './drafts.js';
import { reviseWebsiteDraftWithBenson } from './intelligence.js';
import { formatRevisionError, placementToUiLabel } from './normalize-revision.js';
import { readWebsiteMediaFile } from './storage.js';
import {
  completeWebsiteReviseJob,
  createWebsiteReviseJob,
  failWebsiteReviseJob,
  getWebsiteReviseJob,
  type WebsiteReviseJob,
} from './jobs.js';

export type WebsiteDraftReviseResult = {
  draft: WebsiteDraftRecord;
  assistantReply: string;
};

export async function applyWebsiteDraftRevision(
  draftId: string,
  message: string,
): Promise<WebsiteDraftReviseResult> {
  const draft = await getWebsiteDraft(draftId);
  if (!draft) throw new Error('Draft not found');
  if (draft.status === 'published') {
    throw new Error('Unpublish before revising a live item');
  }
  if (!draft.mediaItemId || !draft.media) {
    throw new Error('Draft has no media to analyze');
  }

  const mediaRow = await db.query.websiteMediaItems.findFirst({
    where: eq(websiteMediaItems.id, draft.mediaItemId),
  });
  if (!mediaRow) throw new Error('Media not found');

  let imageBuffer: Buffer | undefined;
  if (mediaRow.mediaKind === 'image') {
    const file = await readWebsiteMediaFile(mediaRow.storageFilename);
    imageBuffer = file?.buffer;
  }

  const revision = await reviseWebsiteDraftWithBenson({
    originalFilename: mediaRow.originalFilename,
    mimeType: mediaRow.mimeType,
    mediaKind: mediaRow.mediaKind as 'image' | 'video',
    imageBuffer,
    currentDraft: {
      title: draft.title,
      sectionId: draft.sectionId,
      caption: draft.caption,
      altText: draft.altText,
      headline: draft.headline,
      ctaLabel: draft.ctaLabel,
      ctaHref: draft.ctaHref,
      bensonReasoning: draft.bensonReasoning,
      category: mediaRow.aiCategory,
      contentType: mediaRow.aiContentType,
      suggestedPlacement: mediaRow.aiSuggestedPlacement,
    },
    message,
  });

  const now = new Date();

  await db
    .update(websiteMediaItems)
    .set({
      aiCategory: revision.category,
      aiCaption: revision.caption,
      aiAltText: revision.altText,
      aiContentType: revision.contentType,
      aiSuggestedPlacement: placementToUiLabel(revision.suggestedPlacement),
      aiMetadata: {
        reasoning: revision.reasoning,
        headline: revision.headline,
        lastRevision: message.trim() || 're-analyze',
        revisedAt: now.toISOString(),
      },
      updatedAt: now,
    })
    .where(eq(websiteMediaItems.id, mediaRow.id));

  await db
    .update(websiteDrafts)
    .set({
      title: revision.title,
      sectionId: revision.sectionId,
      caption: revision.caption,
      altText: revision.altText,
      headline: revision.headline,
      ctaLabel: revision.ctaLabel,
      ctaHref: revision.ctaHref,
      bensonReasoning: revision.reasoning,
      status: 'draft',
      reviewedBy: null,
      reviewedAt: null,
      rejectionReason: null,
      updatedAt: now,
    })
    .where(eq(websiteDrafts.id, draftId));

  const updated = await getWebsiteDraft(draftId);
  if (!updated) throw new Error('Failed to load revised draft');

  return { draft: updated, assistantReply: revision.assistantReply };
}

export function startWebsiteDraftRevisionJob(
  draftId: string,
  message: string,
): WebsiteReviseJob {
  const job = createWebsiteReviseJob(draftId);
  void applyWebsiteDraftRevision(draftId, message)
    .then((result) => completeWebsiteReviseJob(job.id, result))
    .catch((err) =>
      failWebsiteReviseJob(job.id, formatRevisionError(err)),
    );
  return job;
}

export { getWebsiteReviseJob };
