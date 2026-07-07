import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db.js';
import { websiteDrafts, websitePublishedItems } from '../schema.js';
import { getWebsiteDraft } from './drafts.js';

export async function publishWebsiteDraft(
  draftId: string,
  publishedBy = 'kellie',
): Promise<{ ok: boolean; error?: string; publishedId?: string }> {
  const draft = await db.query.websiteDrafts.findFirst({
    where: eq(websiteDrafts.id, draftId),
  });
  if (!draft) return { ok: false, error: 'Draft not found' };
  if (draft.status === 'rejected') return { ok: false, error: 'Rejected drafts cannot publish' };
  if (draft.status === 'draft') return { ok: false, error: 'Approve the draft before publishing' };

  const now = new Date();

  const existing = await db.query.websitePublishedItems.findFirst({
    where: eq(websitePublishedItems.draftId, draftId),
  });

  if (existing && !existing.unpublishedAt) {
    return { ok: false, error: 'Already published' };
  }

  if (existing?.unpublishedAt) {
    const [reactivated] = await db
      .update(websitePublishedItems)
      .set({
        unpublishedAt: null,
        caption: draft.caption,
        altText: draft.altText,
        headline: draft.headline,
        ctaLabel: draft.ctaLabel,
        ctaHref: draft.ctaHref,
        sortOrder: draft.sortOrder,
        publishedAt: now,
        publishedBy,
        updatedAt: now,
      })
      .where(eq(websitePublishedItems.id, existing.id))
      .returning();

    await db
      .update(websiteDrafts)
      .set({ status: 'published', publishedAt: now, updatedAt: now })
      .where(eq(websiteDrafts.id, draftId));

    return { ok: true, publishedId: reactivated!.id };
  }

  const [published] = await db
    .insert(websitePublishedItems)
    .values({
      draftId: draft.id,
      sectionId: draft.sectionId,
      mediaItemId: draft.mediaItemId,
      caption: draft.caption,
      altText: draft.altText,
      headline: draft.headline,
      ctaLabel: draft.ctaLabel,
      ctaHref: draft.ctaHref,
      sortOrder: draft.sortOrder,
      publishedAt: now,
      publishedBy,
    })
    .returning();

  await db
    .update(websiteDrafts)
    .set({ status: 'published', publishedAt: now, updatedAt: now })
    .where(eq(websiteDrafts.id, draftId));

  return { ok: true, publishedId: published!.id };
}

export async function unpublishWebsiteItem(
  publishedId: string,
  confirm = false,
): Promise<{ ok: boolean; error?: string }> {
  if (!confirm) {
    return { ok: false, error: 'Confirmation required to unpublish' };
  }
  const now = new Date();
  const [row] = await db
    .update(websitePublishedItems)
    .set({ unpublishedAt: now, updatedAt: now })
    .where(and(eq(websitePublishedItems.id, publishedId), isNull(websitePublishedItems.unpublishedAt)))
    .returning();
  if (!row) return { ok: false, error: 'Published item not found' };
  return { ok: true };
}

export async function publishApprovedDraft(draftId: string, publishedBy = 'kellie') {
  const record = await getWebsiteDraft(draftId);
  if (!record) throw new Error('Draft not found');
  if (record.status === 'draft') {
    await approveWebsiteDraftQuick(draftId, publishedBy);
  }
  return publishWebsiteDraft(draftId, publishedBy);
}

async function approveWebsiteDraftQuick(id: string, reviewedBy: string) {
  const now = new Date();
  await db
    .update(websiteDrafts)
    .set({ status: 'approved', reviewedBy, reviewedAt: now, updatedAt: now })
    .where(eq(websiteDrafts.id, id));
}
