import OpenAI from 'openai';
import { z } from 'zod';
import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { creatorDraftAssets, shareIntakeSubmissions } from '../schema.js';
import { env } from '../env.js';
import {
  deleteExtractedAudio,
  extractAudioFromVideo,
  probeMediaDurationSeconds,
} from '../intake/ffmpeg-utils.js';
import { deleteIntakeMedia } from '../intake/media-storage.js';
import { transcribeAudioFile } from '../intake/transcribe.js';
import { analyzeVideoTranscript } from '../intake/video-analysis.js';
import { deleteSampledFrames, sampleVideoFrames } from './frame-sampling.js';
import { analyzeDraftVisuals } from './visual-analysis.js';
import { buildPostingRecommendation } from './recommendations.js';
import { matchDraftToOpportunities } from './opportunity-match.js';
import { appendDraftMemory } from './memory.js';
import { humanDraftTitle, humanIntakeTitle, looksLikeDeviceFilename } from './display-title.js';
import { saveIntakePreviewFromFrameFile } from '../intake/preview-frame.js';
import { normalizeCreatorNameInText, creatorFirstName } from '../creator-display.js';

function formatDraftProcessingError(err: unknown): string {
  if (err instanceof z.ZodError) {
    const fields = [...new Set(err.issues.map((issue) => issue.path.join('.')))].slice(0, 3);
    return fields.length
      ? `Analysis response format error (${fields.join(', ')})`
      : 'Analysis response format error';
  }
  return err instanceof Error ? err.message : String(err);
}

function coerceScore(value: unknown, fallback = 0.5): number {
  const n = typeof value === 'string' ? Number.parseFloat(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  const scaled = n > 1 ? n / 100 : n;
  return Math.min(1, Math.max(0, scaled));
}

function coerceHashtagList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).replace(/^#/, '').trim())
      .filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(/[\s,]+/)
      .map((item) => item.replace(/^#/, '').trim())
      .filter(Boolean);
  }
  return [];
}

const ScoreSchema = (fallback: number) =>
  z.preprocess((value) => coerceScore(value, fallback), z.number().min(0).max(1));

function coerceStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

const CombinedSchema = z.object({
  overall_summary: z.coerce.string(),
  audio_summary: z.coerce.string().nullable().optional(),
  detected_format: z.coerce.string().nullable().optional(),
  detected_content_theme: z.coerce.string().nullable().optional(),
  pacing_assessment: z.coerce.string().nullable().optional(),
  audio_quality_notes: z.coerce.string().nullable().optional(),
  suggested_caption: z.coerce.string().nullable().optional(),
  suggested_hashtags: z.preprocess(coerceHashtagList, z.array(z.string())).default([]),
  suggested_first_comment: z.coerce.string().nullable().optional(),
  suggested_platforms: z.preprocess(coerceStringList, z.array(z.string())).default(['tiktok']),
  readiness_score: ScoreSchema(0.5).default(0.5),
  post_now_score: ScoreSchema(0.5).default(0.5),
  sponsor_relevance_score: ScoreSchema(0).default(0),
});

async function combineIntelligence(input: {
  transcript: string;
  visualSummary: string;
  userNote?: string | null;
  hasVisual: boolean;
}) {
  if (!env.OPENAI_API_KEY?.trim()) {
    return {
      overall_summary: input.visualSummary || input.transcript.slice(0, 400),
      audio_summary: input.transcript.slice(0, 300),
      suggested_caption: input.transcript.slice(0, 280),
      suggested_hashtags: ['KansasCity', 'KC'],
      suggested_first_comment: 'Save this for your KC weekend ✨',
      suggested_platforms: ['tiktok'],
      readiness_score: 0.5,
      post_now_score: 0.45,
      sponsor_relevance_score: 0.2,
      detected_format: null,
      detected_content_theme: null,
      pacing_assessment: null,
      audio_quality_notes: null,
    };
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: env.BENSON_ASK_MODEL,
    temperature: 0.4,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          `Merge transcript + visual notes for an unposted creator draft by ${creatorFirstName()}. ` +
          'Return JSON: overall_summary, audio_summary, detected_format, detected_content_theme, pacing_assessment, audio_quality_notes, suggested_caption, suggested_hashtags, suggested_first_comment, suggested_platforms, readiness_score, post_now_score, sponsor_relevance_score. ' +
          'The creator is Kellie — never Kelly. Summaries must not use device filenames as titles.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          hasVisual: input.hasVisual,
          transcript: input.transcript.slice(0, 8000),
          visualSummary: input.visualSummary,
          userNote: input.userNote,
        }),
      },
    ],
  });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('empty combine');
  return CombinedSchema.parse(JSON.parse(content));
}

