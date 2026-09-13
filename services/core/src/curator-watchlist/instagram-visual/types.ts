/**
 * General Instagram visual event reader — types.
 * Extraction ≠ verification ≠ Calendar admission ≠ editorial relevance.
 */

import type { InstagramPostMediaType } from '../instagram-intake-types.js';

export type InstagramVisualCoverageStatus =
  | 'complete'
  | 'complete_no_current_events'
  | 'partial'
  | 'session_required'
  | 'rate_limited'
  | 'structure_changed'
  | 'blocked'
  | 'failed';

export type YearTrustState =
  | 'year_explicit'
  | 'year_corroborated'
  | 'year_inferred_review'
  | 'year_unresolved';

export type FieldEvidenceSource =
  | 'caption'
  | 'alt'
  | 'slide_ocr'
  | 'cover_ocr'
  | 'frame_ocr'
  | 'location_tag'
  | 'ticket_link'
  | 'hashtag'
  | 'collaborator'
  | 'platform_metadata'
  | 'corroborating_first_party';

export type FieldEvidence = {
  field: string;
  value: string;
  source: FieldEvidenceSource;
  slideNumber?: number | null;
  confidence?: number | null;
  mediaHash?: string | null;
  note?: string | null;
};

export type InstagramVisualBounds = {
  maxPosts: number;
  maxPostAgeDays: number;
  maxCarouselSlides: number;
  maxVideoFrames: number;
  maxMediaBytes: number;
  runTimeoutMs: number;
  maxOcrImagesPerPost: number;
  enableBillableVision: boolean;
  enableBillableParse: boolean;
  enableVideoFrames: boolean;
  enableAudioTranscript: boolean;
};

export type AcquiredInstagramMedia = {
  postId: string | null;
  shortcode: string;
  permalink: string;
  handle: string;
  author: string | null;
  publishedAt: string | null;
  caption: string | null;
  altTexts: string[];
  hashtags: string[];
  taggedCollaborators: string[];
  locationTag: string | null;
  mediaType: InstagramPostMediaType;
  carouselChildCount: number;
  carouselChildIds: string[];
  mediaUrls: string[];
  thumbnailOrCoverUrl: string | null;
  accessibilityMetadata: Record<string, string>;
  editIndicators: string[];
  permalinkSource: 'platform_url' | 'platform_shortcode';
};

export type SlideOcrEvidence = {
  slideNumber: number;
  mediaHash: string;
  rawText: string;
  normalizedText: string;
  confidence: number;
  engine: string;
  preprocessMethod: string;
  fromCache: boolean;
  bboxes: Array<{ text: string; x0: number; y0: number; x1: number; y1: number }>;
  timestamp: string;
  kind: 'image' | 'cover' | 'frame';
  frameTimestampSeconds?: number | null;
};

export type VisualEventCandidate = {
  title: string | null;
  eventDate: string | null;
  eventTime: string | null;
  endTime: string | null;
  venue: string | null;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  price: string | null;
  ageRestriction: string | null;
  ticketUrl: string | null;
  performers: string[];
  dayHeading: string | null;
  originalQuotedText: string;
  slideNumbers: number[];
  permalink: string;
  yearTrust: YearTrustState;
  yearInferenceExplanation: string | null;
  locationTrust: 'evidenced' | 'curator_only' | 'unknown' | 'out_of_market';
  temporalClass: 'future' | 'expired' | 'undated' | 'review';
  likelihoodScore: number;
  fieldEvidence: FieldEvidence[];
  decisionStage: 'extracted' | 'review' | 'rejected' | 'duplicate';
  rejectionReason: string | null;
  duplicateOf: string | null;
};

export type InstagramVisualCoverageReport = {
  status: InstagramVisualCoverageStatus;
  handle: string;
  profileUrl: string;
  postsDiscovered: number;
  postsInspected: number;
  postsSkipped: number;
  postsFailed: number;
  imagesAcquired: number;
  carouselsSeen: number;
  slidesExpected: number;
  slidesAcquired: number;
  slidesOcrAttempted: number;
  slidesOcrSucceeded: number;
  slidesOcrCached: number;
  reelsSeen: number;
  framesSampled: number;
  likelyEventPosts: number;
  candidatesExtracted: number;
  candidatesFuture: number;
  candidatesExpired: number;
  candidatesReview: number;
  candidatesRejected: number;
  duplicatesSkipped: number;
  unreadablePosts: number;
  incompleteReason: string | null;
  lastFullCoverageAt: string | null;
  visionEscalations: number;
  visionCostLoggedUsd: number;
  bounds: InstagramVisualBounds;
  postNotes: Array<{
    permalink: string;
    shortcode: string;
    mediaType: string;
    slidesExpected: number;
    slidesAcquired: number;
    ocrOk: number;
    candidates: number;
    note: string | null;
  }>;
  summaryLine: string;
};

export type InstagramVisualStrategyProfile = {
  profileVersion: number;
  handle: string;
  acquisitionMethod: string;
  lastPostEnumerationAt: string | null;
  lastPostId: string | null;
  mediaStructureFingerprint: string | null;
  ocrConfig: string;
  coverageFingerprint: string | null;
  mediaHashes: string[];
  editIndicators: string[];
  sessionHealth: string | null;
  lastStatus: InstagramVisualCoverageStatus | null;
  successCount: number;
  failureCount: number;
  consecutivePartialOrFail: number;
  lastRunAt: string | null;
};

export type InstagramVisualRunResult = {
  ok: boolean;
  coverage: InstagramVisualCoverageReport;
  candidates: VisualEventCandidate[];
  acquired: AcquiredInstagramMedia[];
  strategyProfile: InstagramVisualStrategyProfile;
  mutatedWrites: number;
};
