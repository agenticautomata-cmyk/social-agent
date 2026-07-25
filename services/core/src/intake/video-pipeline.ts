import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { shareIntakeSubmissions } from '../schema.js';
import { humanIntakeTitle } from '../draft-intelligence/display-title.js';
import { normalizeCreatorNameInText } from '../creator-display.js';
import { deleteExtractedAudio, extractAudioFromVideo, probeMediaDurationSeconds } from './ffmpeg-utils.js';
import { deleteIntakeMedia } from './media-storage.js';
import { saveIntakePreviewFromVideo } from './preview-frame.js';
import { analyzeVideoTranscript } from './video-analysis.js';
import { transcribeAudioFile } from './transcribe.js';

const TOO_LARGE_MESSAGE =
  'This video is too large for Benson to process from Share right now. Try trimming it, sending a shorter clip, or sending a voice note describing it.';

async function setProcessingStatus(
  intakeId: string,
  status: typeof shareIntakeSubmissions.$inferSelect.processingStatus,
  patch: Partial<typeof shareIntakeSubmissions.$inferInsert> = {},
): Promise<void> {
  await db
    .update(shareIntakeSubmissions)
    .set({
      processingStatus: status,
      updatedAt: new Date(),
      ...patch,
    })
    .where(eq(shareIntakeSubmissions.id, intakeId));
}

export async function processShareIntakeMedia(intakeId: string): Promise<void> {
  const intake = await db.query.shareIntakeSubmissions.findFirst({
    where: eq(shareIntakeSubmissions.id, intakeId),
  });
  if (!intake) return;
  if (intake.intakeType !== 'video' && intake.intakeType !== 'audio') return;
  if (intake.processingStatus === 'ready' || intake.processingStatus === 'too_large') return;

  let extractedAudioPath: string | null = null;

  try {
    if (!intake.tempFilePath) {
      throw new Error('missing_temp_file');
    }

    let audioPath = intake.tempFilePath;
    let durationSeconds = intake.durationSeconds ? Number(intake.durationSeconds) : null;

    if (intake.intakeType === 'video') {
      await setProcessingStatus(intakeId, 'extracting_audio');
      const extracted = await extractAudioFromVideo(intake.tempFilePath);
      extractedAudioPath = extracted.audioPath;
      audioPath = extracted.audioPath;
      durationSeconds = extracted.durationSeconds ?? durationSeconds;
    } else if (!durationSeconds) {
      durationSeconds = await probeMediaDurationSeconds(intake.tempFilePath);
    }

    await setProcessingStatus(intakeId, 'transcribing', {
      durationSeconds: durationSeconds != null ? String(durationSeconds) : null,
    });

    const transcription = await transcribeAudioFile(audioPath, intake.originalFilename);
    if (!transcription.text.trim()) {
      throw new Error('empty_transcript');
    }

    await setProcessingStatus(intakeId, 'analyzing', {
      transcriptText: transcription.text,
      transcriptSegmentsJson: transcription.segments,
    });

    const analysis = await analyzeVideoTranscript({
      transcript: transcription.text,
      segments: transcription.segments,
      notes: intake.notes,
      rawText: intake.rawText,
      filename: intake.originalFilename,
      durationSeconds,
      intakeType: intake.intakeType,
    });

    const primaryCaption =
      analysis.caption_suggestions.find((c) => c.style === 'tiktok')?.text ??
      analysis.caption_suggestions[0]?.text ??
      null;

    const displayTitle = humanIntakeTitle({
      extractedTitle: analysis.extracted_title,
      hookSummary: analysis.hook_summary,
      aiSummary: analysis.summary,
      intakeType: intake.intakeType,
      captionSuggestionsJson: analysis.caption_suggestions,
    });

    let previewImagePath: string | null = intake.uploadedImagePath;
    if (intake.intakeType === 'video' && intake.tempFilePath && !previewImagePath) {
      previewImagePath = await saveIntakePreviewFromVideo(intake.tempFilePath, intakeId);
    }

    await db
      .update(shareIntakeSubmissions)
      .set({
        processingStatus: 'ready',
        processingError: null,
        reviewStatus: 'needs_review',
        aiSummary: normalizeCreatorNameInText(analysis.summary),
        extractedTitle: displayTitle,
        uploadedImagePath: previewImagePath ?? intake.uploadedImagePath,
        extractedCategory: analysis.extracted_category ?? intake.extractedCategory,
        extractedLocation: analysis.extracted_location,
        extractedBusiness: analysis.extracted_business,
        extractedTags: analysis.extracted_tags,
        confidenceScore: String(analysis.confidence_score.toFixed(3)),
        contentTheme: analysis.content_theme,
        hookSummary: analysis.hook_summary
          ? normalizeCreatorNameInText(analysis.hook_summary)
          : analysis.hook_summary,
        sponsorRelevance: analysis.sponsor_relevance,
        detectedProductsJson: analysis.detected_products,
        detectedBrandsJson: analysis.detected_brands,
        detectedLocationsJson: analysis.detected_locations,
        keyMomentsJson: analysis.key_moments,
        captionSuggestionsJson: analysis.caption_suggestions,
        hashtagSuggestionsJson: analysis.hashtag_suggestions,
        followUpIdeasJson: analysis.follow_up_ideas,
        durationSeconds: durationSeconds != null ? String(durationSeconds) : null,
        clientMetadata: {
          ...(intake.clientMetadata as Record<string, unknown>),
          analysisStub: analysis.analysis_stub,
          coverTextOptions: analysis.cover_text_options,
          firstCommentOptions: analysis.first_comment_options,
          plannerRecommendation: analysis.planner_recommendation,
          primaryCaption,
          language: transcription.language,
        },
        updatedAt: new Date(),
      })
      .where(eq(shareIntakeSubmissions.id, intakeId));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(shareIntakeSubmissions)
      .set({
        processingStatus: 'failed',
        processingError: message,
        reviewStatus: 'needs_review',
        aiSummary: `Benson could not finish reading this ${intake.intakeType}: ${message}`,
        updatedAt: new Date(),
      })
      .where(eq(shareIntakeSubmissions.id, intakeId));
  } finally {
    await deleteExtractedAudio(extractedAudioPath);
    const keepMedia = Boolean((intake.clientMetadata as Record<string, unknown>)?.keepTempMedia);
    if (!keepMedia) {
      await deleteIntakeMedia(intake.tempFilePath);
      await db
        .update(shareIntakeSubmissions)
        .set({ tempFilePath: null, updatedAt: new Date() })
        .where(eq(shareIntakeSubmissions.id, intakeId));
    }
  }
}

