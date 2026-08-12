export type InstagramMediaKind = 'image' | 'video';

export type InstagramPostMediaType =
  | 'single_image'
  | 'carousel_images'
  | 'carousel_mixed'
  | 'single_video'
  | 'reel'
  | 'unknown';

export type InstagramIntakeFailureCode =
  | 'session_not_configured'
  | 'session_not_seeded'
  | 'session_expired'
  | 'login_required'
  | 'challenge_required'
  | 'consent_required'
  | 'browser_unavailable'
  | 'post_unavailable'
  | 'private_account'
  | 'carousel_traversal_failed'
  | 'static_image_ocr_failed'
  | 'unsupported_video'
  | 'audio_unavailable'
  | 'transcription_empty'
  | 'transcription_failed'
  | 'no_event_information'
  | 'openai_quota_exceeded'
  | 'capture_empty';

export type CapturedCarouselItem = {
  index: number;
  kind: InstagramMediaKind;
  imageUrl: string | null;
  videoUrl: string | null;
  screenshotPath: string | null;
  durationSeconds: number | null;
};

export type CarouselItemOcr = {
  itemIndex: number;
  kind: InstagramMediaKind;
  charCount: number;
  text: string;
  ok: boolean;
  error: string | null;
  engine: string;
  source: 'cdn_image' | 'screenshot' | 'sampled_frame';
  timestampSeconds: number | null;
};

export type TranscriptSegmentEvidence = {
  startSeconds: number;
  endSeconds: number;
  text: string;
};

export type FrameOcrEvidence = {
  itemIndex: number;
  timestampSeconds: number;
  charCount: number;
  text: string;
  frameHash: string;
};

export type FieldProvenance = {
  field: string;
  value: string;
  source: 'caption' | 'ocr' | 'transcript' | 'frame_ocr' | 'inferred';
  itemIndex?: number;
  timestampSeconds?: number;
};

export type InstagramEvidencePackage = {
  postUrl: string;
  shortcode: string;
  profileHandle: string;
  publishedAt: string | null;
  caption: string | null;
  captionCharCount: number;
  mediaType: InstagramPostMediaType;
  mediaItemCount: number;
  imageItemCount: number;
  videoItemCount: number;
  carouselItems: CapturedCarouselItem[];
  ocrByItem: CarouselItemOcr[];
  totalOcrChars: number;
  transcriptText: string | null;
  transcriptCharCount: number;
  transcriptSegments: TranscriptSegmentEvidence[];
  frameOcr: FrameOcrEvidence[];
  combinedText: string;
  provenance: FieldProvenance[];
  failureCode: InstagramIntakeFailureCode | null;
  failureStage: string | null;
  failureDetail: string | null;
};

export type InstagramSessionVerifyReport = {
  hostPath: string;
  containerPath: string | null;
  dockerUsed: boolean;
  readable: boolean;
  mode: string | null;
  owner: string | null;
  sizeBytes: number | null;
  apiProcessLoadedEnv: boolean;
  apiEnvPath: string | null;
  sessionOpened: boolean;
  finalUrl: string | null;
  pageKind: 'feed' | 'login' | 'challenge' | 'consent' | 'unavailable' | 'unknown';
  authenticatedHandle: string | null;
  cookieCount: number | null;
  error: string | null;
};

export type InstagramIntakeStageReport = {
  urlRecognized: boolean;
  authenticatedSessionUsed: boolean;
  mediaType: InstagramPostMediaType;
  carouselItemsDiscovered: number;
  imageItemsCaptured: number;
  videoItemsCaptured: number;
  screenshotsCreated: number;
  ocrAttemptedPerItem: CarouselItemOcr[];
  captionCharCount: number;
  totalOcrChars: number;
  transcriptCharCount: number;
  extractedTextCharCount: number;
  failureCode: InstagramIntakeFailureCode | null;
  failureStage: string | null;
  failureDetail: string | null;
  evidence: InstagramEvidencePackage | null;
};
