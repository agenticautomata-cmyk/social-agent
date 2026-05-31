import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  db,
  campaigns,
  shareIntakeSubmissions,
  contentItems,
} from '@social-agent/core';
import {
  promoteIntakeToContentItem,
  rejectIntakeSubmission,
  resolveIntakeType,
  saveIntakeImage,
  stubExtractIntake,
} from '@social-agent/core/intake';

export const intakeRoute = new Hono();

const ShareJsonSchema = z.object({
  intakeType: z.enum(['url', 'text', 'image', 'mixed']).optional(),
  url: z.string().url().optional().nullable(),
  text: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  categorySuggestion: z.string().optional().nullable(),
  extractedTitle: z.string().optional().nullable(),
  extractedDate: z.string().datetime().optional().nullable(),
  extractedLocation: z.string().optional().nullable(),
  extractedBusiness: z.string().optional().nullable(),
  campaignId: z.string().uuid().optional(),
  submittedBy: z.string().default('dashboard-user'),
  imagePlaceholder: z.boolean().optional(),
});

async function defaultCampaignId(explicit?: string): Promise<string> {
  if (explicit) return explicit;
  const [campaign] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.active, true))
    .orderBy(desc(campaigns.createdAt))
    .limit(1);
  if (!campaign) throw new Error('no active campaign');
  return campaign.id;
}

