/**
 * Full Instagram intake pipeline: session capture, media typing, OCR, video transcript, evidence.
 */

import {
  closeInstagramSession,
  instagramSessionConfigured,
  instagramSessionSeeded,
  openInstagramSession,
} from './instagram-session.js';
import { captureInstagramPostMedia } from './instagram-media-capture.js';
import {
  ocrInstagramImageItem,
  processInstagramVideoItem,
} from './instagram-video-extract.js';
import {
  buildInstagramEvidencePackage,
  classifyOcrFailure,
  mapCaptureFailure,
} from './instagram-evidence.js';
import { createSessionImageFetcher } from './slide-ocr.js';
import { extractHandleFromProfileUrl } from './instagram-page-utils.js';
import { normalizeInstagramUrl } from './instagram-url.js';
import type {
  InstagramEvidencePackage,
  InstagramIntakeFailureCode,
  InstagramIntakeStageReport,
} from './instagram-intake-types.js';
import { isInstagramPostOrReelUrl } from './instagram-url.js';

const MAX_CAROUSEL_ITEMS = Number(process.env.INSTAGRAM_MAX_CAROUSEL_ITEMS ?? 12);
const MAX_OCR_IMAGE_ITEMS = Number(process.env.INSTAGRAM_MAX_OCR_IMAGE_ITEMS ?? 6);
const MAX_VIDEO_ITEMS = Number(process.env.INSTAGRAM_MAX_VIDEO_ITEMS ?? 2);

function emptyStageReport(url: string): InstagramIntakeStageReport {
  return {
    urlRecognized: isInstagramPostOrReelUrl(url),
    authenticatedSessionUsed: false,
    mediaType: 'unknown',
    carouselItemsDiscovered: 0,
    imageItemsCaptured: 0,
    videoItemsCaptured: 0,
    screenshotsCreated: 0,
    ocrAttemptedPerItem: [],
    captionCharCount: 0,
    totalOcrChars: 0,
    transcriptCharCount: 0,
    extractedTextCharCount: 0,
    failureCode: null,
    failureStage: null,
    failureDetail: null,
    evidence: null,
  };
}

