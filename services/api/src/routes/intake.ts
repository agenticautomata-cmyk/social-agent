import { Hono } from 'hono';
import { and, desc, eq, inArray } from 'drizzle-orm';
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
  saveIntakeMedia,
  resolveMediaIntakeType,
  maxBytesForMediaType,
  retryShareIntakeMedia,
  TOO_LARGE_MESSAGE,
  extractIntakeSubmission,
  maybeAutoPromoteIntake,
  createPostPackageFromIntake,
  addIntakeToPlanner,
  archiveShareIntake,
  readIntakePreview,
} from '@social-agent/core/intake';
import { createDraftFromShareIntake, queueDraftProcessing, humanIntakeTitle, looksLikeDeviceFilename } from '@social-agent/core/draft-intelligence';
import { resolveOperatorCreatorId } from '@social-agent/core/tiktok-operator';

export const intakeRoute = new Hono();

const ShareJsonSchema = z.object({
  intakeType: z.enum(['url', 'text', 'image', 'mixed', 'video', 'audio']).optional(),
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

async function resolveShareCreatorId(): Promise<string | null> {
  try {
    return await resolveOperatorCreatorId();
  } catch {
    return null;
  }
}

function serializeIntake(row: typeof shareIntakeSubmissions.$inferSelect) {
  const displayTitle = humanIntakeTitle({
    extractedTitle: row.extractedTitle,
    hookSummary: row.hookSummary,
    aiSummary: row.aiSummary,
    intakeType: row.intakeType,
    captionSuggestionsJson: row.captionSuggestionsJson,
  });
  const previewUrl = row.uploadedImagePath ? `/api/intake/${row.id}/preview` : null;
  return {
    id: row.id,
    campaignId: row.campaignId,
    creatorId: row.creatorId,
    sourceType: row.sourceType,
    intakeType: row.intakeType,
    originalUrl: row.originalUrl,
    rawText: row.rawText,
    notes: row.notes,
    uploadedImagePath: row.uploadedImagePath,
    uploadedImageUrl: row.uploadedImageUrl,
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    durationSeconds: row.durationSeconds,
    tempFilePath: row.tempFilePath,
    transcriptText: row.transcriptText,
    transcriptSegmentsJson: row.transcriptSegmentsJson,
    contentTheme: row.contentTheme,
    hookSummary: row.hookSummary,
    keyMomentsJson: row.keyMomentsJson,
    sponsorRelevance: row.sponsorRelevance,
    detectedProductsJson: row.detectedProductsJson,
    detectedBrandsJson: row.detectedBrandsJson,
    detectedLocationsJson: row.detectedLocationsJson,
    captionSuggestionsJson: row.captionSuggestionsJson,
    hashtagSuggestionsJson: row.hashtagSuggestionsJson,
    followUpIdeasJson: row.followUpIdeasJson,
    processingStatus: row.processingStatus,
    processingError: row.processingError,
    linkedPostPackageId: row.linkedPostPackageId,
    linkedPlannerItemId: row.linkedPlannerItemId,
    aiSummary: row.aiSummary,
    extractedTitle: looksLikeDeviceFilename(row.extractedTitle) ? displayTitle : row.extractedTitle,
    displayTitle,
    previewUrl,
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

function pickMediaFile(body: Record<string, unknown>): File | null {
  for (const key of ['video', 'audio', 'media', 'file', 'files']) {
    const value = body[key];
    if (value instanceof File && value.size > 0) return value;
  }
  return null;
}

async function createMediaIntakeSubmission(input: {
  campaignId: string;
  creatorId: string | null;
  submittedBy: string;
  url?: string | null;
  text?: string | null;
  notes?: string | null;
  categorySuggestion?: string | null;
  media: Awaited<ReturnType<typeof saveIntakeMedia>>;
  intakeType: 'video' | 'audio';
}) {
  const title =
    input.intakeType === 'video'
      ? 'Shared video draft'
      : input.intakeType === 'audio'
        ? 'Shared audio draft'
        : 'Shared media';

  const [row] = await db
    .insert(shareIntakeSubmissions)
    .values({
      campaignId: input.campaignId,
      creatorId: input.creatorId,
      sourceType: 'share_to_benson',
      intakeType: input.intakeType,
      originalUrl: input.url?.trim() || null,
      rawText: input.text?.trim() || null,
      notes: input.notes?.trim() || null,
      originalFilename: input.media.original_filename,
      mimeType: input.media.mime_type,
      fileSize: input.media.file_size,
      tempFilePath: input.media.temp_file_path,
      aiSummary:
        input.intakeType === 'video'
          ? 'Benson is reading this video…'
          : 'Benson is listening to this audio…',
      extractedTitle: title,
      extractedCategory: input.categorySuggestion ?? null,
      reviewStatus: 'pending_ai',
      processingStatus: 'queued',
      submittedBy: input.submittedBy,
      clientMetadata: {
        categorySuggestion: input.categorySuggestion ?? null,
        shareChannel: 'share_to_benson',
      },
    })
    .returning();

  return row!;
}

async function createTooLargeMediaIntake(input: {
  campaignId: string;
  creatorId: string | null;
  submittedBy: string;
  url?: string | null;
  text?: string | null;
  notes?: string | null;
  categorySuggestion?: string | null;
  file: File;
  intakeType: 'video' | 'audio';
}) {
  const [row] = await db
    .insert(shareIntakeSubmissions)
    .values({
      campaignId: input.campaignId,
      creatorId: input.creatorId,
      sourceType: 'share_to_benson',
      intakeType: input.intakeType,
      originalUrl: input.url?.trim() || null,
      rawText: input.text?.trim() || null,
      notes: input.notes?.trim() || null,
      originalFilename: input.file.name || null,
      mimeType: input.file.type || null,
      fileSize: input.file.size,
      aiSummary: TOO_LARGE_MESSAGE,
      extractedTitle: input.file.name || 'Shared media (too large)',
      extractedCategory: input.categorySuggestion ?? null,
      reviewStatus: 'needs_review',
      processingStatus: 'too_large',
      processingError: TOO_LARGE_MESSAGE,
      submittedBy: input.submittedBy,
      clientMetadata: {
        categorySuggestion: input.categorySuggestion ?? null,
        shareChannel: 'share_to_benson',
        maxBytes: maxBytesForMediaType(input.intakeType),
      },
    })
    .returning();

  return row!;
}

async function createIntakeSubmission(input: {
  campaignId: string;
  creatorId?: string | null;
  intakeType: 'url' | 'text' | 'image' | 'mixed';
  url?: string | null;
  text?: string | null;
  notes?: string | null;
  categorySuggestion?: string | null;
  submittedBy: string;
  uploadedImagePath?: string | null;
  uploadedImageUrl?: string | null;
  imagePlaceholder?: boolean;
  imageBase64?: string | null;
  imageMimeType?: string | null;
  manualFields?: {
    extractedTitle?: string | null;
    extractedDate?: string | null;
    extractedLocation?: string | null;
    extractedBusiness?: string | null;
  };
}) {
  const hasImage = Boolean(input.uploadedImagePath || input.imagePlaceholder);
  const extracted = await extractIntakeSubmission({
    intakeType: input.intakeType,
    url: input.url,
    text: input.text,
    notes: input.notes,
    categorySuggestion: input.categorySuggestion,
    hasImage,
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
  });

  const extractedDate = input.manualFields?.extractedDate
    ? new Date(input.manualFields.extractedDate)
    : extracted.extracted_date;

  const [row] = await db
    .insert(shareIntakeSubmissions)
    .values({
      campaignId: input.campaignId,
      creatorId: input.creatorId ?? null,
      sourceType: 'share_to_benson',
      intakeType: input.intakeType,
      originalUrl: input.url?.trim() || null,
      rawText: input.text?.trim() || null,
      notes: input.notes?.trim() || null,
      uploadedImagePath: input.uploadedImagePath ?? null,
      uploadedImageUrl: input.uploadedImageUrl ?? null,
      aiSummary: extracted.ai_summary,
      extractedTitle:
        input.manualFields?.extractedTitle?.trim() || extracted.extracted_title,
      extractedDate,
      extractedLocation: input.manualFields?.extractedLocation?.trim() || extracted.extracted_location,
      extractedBusiness: input.manualFields?.extractedBusiness?.trim() || extracted.extracted_business,
      extractedCategory: extracted.extracted_category,
      extractedTags: extracted.extracted_tags,
      confidenceScore: String(extracted.confidence_score),
      reviewStatus: 'needs_review',
      submittedBy: input.submittedBy,
      clientMetadata: {
        extractionStub: extracted.extraction_stub,
        imagePlaceholder: input.imagePlaceholder ?? false,
        categorySuggestion: input.categorySuggestion ?? null,
        shareChannel: 'share_to_benson',
      },
    })
    .returning();

  return row!;
}

intakeRoute.get('/', async (c) => {
  const reviewStatusParam = c.req.query('reviewStatus') ?? 'needs_review';
  const campaignId = c.req.query('campaignId');

  const statuses = reviewStatusParam.split(',').map((s) => s.trim()).filter(Boolean);
  const conditions = [];
  if (statuses.length === 1) {
    conditions.push(eq(shareIntakeSubmissions.reviewStatus, statuses[0] as 'needs_review'));
  } else if (statuses.length > 1) {
    conditions.push(
      inArray(
        shareIntakeSubmissions.reviewStatus,
        statuses as Array<'pending_ai' | 'needs_review' | 'approved' | 'rejected'>,
      ),
    );
  }
  if (campaignId) conditions.push(eq(shareIntakeSubmissions.campaignId, campaignId));

  const rows = await db
    .select()
    .from(shareIntakeSubmissions)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(shareIntakeSubmissions.submittedAt))
    .limit(100);

  return c.json({ items: rows.map(serializeIntake) });
});

intakeRoute.get('/:id/preview', async (c) => {
  const id = c.req.param('id');
  const row = await db.query.shareIntakeSubmissions.findFirst({
    where: eq(shareIntakeSubmissions.id, id),
  });
  if (!row?.uploadedImagePath) return c.json({ error: 'not found' }, 404);

  const file = await readIntakePreview(row.uploadedImagePath);
  if (!file) return c.json({ error: 'not found' }, 404);

  return new Response(file.buffer, {
    headers: {
      'Content-Type': file.mimeType,
      'Cache-Control': 'private, max-age=3600',
    },
  });
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
  const creatorId = await resolveShareCreatorId();

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
    const mediaFile = pickMediaFile(body);

    if (!url?.trim() && !text?.trim() && !imageFile && !imagePlaceholder && !mediaFile) {
      return c.json({ error: 'empty_payload', message: 'Provide url, text, image, or media.' }, 422);
    }

    const campaignId = await defaultCampaignId(campaignIdRaw);

    if (mediaFile) {
      const mediaType = resolveMediaIntakeType(mediaFile.type || '', mediaFile.name || '');
      if (!mediaType) {
        return c.json({ error: 'unsupported_media_type', message: 'Unsupported video or audio format.' }, 422);
      }

      const maxBytes = maxBytesForMediaType(mediaType);
      if (mediaFile.size > maxBytes) {
        const row = await createTooLargeMediaIntake({
          campaignId,
          creatorId,
          submittedBy,
          url,
          text,
          notes,
          categorySuggestion,
          file: mediaFile,
          intakeType: mediaType,
        });
        return c.json(
          {
            intakeId: row.id,
            reviewStatus: row.reviewStatus,
            processingStatus: row.processingStatus,
            message: TOO_LARGE_MESSAGE,
            intake: serializeIntake(row),
          },
          202,
        );
      }

      const saved = await saveIntakeMedia(mediaFile);
      const row = await createMediaIntakeSubmission({
        campaignId,
        creatorId,
        submittedBy,
        url,
        text,
        notes,
        categorySuggestion,
        media: saved,
        intakeType: saved.intake_type,
      });

      const draftId = await createDraftFromShareIntake(row.id);
      if (draftId) await queueDraftProcessing(draftId);

      return c.json(
        {
          intakeId: row.id,
          draftId,
          reviewStatus: row.reviewStatus,
          processingStatus: row.processingStatus,
          message:
            saved.intake_type === 'video'
              ? 'Benson is reading your video — check back in a moment.'
              : 'Benson is listening to your audio — check back in a moment.',
          intake: serializeIntake(row),
        },
        202,
      );
    }

    let uploadedImagePath: string | null = null;
    let uploadedImageUrl: string | null = null;
    let imageBase64: string | null = null;
    let imageMimeType: string | null = null;
    if (imageFile && imageFile.size > 0) {
      const saved = await saveIntakeImage(imageFile);
      uploadedImagePath = saved.uploaded_image_path;
      uploadedImageUrl = saved.uploaded_image_url;
      const buffer = Buffer.from(await imageFile.arrayBuffer());
      imageBase64 = buffer.toString('base64');
      imageMimeType = imageFile.type || 'image/jpeg';
    }

    const intakeType = resolveIntakeType(
      Boolean(url?.trim()),
      Boolean(text?.trim()),
      Boolean(uploadedImagePath || imagePlaceholder),
    ) as 'url' | 'text' | 'image' | 'mixed';

    const row = await createIntakeSubmission({
      campaignId,
      creatorId,
      intakeType,
      url,
      text,
      notes,
      categorySuggestion,
      submittedBy,
      uploadedImagePath,
      uploadedImageUrl,
      imagePlaceholder,
      imageBase64,
      imageMimeType,
    });

    const auto = await maybeAutoPromoteIntake(row);
    const reviewStatus = auto?.ok === true ? 'approved' : row.reviewStatus;

    return c.json(
      {
        intakeId: row.id,
        reviewStatus,
        autoPromoted: auto?.ok === true,
        contentItemId: auto?.ok === true ? auto.contentItemId : null,
        message:
          auto?.ok === true
            ? 'Benson auto-promoted this share — it is in your inventory now.'
            : 'Benson received your share — review the draft fields when ready.',
        intake: serializeIntake(
          auto?.ok === true
            ? {
                ...row,
                reviewStatus: 'approved',
                promotedContentItemId: auto.contentItemId,
              }
            : row,
        ),
      },
      auto?.ok === true ? 201 : 202,
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

  const intakeTypeRaw =
    data.intakeType ??
    resolveIntakeType(Boolean(url?.trim()), Boolean(text?.trim()), Boolean(data.imagePlaceholder));

  if (intakeTypeRaw === 'video' || intakeTypeRaw === 'audio') {
    return c.json(
      { error: 'use_multipart', message: 'Share video or audio using multipart/form-data.' },
      422,
    );
  }

  const intakeType = intakeTypeRaw as 'url' | 'text' | 'image' | 'mixed';

  const campaignId = await defaultCampaignId(data.campaignId ?? undefined);
  const row = await createIntakeSubmission({
    campaignId,
    creatorId,
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

  const auto = await maybeAutoPromoteIntake(row);
  const reviewStatus = auto?.ok === true ? 'approved' : row.reviewStatus;

  return c.json(
    {
      intakeId: row.id,
      reviewStatus,
      autoPromoted: auto?.ok === true,
      contentItemId: auto?.ok === true ? auto.contentItemId : null,
      message:
        auto?.ok === true
          ? 'Benson auto-promoted this share — it is in your inventory now.'
          : 'Benson received your share — review the draft fields when ready.',
      intake: serializeIntake(
        auto?.ok === true
          ? {
              ...row,
              reviewStatus: 'approved',
              promotedContentItemId: auto.contentItemId,
            }
          : row,
      ),
    },
    auto?.ok === true ? 201 : 202,
  );
});

const RejectSchema = z.object({
  reason: z.string().optional(),
  reviewedBy: z.string().default('dashboard-user'),
});

const ApproveSchema = z.object({
  reviewedBy: z.string().default('dashboard-user'),
});

const ActionSchema = z.object({
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
  if (
    (intake.intakeType === 'video' || intake.intakeType === 'audio') &&
    intake.processingStatus &&
    intake.processingStatus !== 'ready' &&
    intake.processingStatus !== 'too_large' &&
    intake.processingStatus !== 'failed'
  ) {
    return c.json({ error: 'still_processing', processingStatus: intake.processingStatus }, 409);
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

intakeRoute.post('/:id/retry-analysis', async (c) => {
  const id = c.req.param('id');
  const ok = await retryShareIntakeMedia(id);
  if (!ok) {
    return c.json({ error: 'cannot_retry', message: 'No temp media available or intake is not media.' }, 400);
  }
  const row = await db.query.shareIntakeSubmissions.findFirst({
    where: eq(shareIntakeSubmissions.id, id),
  });
  return c.json({ ok: true, intake: row ? serializeIntake(row) : null });
});

intakeRoute.post('/:id/create-post-package', async (c) => {
  const id = c.req.param('id');
  const packageId = await createPostPackageFromIntake(id);
  if (!packageId) {
    return c.json({ error: 'not_ready', message: 'Video analysis must be ready before creating a package.' }, 400);
  }
  return c.json({ ok: true, postPackageId: packageId });
});

intakeRoute.post('/:id/add-to-planner', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const parsed = ActionSchema.safeParse(body);
  const reviewedBy = parsed.success ? parsed.data.reviewedBy : 'dashboard-user';
  const plannerItemId = await addIntakeToPlanner(id, reviewedBy);
  if (!plannerItemId) {
    return c.json({ error: 'failed', message: 'Could not add to planner.' }, 400);
  }
  return c.json({ ok: true, plannerItemId });
});

intakeRoute.post('/:id/archive', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const parsed = ActionSchema.safeParse(body);
  const reviewedBy = parsed.success ? parsed.data.reviewedBy : 'dashboard-user';
  const ok = await archiveShareIntake(id, reviewedBy);
  if (!ok) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});