function serializeIntake(row: typeof shareIntakeSubmissions.$inferSelect) {
  return {
    id: row.id,
    campaignId: row.campaignId,
    sourceType: row.sourceType,
    intakeType: row.intakeType,
    originalUrl: row.originalUrl,
    rawText: row.rawText,
    notes: row.notes,
    uploadedImagePath: row.uploadedImagePath,
    uploadedImageUrl: row.uploadedImageUrl,
    aiSummary: row.aiSummary,
    extractedTitle: row.extractedTitle,
    extractedDate: row.extractedDate?.toISOString() ?? null,
    extractedLocation: row.extractedLocation,
    extractedBusiness: row.extractedBusiness,
    extractedCategory: row.extractedCategory,
    extractedTags: row.extractedTags,
    confidenceScore: row.confidenceScore,
    reviewStatus: row.reviewStatus,
    rejectionReason: row.rejectionReason,
    promotedContentItemId: row.promotedContentItemId,
    submittedBy: row.submittedBy,
    submittedAt: row.submittedAt.toISOString(),
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    clientMetadata: row.clientMetadata,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function createIntakeSubmission(input: {
  campaignId: string;
  intakeType: 'url' | 'text' | 'image' | 'mixed';
  url?: string | null;
  text?: string | null;
  notes?: string | null;
  categorySuggestion?: string | null;
  submittedBy: string;
  uploadedImagePath?: string | null;
  uploadedImageUrl?: string | null;
  imagePlaceholder?: boolean;
  manualFields?: {
    extractedTitle?: string | null;
    extractedDate?: string | null;
    extractedLocation?: string | null;
    extractedBusiness?: string | null;
  };
}) {
  const hasImage = Boolean(input.uploadedImagePath || input.imagePlaceholder);
  const stub = stubExtractIntake({
    intakeType: input.intakeType,
    url: input.url,
    text: input.text,
    notes: input.notes,
    categorySuggestion: input.categorySuggestion,
    hasImage,
  });

  const extractedDate = input.manualFields?.extractedDate
    ? new Date(input.manualFields.extractedDate)
    : stub.extracted_date;

  const [row] = await db
    .insert(shareIntakeSubmissions)
    .values({
      campaignId: input.campaignId,
      sourceType: 'manual_share',
      intakeType: input.intakeType,
      originalUrl: input.url?.trim() || null,
      rawText: input.text?.trim() || null,
      notes: input.notes?.trim() || null,
      uploadedImagePath: input.uploadedImagePath ?? null,
      uploadedImageUrl: input.uploadedImageUrl ?? null,
      aiSummary: stub.ai_summary,
      extractedTitle:
        input.manualFields?.extractedTitle?.trim() || stub.extracted_title,
      extractedDate,
      extractedLocation: input.manualFields?.extractedLocation?.trim() || stub.extracted_location,
      extractedBusiness: input.manualFields?.extractedBusiness?.trim() || stub.extracted_business,
      extractedCategory: stub.extracted_category,
      extractedTags: stub.extracted_tags,
      confidenceScore: String(stub.confidence_score),
      reviewStatus: 'needs_review',
      submittedBy: input.submittedBy,
      clientMetadata: {
        extractionStub: true,
        imagePlaceholder: input.imagePlaceholder ?? false,
        categorySuggestion: input.categorySuggestion ?? null,
      },
    })
    .returning();

  return row!;
}

intakeRoute.get('/', async (c) => {
  const reviewStatusParam = c.req.query('reviewStatus') ?? 'needs_review';
  const campaignId = c.req.query('campaignId');

  const conditions = [eq(shareIntakeSubmissions.reviewStatus, reviewStatusParam as 'needs_review')];
  if (campaignId) conditions.push(eq(shareIntakeSubmissions.campaignId, campaignId));

  const rows = await db
    .select()
    .from(shareIntakeSubmissions)
    .where(and(...conditions))
    .orderBy(desc(shareIntakeSubmissions.submittedAt))
    .limit(100);

  return c.json({ items: rows.map(serializeIntake) });
});

intakeRoute.get('/:id', async (c) => {
  const id = c.req.param('id');
  const row = await db.query.shareIntakeSubmissions.findFirst({
    where: eq(shareIntakeSubmissions.id, id),
  });
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json({ intake: serializeIntake(row) });
});

intakeRoute.post('/share', async (c) => {
  const contentType = c.req.header('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const body = await c.req.parseBody();
    const url = typeof body.url === 'string' ? body.url : undefined;
    const text = typeof body.text === 'string' ? body.text : undefined;
    const notes = typeof body.notes === 'string' ? body.notes : undefined;
    const categorySuggestion =
      typeof body.categorySuggestion === 'string' ? body.categorySuggestion : undefined;
    const submittedBy = typeof body.submittedBy === 'string' ? body.submittedBy : 'dashboard-user';
    const campaignIdRaw = typeof body.campaignId === 'string' ? body.campaignId : undefined;
    const imageFile = body.image instanceof File ? body.image : null;
    const imagePlaceholder = body.imagePlaceholder === 'true';

    if (!url?.trim() && !text?.trim() && !imageFile && !imagePlaceholder) {
      return c.json({ error: 'empty_payload', message: 'Provide url, text, or image.' }, 422);
    }

    let uploadedImagePath: string | null = null;
    let uploadedImageUrl: string | null = null;
    if (imageFile && imageFile.size > 0) {
      const saved = await saveIntakeImage(imageFile);
      uploadedImagePath = saved.uploaded_image_path;
      uploadedImageUrl = saved.uploaded_image_url;
    }

    const intakeType = resolveIntakeType(
      Boolean(url?.trim()),
      Boolean(text?.trim()),
      Boolean(uploadedImagePath || imagePlaceholder),
    );

    const campaignId = await defaultCampaignId(campaignIdRaw);
    const row = await createIntakeSubmission({
      campaignId,
      intakeType,
      url,
      text,
      notes,
      categorySuggestion,
      submittedBy,
      uploadedImagePath,
      uploadedImageUrl,
      imagePlaceholder,
    });

    return c.json(
      {
        intakeId: row.id,
        reviewStatus: row.reviewStatus,
        message: 'Benson received your share — review the draft fields when ready.',
        intake: serializeIntake(row),
      },
      202,
    );
  }

  const body = await c.req.json().catch(() => null);
  const parsed = ShareJsonSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
  }

  const data = parsed.data;
  const url = data.url ?? undefined;
  const text = data.text ?? undefined;

  if (!url?.trim() && !text?.trim() && !data.imagePlaceholder) {
    return c.json({ error: 'empty_payload', message: 'Provide url, text, or imagePlaceholder.' }, 422);
  }

  const intakeType =
    data.intakeType ??
    resolveIntakeType(Boolean(url?.trim()), Boolean(text?.trim()), Boolean(data.imagePlaceholder));

  const campaignId = await defaultCampaignId(data.campaignId ?? undefined);
  const row = await createIntakeSubmission({
    campaignId,
    intakeType,
    url,
    text,
    notes: data.notes ?? undefined,
    categorySuggestion: data.categorySuggestion ?? undefined,
    submittedBy: data.submittedBy,
    imagePlaceholder: data.imagePlaceholder,
    manualFields: {
      extractedTitle: data.extractedTitle,
      extractedDate: data.extractedDate,
      extractedLocation: data.extractedLocation,
      extractedBusiness: data.extractedBusiness,
    },
  });

  return c.json(
    {
      intakeId: row.id,
      reviewStatus: row.reviewStatus,
      message: 'Benson received your share — review the draft fields when ready.',
      intake: serializeIntake(row),
    },
    202,
  );
});

const RejectSchema = z.object({
  reason: z.string().optional(),
  reviewedBy: z.string().default('dashboard-user'),
});

const ApproveSchema = z.object({
  reviewedBy: z.string().default('dashboard-user'),
});

intakeRoute.post('/:id/approve', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const parsed = ApproveSchema.safeParse(body);
  const reviewedBy = parsed.success ? parsed.data.reviewedBy : 'dashboard-user';

  const intake = await db.query.shareIntakeSubmissions.findFirst({
    where: eq(shareIntakeSubmissions.id, id),
  });
  if (!intake) return c.json({ error: 'not found' }, 404);
  if (intake.reviewStatus !== 'needs_review') {
    return c.json({ error: 'invalid_status', reviewStatus: intake.reviewStatus }, 400);
  }

  const result = await promoteIntakeToContentItem(intake, reviewedBy);
  if (!result.ok) {
    if (result.reason === 'duplicate_url') {
      return c.json(
        {
          error: 'duplicate',
          message: 'Benson already has an opportunity with this URL.',
          existingContentItemId: result.existingContentItemId,
        },
        409,
      );
    }
    return c.json(
      {
        error: 'already_processed',
        existingContentItemId: result.existingContentItemId,
      },
      400,
    );
  }

  const contentItem = await db.query.contentItems.findFirst({
    where: eq(contentItems.id, result.contentItemId),
  });

  return c.json({
    ok: true,
    contentItemId: result.contentItemId,
    contentItem,
    intakeId: id,
  });
});

intakeRoute.post('/:id/reject', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const parsed = RejectSchema.safeParse(body);
  const reviewedBy = parsed.success ? parsed.data.reviewedBy : 'dashboard-user';
  const reason = parsed.success ? parsed.data.reason : undefined;

  const updated = await rejectIntakeSubmission(id, reviewedBy, reason);
  if (!updated) {
    return c.json({ error: 'not found or not in needs_review' }, 404);
  }

  return c.json({ ok: true, intake: serializeIntake(updated) });
});
