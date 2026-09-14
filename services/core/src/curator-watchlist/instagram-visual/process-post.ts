/**
 * Instagram visual event reader — per-post processing (OCR, assemble, dedupe).
 * Works OCR-only; billable vision disabled by default.
 */

import { readFile } from 'node:fs/promises';
import type { CapturedSocialPost } from '../types.js';
import type { InstagramImageFetcher } from '../slide-ocr.js';
import { acquireFromCapturedPost } from './acquisition.js';
import { defaultInstagramVisualBounds } from './bounds.js';
import { assembleVisualEvents } from './event-assembler.js';
import { triageEventLikelihood } from './event-triage.js';
import { runLocalFlyerOcr, perceptualHashFromBuffer } from './local-ocr.js';
import { classifyInstagramPostContent } from './post-classification.js';
import { defaultVisionBudget, escalateToVision } from './vision-escalation.js';
import { dedupeVisualCandidates } from './visual-dedupe.js';
import type {
  AcquiredInstagramMedia,
  InstagramVisualBounds,
  SlideOcrEvidence,
  VisualEventCandidate,
} from './types.js';

export type ProcessPostVisualResult = {
  acquired: AcquiredInstagramMedia | null;
  slideOcr: SlideOcrEvidence[];
  candidates: VisualEventCandidate[];
  slidesExpected: number;
  slidesAcquired: number;
  imagesOcrEligible: number;
  ocrAttempted: number;
  ocrSucceeded: number;
  ocrFailed: number;
  ocrSkipped: number;
  ocrSkipReason: string | null;
  ocrCached: number;
  framesSampled: number;
  videoMediaAcquired: number;
  visionEscalations: number;
  visionCostUsd: number;
  perceptualHashes: string[];
  likelihoodScore: number;
  note: string | null;
  unreadable: boolean;
  contentClass: string | null;
};

async function loadImageBuffer(
  urlOrPath: string,
  fetchImage?: InstagramImageFetcher,
): Promise<Buffer | null> {
  if (urlOrPath.startsWith('/') || /^[A-Za-z]:\\/.test(urlOrPath)) {
    try {
      return await readFile(urlOrPath);
    } catch {
      return null;
    }
  }
  if (fetchImage) {
    const dataUrl = await fetchImage(urlOrPath);
    if (!dataUrl) return null;
    const m = /^data:[^;]+;base64,(.+)$/i.exec(dataUrl);
    if (!m) return null;
    return Buffer.from(m[1]!, 'base64');
  }
  return null;
}