export async function processDraftAsset(draftId: string): Promise<void> {
  let draft = await db.query.creatorDraftAssets.findFirst({
    where: eq(creatorDraftAssets.id, draftId),
  });
  if (!draft) return;
  if (['analyzed', 'ready_to_post', 'posted', 'completed', 'scrapped'].includes(draft.status)) {
    return;
  }

  if (!draft.tempFilePath && draft.shareIntakeId) {
    const intake = await db.query.shareIntakeSubmissions.findFirst({
      where: eq(shareIntakeSubmissions.id, draft.shareIntakeId),
    });
    if (intake?.tempFilePath) {
      await db
        .update(creatorDraftAssets)
        .set({ tempFilePath: intake.tempFilePath, updatedAt: new Date() })
        .where(eq(creatorDraftAssets.id, draftId));
      draft = { ...draft, tempFilePath: intake.tempFilePath };
    }
  }

  let extractedAudioPath: string | null = null;
  let sampledFrames: Awaited<ReturnType<typeof sampleVideoFrames>>['frames'] = [];
  let processingSucceeded = false;

  try {
    await db
      .update(creatorDraftAssets)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(eq(creatorDraftAssets.id, draftId));

    let transcript = draft.transcriptText ?? draft.rawCaptionOrText ?? '';
    let segments = (draft.transcriptSegmentsJson as Array<{ start: number; end: number; text: string }>) ?? [];
    let durationSeconds = draft.durationSeconds ? Number(draft.durationSeconds) : null;
    const hasVideoFile = draft.sourceType === 'video' && Boolean(draft.tempFilePath);
    const hasAudioFile =
      (draft.sourceType === 'audio' || draft.sourceType === 'video') && Boolean(draft.tempFilePath);

    if (hasAudioFile && draft.tempFilePath && !transcript.trim()) {
      let audioPath = draft.tempFilePath;
      if (draft.sourceType === 'video') {
        const extracted = await extractAudioFromVideo(draft.tempFilePath);
        extractedAudioPath = extracted.audioPath;
        audioPath = extracted.audioPath;
        durationSeconds = extracted.durationSeconds ?? durationSeconds;
      } else if (!durationSeconds) {
        durationSeconds = await probeMediaDurationSeconds(draft.tempFilePath);
      }

      const transcription = await transcribeAudioFile(audioPath, draft.originalFilename);
      transcript = transcription.text;
      segments = transcription.segments;
    }

    let visual = {
      visualSummary: '',
      hookAssessment: null as string | null,
      visualQualityNotes: null as string | null,
      lightingNotes: null as string | null,
      possibleCoverText: null as string | null,
      bestCoverFrameNotes: null as string | null,
      detectedProducts: [] as string[],
      detectedBrands: [] as string[],
      detectedLocations: [] as string[],
      detectedPeopleOrRoles: [] as string[],
      frameSummaries: [] as Array<{ timestamp_seconds: number; label: string; description: string }>,
    };

    if (hasVideoFile && draft.tempFilePath) {
      const sampled = await sampleVideoFrames(draft.tempFilePath);
      sampledFrames = sampled.frames;
      durationSeconds = sampled.durationSeconds ?? durationSeconds;
      const analysis = await analyzeDraftVisuals({
        frames: sampled.frames,
        transcript,
        userNote: draft.userNote,
      });
      visual = {
        visualSummary: analysis.visualSummary,
        hookAssessment: analysis.hookAssessment,
        visualQualityNotes: analysis.visualQualityNotes,
        lightingNotes: analysis.lightingNotes,
        possibleCoverText: analysis.possibleCoverText,
        bestCoverFrameNotes: analysis.bestCoverFrameNotes,
        detectedProducts: analysis.detectedProducts,
        detectedBrands: analysis.detectedBrands,
        detectedLocations: analysis.detectedLocations,
        detectedPeopleOrRoles: analysis.detectedPeopleOrRoles,
        frameSummaries: analysis.frameSummaries,
      };
    }

    const contextLimitations =
      draft.sourceType === 'transcript' || draft.sourceType === 'caption_file'
        ? 'I can judge what is said here, but I do not have full visual context.'
        : hasVideoFile && !visual.visualSummary
          ? 'Benson could not sample video frames — visual context is limited.'
          : !hasVideoFile && transcript
            ? 'Benson has audio/transcript only — visual context is limited.'
            : null;

    const transcriptAnalysis =
      transcript.trim().length > 0
        ? await analyzeVideoTranscript({
            transcript,
            segments,
            notes: draft.userNote,
            rawText: draft.rawCaptionOrText,
            filename: draft.originalFilename,
            durationSeconds,
            intakeType: draft.sourceType === 'audio' ? 'audio' : 'video',
          })
        : null;

    const combined = transcript.trim()
      ? await combineIntelligence({
          transcript,
          visualSummary: visual.visualSummary,
          userNote: draft.userNote,
          hasVisual: Boolean(visual.visualSummary),
        })
      : {
          overall_summary: visual.visualSummary || 'Draft received — limited content to analyze.',
          audio_summary: null,
          suggested_caption: null,
          suggested_hashtags: ['KansasCity', 'KC'],
          suggested_first_comment: null,
          suggested_platforms: ['tiktok'],
          readiness_score: 0.3,
          post_now_score: 0.25,
          sponsor_relevance_score: 0,
          detected_format: null,
          detected_content_theme: null,
          pacing_assessment: null,
          audio_quality_notes: null,
        };

    const now = new Date();
    const suggestedCaptionRaw =
      combined.suggested_caption ??
      transcriptAnalysis?.caption_suggestions?.[0]?.text ??
      null;
    const hookRaw = visual.hookAssessment ?? transcriptAnalysis?.hook_summary ?? null;
    const patch: Partial<typeof creatorDraftAssets.$inferInsert> = {
      transcriptText: transcript ? normalizeCreatorNameInText(transcript) : null,
      transcriptSegmentsJson: segments.length ? segments : null,
      durationSeconds: durationSeconds != null ? String(durationSeconds) : null,
      visualSummary: visual.visualSummary || null,
      audioSummary: normalizeCreatorNameInText(
        combined.audio_summary ?? transcriptAnalysis?.summary ?? null,
      ),
      overallSummary: normalizeCreatorNameInText(combined.overall_summary),
      frameSummariesJson: visual.frameSummaries.length ? visual.frameSummaries : null,
      detectedProductsJson:
        visual.detectedProducts.length > 0
          ? visual.detectedProducts
          : transcriptAnalysis?.detected_products ?? null,
      detectedBrandsJson:
        visual.detectedBrands.length > 0
          ? visual.detectedBrands
          : transcriptAnalysis?.detected_brands ?? null,
      detectedLocationsJson:
        visual.detectedLocations.length > 0
          ? visual.detectedLocations
          : transcriptAnalysis?.detected_locations ?? null,
      detectedPeopleOrRolesJson: visual.detectedPeopleOrRoles.length
        ? visual.detectedPeopleOrRoles
        : null,
      detectedContentTheme:
        combined.detected_content_theme ?? transcriptAnalysis?.content_theme ?? null,
      detectedFormat: combined.detected_format,
      hookAssessment: hookRaw ? normalizeCreatorNameInText(hookRaw) : null,
      pacingAssessment: combined.pacing_assessment,
      visualQualityNotes: visual.visualQualityNotes,
      audioQualityNotes: combined.audio_quality_notes,
      lightingNotes: visual.lightingNotes,
      possibleCoverText: visual.possibleCoverText,
      bestCoverFrameNotes: visual.bestCoverFrameNotes,
      suggestedCaption: suggestedCaptionRaw
        ? normalizeCreatorNameInText(suggestedCaptionRaw)
        : null,
      draftTitle:
        humanDraftTitle({
          draftTitle: draft.draftTitle,
          suggestedCaption: suggestedCaptionRaw,
          overallSummary: combined.overall_summary,
          hookAssessment: hookRaw,
        }) ?? draft.draftTitle,
      suggestedHashtagsJson: combined.suggested_hashtags,
      suggestedFirstComment: combined.suggested_first_comment,
      suggestedPlatformsJson: combined.suggested_platforms,
      readinessScore: String(combined.readiness_score.toFixed(3)),
      postNowScore: String(combined.post_now_score.toFixed(3)),
      sponsorRelevanceScore: String(combined.sponsor_relevance_score.toFixed(3)),
      contextLimitations,
      confidenceLevel:
        visual.visualSummary && transcript ? 'high' : transcript ? 'medium' : 'low',
      status: 'analyzed',
      analyzedAt: now,
      updatedAt: now,
      processingError: null,
    };

    await db.update(creatorDraftAssets).set(patch).where(eq(creatorDraftAssets.id, draftId));

    const updated = await db.query.creatorDraftAssets.findFirst({
      where: eq(creatorDraftAssets.id, draftId),
    });
    if (!updated) return;

    const [postingRec, oppMatch] = await Promise.all([
      buildPostingRecommendation(updated, updated.creatorId),
      matchDraftToOpportunities(updated),
    ]);

    const opportunityMatchScore =
      oppMatch.confidence === 'high' ? 0.85 : oppMatch.confidence === 'medium' ? 0.55 : 0.2;

    const nextStatus =
      postingRec.recommended_action === 'revise'
        ? 'revise'
        : postingRec.should_post === 'yes'
          ? 'ready_to_post'
          : 'needs_review';

    await db
      .update(creatorDraftAssets)
      .set({
        postingRecommendationJson: postingRec,
        opportunityMatchJson: oppMatch,
        opportunityMatchScore: String(opportunityMatchScore.toFixed(3)),
        linkedOpportunityId:
          oppMatch.confidence === 'high' && oppMatch.opportunity_id
            ? oppMatch.opportunity_id
            : updated.linkedOpportunityId,
        suggestedPostWindow: postingRec.recommended_time,
        status: nextStatus,
        updatedAt: new Date(),
      })
      .where(eq(creatorDraftAssets.id, draftId));

    if (draft.shareIntakeId) {
      let previewImagePath: string | null = null;
      if (hasVideoFile && sampledFrames.length > 0) {
        previewImagePath = await saveIntakePreviewFromFrameFile(
          sampledFrames[0]!.file_path,
          draft.shareIntakeId,
        );
      }

      const intakeTitle = humanIntakeTitle({
        extractedTitle: updated.draftTitle,
        hookSummary: updated.hookAssessment,
        aiSummary: updated.overallSummary,
        intakeType: 'video',
        captionSuggestionsJson: updated.suggestedCaption
          ? [{ text: updated.suggestedCaption }]
          : null,
      });

      await db
        .update(shareIntakeSubmissions)
        .set({
          aiSummary: updated.overallSummary,
          extractedTitle: intakeTitle,
          hookSummary: updated.hookAssessment,
          transcriptText: transcript || null,
          processingStatus: 'ready',
          reviewStatus: 'needs_review',
          ...(previewImagePath ? { uploadedImagePath: previewImagePath } : {}),
          updatedAt: new Date(),
        })
        .where(eq(shareIntakeSubmissions.id, draft.shareIntakeId));
    }

    await appendDraftMemory({
      action: 'analyzed',
      draftAssetId: draftId,
      summary: `Benson watched draft "${draft.draftTitle ?? 'untitled'}" — ${postingRec.recommended_action}.`,
      via: 'benson',
    });
    processingSucceeded = true;
  } catch (err) {
    const message = formatDraftProcessingError(err);
    await db
      .update(creatorDraftAssets)
      .set({
        status: 'failed',
        processingError: message,
        overallSummary: `Benson could not finish analyzing this draft: ${message}`,
        updatedAt: new Date(),
      })
      .where(eq(creatorDraftAssets.id, draftId));
  } finally {
    await deleteExtractedAudio(extractedAudioPath);
    await deleteSampledFrames(sampledFrames);
    const keepMedia = Boolean((draft.metadata as Record<string, unknown>)?.keepTempMedia);
    if (processingSucceeded && !keepMedia && draft.tempFilePath) {
      await deleteIntakeMedia(draft.tempFilePath);
      await db
        .update(creatorDraftAssets)
        .set({ tempFilePath: null, updatedAt: new Date() })
        .where(eq(creatorDraftAssets.id, draftId));
    }
  }
}

export async function claimNextDraftForProcessing(): Promise<string | null> {
  const rows = await db
    .select({ id: creatorDraftAssets.id })
    .from(creatorDraftAssets)
    .where(inArray(creatorDraftAssets.status, ['received', 'processing']))
    .orderBy(asc(creatorDraftAssets.createdAt))
    .limit(1);
  return rows[0]?.id ?? null;
}