export async function runInstagramIntakePipeline(postUrl: string): Promise<{
  ok: boolean;
  report: InstagramIntakeStageReport;
  evidence: InstagramEvidencePackage | null;
  text: string;
}> {
  const normalized = normalizeInstagramUrl(postUrl) ?? postUrl;
  const report = emptyStageReport(normalized);
  report.urlRecognized = isInstagramPostOrReelUrl(normalized);

  if (!report.urlRecognized) {
    report.failureCode = 'capture_empty';
    report.failureStage = 'url_parse';
    report.failureDetail = 'URL is not a recognized Instagram post or reel';
    return { ok: false, report, evidence: null, text: '' };
  }

  if (!instagramSessionConfigured() || !(await instagramSessionSeeded())) {
    report.failureCode = instagramSessionConfigured() ? 'session_not_seeded' : 'session_not_configured';
    report.failureStage = 'session_check';
    report.failureDetail = 'Authenticated Instagram session not available';
    return { ok: false, report, evidence: null, text: '' };
  }

  const handle = extractHandleFromProfileUrl(normalized) || 'unknown';

  const { ctx, status } = await openInstagramSession();
  if (!ctx) {
    report.failureCode =
      status === 'login_required'
        ? 'session_expired'
        : status === 'captcha_blocked'
          ? 'challenge_required'
          : status === 'consent_required'
            ? 'consent_required'
            : 'browser_unavailable';
    report.failureStage = 'open_session';
    report.failureDetail = status;
    return { ok: false, report, evidence: null, text: '' };
  }

  report.authenticatedSessionUsed = true;

  try {
    const capture = await captureInstagramPostMedia(ctx.page, normalized, handle, {
      maxCarouselItems: MAX_CAROUSEL_ITEMS,
      pageWaitUntil: 'domcontentloaded',
    });

    report.mediaType = capture.mediaType;
    report.carouselItemsDiscovered = capture.carouselItems.length;
    report.imageItemsCaptured = capture.imageItemsCaptured;
    report.videoItemsCaptured = capture.videoItemsCaptured;
    report.screenshotsCreated = capture.screenshotsCreated;
    report.captionCharCount = capture.captionCharCount;

    if (!capture.ok || !capture.post) {
      report.failureCode = capture.failure
        ? mapCaptureFailure(capture.failure.code)
        : 'capture_empty';
      report.failureStage = capture.failure?.stage ?? 'capture';
      report.failureDetail = capture.failure?.detail ?? 'Capture failed';
      return { ok: false, report, evidence: null, text: '' };
    }

    const fetchImage = createSessionImageFetcher(ctx.page);
    const itemTexts = new Map<number, string>();
    const imageOcr = [];

    for (const item of capture.carouselItems.filter((i) => i.kind === 'image').slice(0, MAX_OCR_IMAGE_ITEMS)) {
      const ocr = await ocrInstagramImageItem({
        item,
        captionContext: capture.post.caption,
        fetchImage,
      });
      report.ocrAttemptedPerItem.push(ocr);
      imageOcr.push(ocr);
      if (ocr.text.trim()) itemTexts.set(item.index, ocr.text.trim());
    }

    const videoResults = [];
    for (const item of capture.carouselItems.filter((i) => i.kind === 'video').slice(0, MAX_VIDEO_ITEMS)) {
      const vr = await processInstagramVideoItem({
        page: ctx.page,
        item,
        shortcode: capture.post.postUrl.match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/)?.[1] ?? 'unknown',
        captionContext: capture.post.caption,
        fetchImage,
      });
      videoResults.push(vr);
      report.ocrAttemptedPerItem.push(...vr.ocrResults);
      if (vr.transcriptText.trim()) {
        itemTexts.set(item.index, vr.transcriptText);
      } else if (vr.frameOcr.length > 0) {
        itemTexts.set(item.index, vr.frameOcr.map((f) => f.text).join('\n'));
      }
      if (vr.errors.includes('transcription_empty')) {
        report.failureCode = 'transcription_empty';
        report.failureStage = 'video_transcription';
      }
      if (vr.errors.some((e) => /429|credits/i.test(e))) {
        report.failureCode = 'openai_quota_exceeded';
        report.failureStage = 'video_transcription';
      }
    }

    report.totalOcrChars = report.ocrAttemptedPerItem.reduce((s, r) => s + r.charCount, 0);
    report.transcriptCharCount = videoResults.reduce((s, r) => s + r.transcriptCharCount, 0);

    const ocrFailure = classifyOcrFailure(report.ocrAttemptedPerItem);
    if (
      ocrFailure &&
      report.totalOcrChars === 0 &&
      report.transcriptCharCount === 0 &&
      !capture.post.caption?.trim()
    ) {
      report.failureCode = ocrFailure;
      report.failureStage = 'ocr';
    }

    const evidence = buildInstagramEvidencePackage({
      post: capture.post,
      mediaType: capture.mediaType,
      carouselItems: capture.carouselItems,
      imageOcr,
      videoResults,
      itemTexts,
      failureCode: report.failureCode,
      failureStage: report.failureStage,
      failureDetail: report.failureDetail,
    });

    report.evidence = evidence;
    report.extractedTextCharCount = evidence.combinedText.length;

    const hasContent =
      evidence.captionCharCount > 0 ||
      evidence.totalOcrChars > 0 ||
      evidence.transcriptCharCount > 0;

    if (!hasContent) {
      report.failureCode = report.failureCode ?? 'no_event_information';
      report.failureStage = report.failureStage ?? 'evidence_merge';
      report.failureDetail = 'No readable caption, OCR, or transcript text';
      return { ok: false, report, evidence, text: evidence.combinedText };
    }

    if (report.failureCode === 'openai_quota_exceeded' && hasContent) {
      report.failureCode = null;
      report.failureStage = null;
      report.failureDetail = null;
    }

    return { ok: true, report, evidence, text: evidence.combinedText };
  } catch (err) {
    report.failureCode = 'capture_empty';
    report.failureStage = 'pipeline_exception';
    report.failureDetail = err instanceof Error ? err.message.slice(0, 200) : 'unknown';
    return { ok: false, report, evidence: null, text: '' };
  } finally {
    await closeInstagramSession(ctx);
  }
}
