import type { CapturedSocialPost } from './types.js';
import type {
  CarouselItemOcr,
  FieldProvenance,
  FrameOcrEvidence,
  InstagramEvidencePackage,
  InstagramIntakeFailureCode,
  InstagramPostMediaType,
  TranscriptSegmentEvidence,
} from './instagram-intake-types.js';
import type { VideoItemProcessingResult } from './instagram-video-extract.js';
import type { CapturedCarouselItem } from './instagram-intake-types.js';

function shortcodeFromUrl(postUrl: string): string {
  const match = postUrl.match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  return match?.[1] ?? 'unknown';
}

export function mapCaptureFailure(code: string): InstagramIntakeFailureCode {
  switch (code) {
    case 'login_required':
      return 'login_required';
    case 'challenge_required':
      return 'challenge_required';
    case 'consent_required':
      return 'consent_required';
    case 'post_unavailable':
      return 'post_unavailable';
    case 'private_account':
      return 'private_account';
    case 'capture_empty':
      return 'carousel_traversal_failed';
    default:
      return 'capture_empty';
  }
}

export function buildInstagramEvidencePackage(input: {
  post: CapturedSocialPost;
  mediaType: InstagramPostMediaType;
  carouselItems: CapturedCarouselItem[];
  imageOcr: CarouselItemOcr[];
  videoResults: VideoItemProcessingResult[];
  itemTexts: Map<number, string>;
  failureCode?: InstagramIntakeFailureCode | null;
  failureStage?: string | null;
  failureDetail?: string | null;
  now?: Date;
}): InstagramEvidencePackage {
  const now = input.now ?? new Date();
  const ocrByItem = [...input.imageOcr];
  const frameOcr: FrameOcrEvidence[] = [];
  const transcriptSegments: TranscriptSegmentEvidence[] = [];
  let transcriptText = '';

  for (const vr of input.videoResults) {
    ocrByItem.push(...vr.ocrResults);
    frameOcr.push(...vr.frameOcr);
    if (vr.transcriptText) {
      transcriptText = transcriptText
        ? `${transcriptText}\n${vr.transcriptText}`
        : vr.transcriptText;
    }
    transcriptSegments.push(...vr.transcriptSegments);
  }

  const totalOcrChars = ocrByItem.reduce((s, r) => s + r.charCount, 0);
  const provenance: FieldProvenance[] = [];

  if (input.post.caption?.trim()) {
    provenance.push({
      field: 'caption',
      value: input.post.caption.trim().slice(0, 500),
      source: 'caption',
    });
  }

  for (const [index, text] of input.itemTexts.entries()) {
    if (!text.trim()) continue;
    provenance.push({
      field: `item_${index + 1}_text`,
      value: text.trim().slice(0, 800),
      source: 'ocr',
      itemIndex: index,
    });
  }

  for (const seg of transcriptSegments) {
    if (!seg.text.trim()) continue;
    provenance.push({
      field: 'transcript',
      value: seg.text.trim().slice(0, 400),
      source: 'transcript',
      timestampSeconds: seg.startSeconds,
    });
  }

  for (const fo of frameOcr) {
    provenance.push({
      field: 'frame_text',
      value: fo.text.slice(0, 400),
      source: 'frame_ocr',
      itemIndex: fo.itemIndex,
      timestampSeconds: fo.timestampSeconds,
    });
  }

  const lines: string[] = [
    `Instagram post by @${input.post.profileHandle}`,
    `Post URL: ${input.post.postUrl}`,
    `Media type: ${input.mediaType}`,
  ];

  if (input.post.publishedAt) {
    lines.push(`Posted at: ${input.post.publishedAt}`);
  }
  lines.push(`Today's date: ${now.toISOString().slice(0, 10)}`);
  lines.push(
    'Relative dates ("tonight", "tomorrow", "this Friday", "this weekend", "next Saturday") are relative to the post date above — resolve to absolute calendar dates.',
  );

  if (input.post.caption) {
    lines.push('', 'Caption:', input.post.caption);
  }

  for (const [index, text] of [...input.itemTexts.entries()].sort((a, b) => a[0] - b[0])) {
    if (!text.trim()) continue;
    lines.push('', `Carousel item ${index + 1} text:`, text);
  }

  if (transcriptText.trim()) {
    lines.push('', 'Video transcript:');
    for (const seg of transcriptSegments) {
      lines.push(`[${seg.startSeconds.toFixed(1)}s] ${seg.text}`);
    }
  }

  for (const fo of frameOcr) {
    lines.push(
      '',
      `Frame OCR item ${fo.itemIndex + 1} @ ${fo.timestampSeconds.toFixed(1)}s:`,
      fo.text,
    );
  }

  if (input.post.outboundLinks.length > 0) {
    lines.push('', `Links in post: ${input.post.outboundLinks.join(', ')}`);
  }

  return {
    postUrl: input.post.postUrl,
    shortcode: shortcodeFromUrl(input.post.postUrl),
    profileHandle: input.post.profileHandle,
    publishedAt: input.post.publishedAt,
    caption: input.post.caption,
    captionCharCount: input.post.caption?.length ?? 0,
    mediaType: input.mediaType,
    mediaItemCount: input.carouselItems.length,
    imageItemCount: input.carouselItems.filter((i) => i.kind === 'image').length,
    videoItemCount: input.carouselItems.filter((i) => i.kind === 'video').length,
    carouselItems: input.carouselItems,
    ocrByItem,
    totalOcrChars,
    transcriptText: transcriptText.trim() || null,
    transcriptCharCount: transcriptText.length,
    transcriptSegments,
    frameOcr,
    combinedText: lines.join('\n').slice(0, 20000),
    provenance,
    failureCode: input.failureCode ?? null,
    failureStage: input.failureStage ?? null,
    failureDetail: input.failureDetail ?? null,
  };
}

export function classifyOcrFailure(ocrByItem: CarouselItemOcr[]): InstagramIntakeFailureCode | null {
  if (ocrByItem.length === 0) return null;
  const quota = ocrByItem.some((r) => r.error && /429|credits remaining|quota/i.test(r.error));
  if (quota) return 'openai_quota_exceeded';
  const allFailed = ocrByItem.every((r) => !r.ok);
  if (allFailed) return 'static_image_ocr_failed';
  return null;
}