export async function processPostVisualEvents(input: {
  post: CapturedSocialPost;
  fetchImage?: InstagramImageFetcher;
  bounds?: Partial<InstagramVisualBounds>;
  fixtureOcrTexts?: string[];
  notPreviouslyInspected?: boolean;
  extras?: {
    altTexts?: string[];
    locationTag?: string | null;
    taggedCollaborators?: string[];
  };
}): Promise<ProcessPostVisualResult> {
  const bounds = defaultInstagramVisualBounds(input.bounds);
  const acquired = acquireFromCapturedPost(input.post, input.extras);
  if (!acquired) {
    return {
      acquired: null,
      slideOcr: [],
      candidates: [],
      slidesExpected: 0,
      slidesAcquired: 0,
      imagesOcrEligible: 0,
      ocrAttempted: 0,
      ocrSucceeded: 0,
      ocrFailed: 0,
      ocrSkipped: 0,
      ocrSkipReason: null,
      ocrCached: 0,
      framesSampled: 0,
      videoMediaAcquired: 0,
      visionEscalations: 0,
      visionCostUsd: 0,
      perceptualHashes: [],
      likelihoodScore: 0,
      note: 'permalink_rejected_or_missing',
      unreadable: true,
      contentClass: null,
    };
  }

  const triage = triageEventLikelihood({
    caption: acquired.caption,
    altTexts: acquired.altTexts,
    mediaType: acquired.mediaType,
    carouselChildCount: acquired.carouselChildCount,
    hashtags: acquired.hashtags,
    notPreviouslyInspected: input.notPreviouslyInspected,
  });

  const slidesExpected = acquired.carouselChildCount;
  // Prefer CDN image URLs; fall back to screenshot paths only when no image URL.
  const imageUrls: string[] = [];
  let videoMediaAcquired = 0;
  const mediaItems = input.post.mediaItems ?? [];
  if (mediaItems.length > 0) {
    for (const m of mediaItems) {
      if (m.kind === 'image' && m.imageUrl) imageUrls.push(m.imageUrl);
      else if (m.kind === 'video') {
        videoMediaAcquired += 1;
        if (m.screenshotPath) imageUrls.push(m.screenshotPath);
      } else if (m.screenshotPath) imageUrls.push(m.screenshotPath);
    }
  } else {
    imageUrls.push(...input.post.slideImageUrls);
  }
  const uniqueSources = [...new Set(imageUrls)].slice(0, bounds.maxCarouselSlides);
  const slidesAcquired = Math.min(
    Math.max(uniqueSources.length, mediaItems.length || uniqueSources.length),
    Math.max(slidesExpected, uniqueSources.length),
  );
  const imagesOcrEligible = uniqueSources.length;
  const ocrSkipped = Math.max(0, slidesAcquired - imagesOcrEligible);
  const ocrSkipReason =
    ocrSkipped > 0
      ? videoMediaAcquired > 0
        ? 'non_image_video_children'
        : 'non_ocr_eligible_media'
      : null;

  const slideOcr: SlideOcrEvidence[] = [];
  let ocrAttempted = 0;
  let ocrSucceeded = 0;
  let ocrFailed = 0;
  let ocrCached = 0;
  let visionEscalations = 0;
  let visionCostUsd = 0;
  const perceptualHashes: string[] = [];
  const visionBudget = defaultVisionBudget(bounds.enableBillableVision);

  if (input.fixtureOcrTexts?.length) {
    for (let i = 0; i < input.fixtureOcrTexts.length; i++) {
      ocrAttempted += 1;
      const text = input.fixtureOcrTexts[i]!;
      slideOcr.push({
        slideNumber: i + 1,
        mediaHash: `fixture-${i + 1}`,
        rawText: text,
        normalizedText: text,
        confidence: 0.9,
        engine: 'fixture',
        preprocessMethod: 'fixture',
        fromCache: false,
        bboxes: [],
        timestamp: new Date().toISOString(),
        kind: i === 0 && /reel/i.test(acquired.mediaType) ? 'cover' : 'image',
      });
      if (text.trim().length >= 8) ocrSucceeded += 1;
    }
  } else if (triage.prioritizeOcr || uniqueSources.length > 0) {
    const limit = Math.min(uniqueSources.length, bounds.maxOcrImagesPerPost);
    for (let i = 0; i < limit; i++) {
      const src = uniqueSources[i]!;
      const buf = await loadImageBuffer(src, input.fetchImage);
      if (!buf || buf.length < 64) continue;
      if (buf.length > bounds.maxMediaBytes) continue;

      ocrAttempted += 1;
      try {
        perceptualHashes.push(await perceptualHashFromBuffer(buf));
      } catch {
        /* ignore */
      }

      try {
        const ocr = await runLocalFlyerOcr({
          buffer: buf,
          slideNumber: i + 1,
          kind: i === 0 && acquired.mediaType === 'reel' ? 'cover' : 'image',
          maxBytes: bounds.maxMediaBytes,
        });
        if (ocr.fromCache) ocrCached += 1;
        slideOcr.push(ocr);
        if (ocr.normalizedText.length >= 8) ocrSucceeded += 1;
        else ocrFailed += 1;

        // Optional vision only when OCR weak + event-likely + explicitly enabled
        if (
          bounds.enableBillableVision &&
          ocr.normalizedText.length < 24 &&
          triage.likelyFlyerOrRoundup
        ) {
          const dataUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;
          const esc = await escalateToVision({
            request: {
              mediaHash: ocr.mediaHash,
              slideNumber: i + 1,
              imageDataUrl: dataUrl,
              captionContext: acquired.caption,
              reason: 'low_confidence_ocr',
            },
            budget: visionBudget,
            cached: ocr.fromCache,
          });
          if (esc.used && esc.evidence) {
            visionEscalations += 1;
            visionCostUsd += esc.estimatedCostUsd;
            slideOcr[slideOcr.length - 1] = esc.evidence;
            if (esc.evidence.normalizedText.length >= 8) ocrSucceeded += 1;
          }
        }
      } catch {
        ocrFailed += 1;
      }
    }
  }

  // Incorporate alt text as supplemental OCR-like evidence when present
  for (let i = 0; i < acquired.altTexts.length; i++) {
    const alt = acquired.altTexts[i]!;
    if (alt.length < 12) continue;
    slideOcr.push({
      slideNumber: i + 1,
      mediaHash: `alt-${i + 1}`,
      rawText: alt,
      normalizedText: alt,
      confidence: 0.7,
      engine: 'platform_alt',
      preprocessMethod: 'none',
      fromCache: false,
      bboxes: [],
      timestamp: new Date().toISOString(),
      kind: 'image',
    });
  }

  const assembled = assembleVisualEvents({ acquired, slideOcr });
  const { kept, duplicates } = dedupeVisualCandidates(assembled);
  const candidates = [...kept, ...duplicates];

  const unreadable =
    ocrAttempted > 0 &&
    ocrSucceeded === 0 &&
    !acquired.caption?.trim() &&
    acquired.altTexts.length === 0;

  let note: string | null = null;
  if (slidesExpected > slidesAcquired) {
    note = `incomplete_carousel_enum expected=${slidesExpected} acquired=${slidesAcquired}`;
  } else if (ocrSkipReason) {
    note = `ocr_skip:${ocrSkipReason} eligible=${imagesOcrEligible} acquired=${slidesAcquired}`;
  } else if (!triage.likelyFlyerOrRoundup && candidates.length === 0) {
    note = `no_candidates: ${triage.signals.join(',') || 'thin_signals'}`;
  } else if (unreadable) {
    note = 'unreadable_media';
  }

  const contentClass = classifyInstagramPostContent({
    caption: acquired.caption,
    altTexts: acquired.altTexts,
    ocrTexts: slideOcr.map((s) => s.normalizedText || s.rawText),
    hashtags: acquired.hashtags,
  }).contentClass;

  return {
    acquired,
    slideOcr,
    candidates,
    slidesExpected,
    slidesAcquired,
    imagesOcrEligible,
    ocrAttempted,
    ocrSucceeded,
    ocrFailed,
    ocrSkipped,
    ocrSkipReason,
    ocrCached,
    framesSampled: 0,
    videoMediaAcquired,
    visionEscalations,
    visionCostUsd,
    perceptualHashes,
    likelihoodScore: triage.score,
    note,
    unreadable,
    contentClass,
  };
}
