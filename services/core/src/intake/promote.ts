import { and, eq } from 'drizzle-orm';
import { db } from '../db.js';
import {
  contentItems,
  shareIntakeSubmissions,
  sources,
  type NewContentItem,
  type ShareIntakeSubmission,
} from '../schema.js';

const SHARE_INTAKE_SOURCE_NAME = 'Share Intake';

export async function getOrCreateShareIntakeSource(campaignId: string): Promise<string> {
  const existing = await db.query.sources.findFirst({
    where: and(
      eq(sources.campaignId, campaignId),
      eq(sources.type, 'manual'),
      eq(sources.name, SHARE_INTAKE_SOURCE_NAME),
    ),
  });
  if (existing) return existing.id;

  const [created] = await db
    .insert(sources)
    .values({
      campaignId,
      type: 'manual',
      name: SHARE_INTAKE_SOURCE_NAME,
      config: { ingest: 'share_intake' },
      active: true,
    })
    .returning({ id: sources.id });

  return created!.id;
}

export type PromoteIntakeResult =
  | { ok: true; contentItemId: string }
  | { ok: false; reason: 'duplicate_url' | 'already_processed'; existingContentItemId?: string };

export async function promoteIntakeToContentItem(
  intake: ShareIntakeSubmission,
  reviewedBy: string,
): Promise<PromoteIntakeResult> {
  if (intake.reviewStatus === 'approved' && intake.promotedContentItemId) {
    return {
      ok: false,
      reason: 'already_processed',
      existingContentItemId: intake.promotedContentItemId,
    };
  }

  if (intake.originalUrl) {
    const urlDup = await db.query.contentItems.findFirst({
      where: eq(contentItems.sourceUrl, intake.originalUrl),
    });
    if (urlDup) {
      return { ok: false, reason: 'duplicate_url', existingContentItemId: urlDup.id };
    }
  }

  const sourceId = await getOrCreateShareIntakeSource(intake.campaignId);
  const now = new Date();
  const title =
    intake.extractedTitle?.trim() ||
    intake.rawText?.trim().slice(0, 500) ||
    intake.originalUrl ||
    'Shared opportunity';

  const row: NewContentItem = {
    campaignId: intake.campaignId,
    type: 'industry_insight',
    language: 'en',
    state: 'planned',
    topic: title.slice(0, 500),
    hook: intake.aiSummary?.slice(0, 500) ?? null,
    script: intake.aiSummary?.slice(0, 4000) ?? intake.rawText?.slice(0, 4000) ?? null,
    sourceId,
    sourceExternalId: `share-intake-${intake.id}`,
    sourceUrl: intake.originalUrl,
    discoveredAt: intake.submittedAt,
    eventStartsAt: intake.extractedDate,
    locationName: intake.extractedLocation,
    metadata: {
      ingest: 'share_intake',
      opportunityCategory: intake.extractedCategory,
      tags: intake.extractedTags ?? [],
      shareIntake: {
        intakeId: intake.id,
        intakeType: intake.intakeType,
        sourceType: intake.sourceType,
        extractedBusiness: intake.extractedBusiness,
        confidenceScore: intake.confidenceScore,
        notes: intake.notes,
        uploadedImagePath: intake.uploadedImagePath,
        uploadedImageUrl: intake.uploadedImageUrl,
        submittedBy: intake.submittedBy,
        extractionStub: true,
      },
    },
    rawPayload: {
      intakeId: intake.id,
      originalUrl: intake.originalUrl,
      rawText: intake.rawText,
      notes: intake.notes,
    },
  };

  const [created] = await db.insert(contentItems).values(row).returning({ id: contentItems.id });

  await db
    .update(shareIntakeSubmissions)
    .set({
      reviewStatus: 'approved',
      promotedContentItemId: created!.id,
      reviewedBy,
      reviewedAt: now,
      updatedAt: now,
    })
    .where(eq(shareIntakeSubmissions.id, intake.id));

  return { ok: true, contentItemId: created!.id };
}

const AUTO_PROMOTE_CONFIDENCE = 0.85;

/** Promote high-confidence share intake without manual review when safe. */
export async function maybeAutoPromoteIntake(
  intake: ShareIntakeSubmission,
): Promise<PromoteIntakeResult | null> {
  if (intake.reviewStatus !== 'needs_review') return null;

  const score = Number.parseFloat(intake.confidenceScore ?? '0');
  if (!Number.isFinite(score) || score < AUTO_PROMOTE_CONFIDENCE) return null;

  if (intake.originalUrl) {
    const urlDup = await db.query.contentItems.findFirst({
      where: eq(contentItems.sourceUrl, intake.originalUrl),
    });
    if (urlDup) return null;
  }

  return promoteIntakeToContentItem(intake, 'benson-auto');
}

export async function rejectIntakeSubmission(
  intakeId: string,
  reviewedBy: string,
  reason?: string,
): Promise<ShareIntakeSubmission | null> {
  const [updated] = await db
    .update(shareIntakeSubmissions)
    .set({
      reviewStatus: 'rejected',
      rejectionReason: reason ?? null,
      reviewedBy,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(shareIntakeSubmissions.id, intakeId),
        eq(shareIntakeSubmissions.reviewStatus, 'needs_review'),
      ),
    )
    .returning();

  return updated ?? null;
}