export async function markShareIntakeTooLarge(input: {
  intakeId: string;
  fileSize: number;
  mimeType?: string | null;
  originalFilename?: string | null;
}): Promise<void> {
  await db
    .update(shareIntakeSubmissions)
    .set({
      processingStatus: 'too_large',
      processingError: TOO_LARGE_MESSAGE,
      fileSize: input.fileSize,
      mimeType: input.mimeType ?? null,
      originalFilename: input.originalFilename ?? null,
      reviewStatus: 'needs_review',
      aiSummary: TOO_LARGE_MESSAGE,
      extractedTitle: input.originalFilename ?? 'Shared video (too large)',
      updatedAt: new Date(),
    })
    .where(eq(shareIntakeSubmissions.id, input.intakeId));
}

export async function retryShareIntakeMedia(intakeId: string): Promise<boolean> {
  const intake = await db.query.shareIntakeSubmissions.findFirst({
    where: eq(shareIntakeSubmissions.id, intakeId),
  });
  if (!intake) return false;
  if (intake.intakeType !== 'video' && intake.intakeType !== 'audio') return false;
  if (!intake.tempFilePath && intake.processingStatus !== 'too_large') return false;
  if (intake.processingStatus === 'too_large') return false;

  await db
    .update(shareIntakeSubmissions)
    .set({
      processingStatus: 'queued',
      processingError: null,
      reviewStatus: 'pending_ai',
      updatedAt: new Date(),
    })
    .where(eq(shareIntakeSubmissions.id, intakeId));
  return true;
}

export { TOO_LARGE_MESSAGE };
