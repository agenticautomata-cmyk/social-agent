export type AskBensonTokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
};

export const ASK_BENSON_FRIENDLY_ERROR =
  'Benson hit a technical problem and couldn’t answer that. Please try again.';

function looksLikeInternalAskBensonError(message: string): boolean {
  return (
    /received an instance of date/i.test(message) ||
    /ERR_INVALID_ARG_TYPE/i.test(message) ||
    /typeerror/i.test(message) ||
    /failed to parse benson response/i.test(message) ||
    /unexpected token/i.test(message) ||
    /is not valid json/i.test(message) ||
    /openai returned empty/i.test(message) ||
    /at function\./i.test(message) ||
    /node:buffer/i.test(message)
  );
}

export function userFacingAskBensonError(message: string | undefined, status?: number): string {
  if (!message?.trim()) {
    return status && status >= 500 ? ASK_BENSON_FRIENDLY_ERROR : 'Failed to reach Benson';
  }
  if (status && status >= 500) return ASK_BENSON_FRIENDLY_ERROR;
  if (looksLikeInternalAskBensonError(message)) return ASK_BENSON_FRIENDLY_ERROR;
  return message;
}

export type AskBensonCollectedOpportunity = {
  contentItemId: string;
  title: string;
  location: string | null;
  eventStartsAt: string | null;
  relevanceScore: number;
  urgencyScore: number;
  outcome: 'created' | 'updated';
  sourceUrl: string | null;
};

export type AskBensonCollectionResult = {
  documentTitle: string | null;
  extractedCount: number;
  created: number;
  updated: number;
  enrichmentsAttempted: number;
  source?: 'image' | 'link' | 'lookup' | 'enrich';
  lookupQuery?: string;
  sourceUrls?: string[];
  scoredCount?: number;
  intakeError?: string | null;
  urlIntakeDiagnostics?: Array<{ summary?: string }>;
  items: AskBensonCollectedOpportunity[];
};

export type ConciergePick = {
  pickId: string;
  title: string;
  summary: string | null;
  location: string | null;
  eventDate: string | null;
  eventDateLabel: string | null;
  sourceUrl: string | null;
  origin: 'inventory' | 'web';
  contentItemId: string | null;
  reviewUrl: string | null;
  plannerState: 'none' | 'saved' | 'planned_today';
};

export type ConciergeSaveResult = {
  contentItemId: string;
  plannerListName: string;
  plannerAction: 'save' | 'plan_today';
  outcome: 'created' | 'updated';
  reviewUrl: string;
};

export type AskBensonResponse = {
  ok: boolean;
  answer: string;
  evidence: string[];
  suggestedActions: string[];
  usedData: string[];
  confidence: number;
  conversationId: string;
  messageId: string | null;
  cached: boolean;
  tokenUsage: AskBensonTokenUsage | null;
  estimatedCost: number | null;
  collection?: AskBensonCollectionResult | null;
  conciergePicks?: ConciergePick[];
  conciergeSaveResult?: ConciergeSaveResult | null;
  error?: string;
  requestId?: string;
};

export type BensonChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imagePreviewUrl?: string;
  imageName?: string;
  mediaName?: string;
  mediaKind?: 'video' | 'audio';
  draftUrl?: string;
  evidence?: string[];
  suggestedActions?: string[];
  confidence?: number;
  cached?: boolean;
  estimatedCost?: number | null;
  collection?: AskBensonCollectionResult | null;
  conciergePicks?: ConciergePick[];
  conciergeSaveResult?: ConciergeSaveResult | null;
  feedbackSentiment?: 'up' | 'down' | null;
};

export const ASK_BENSON_IMAGE_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif';

export const ASK_BENSON_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const ASK_BENSON_VIDEO_ACCEPT =
  'video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.m4v,.webm';

export const ASK_BENSON_AUDIO_ACCEPT =
  'audio/mp4,audio/mpeg,audio/wav,audio/x-m4a,audio/aac,audio/ogg,audio/flac,.m4a,.mp3,.wav,.aac,.ogg,.flac';

export const ASK_BENSON_MEDIA_ACCEPT = `${ASK_BENSON_VIDEO_ACCEPT},${ASK_BENSON_AUDIO_ACCEPT}`;

function parsePositiveIntEnv(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Mirrors server INTAKE_VIDEO_MAX_BYTES (configurable via .env). */
export const ASK_BENSON_VIDEO_MAX_BYTES = parsePositiveIntEnv(
  process.env.NEXT_PUBLIC_INTAKE_VIDEO_MAX_BYTES,
  500 * 1024 * 1024,
);

/** Mirrors server INTAKE_AUDIO_MAX_BYTES (configurable via .env). */
export const ASK_BENSON_AUDIO_MAX_BYTES = parsePositiveIntEnv(
  process.env.NEXT_PUBLIC_INTAKE_AUDIO_MAX_BYTES,
  50 * 1024 * 1024,
);

export type AskBensonMediaKind = 'video' | 'audio';

export function resolveAskBensonMediaKind(file: File): AskBensonMediaKind | null {
  const mime = (file.type || '').toLowerCase();
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  const ext = file.name.includes('.')
    ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
    : '';
  if (['.mp4', '.mov', '.m4v', '.webm'].includes(ext)) return 'video';
  if (['.m4a', '.mp3', '.wav', '.aac', '.ogg', '.flac'].includes(ext)) return 'audio';
  return null;
}

export function maxBytesForAskBensonMedia(kind: AskBensonMediaKind): number {
  return kind === 'video' ? ASK_BENSON_VIDEO_MAX_BYTES : ASK_BENSON_AUDIO_MAX_BYTES;
}

export function formatAskBensonMediaLimit(kind: AskBensonMediaKind): string {
  const mb = maxBytesForAskBensonMedia(kind) / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)}GB` : `${Math.round(mb)}MB`;
}

export type ShareIntakeUploadResponse = {
  intakeId: string;
  draftId?: string | null;
  reviewStatus?: string;
  processingStatus?: string;
  message?: string;
  error?: string;
};

export const ASK_BENSON_STARTER_QUESTIONS = [
  'What should I post next?',
  'Who should I pitch first?',
  'Where can I finish my pitch email?',
] as const;

export const ASK_BENSON_MEDIA_KIT_REVIEW_PROMPT =
  'Review this media kit for sponsor outreach. Cover: purpose, sponsor fit based on my analytics, sponsor types to target, gaps, improvements, and whether it is ready to send. Do not invent contents from the file — I know you cannot read the PDF.';

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatAskBensonCost(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(3)}`;
}

export const ASK_BENSON_FLOATING_PATHS = [
  '/',
  '/ask-benson',
  '/strategist',
  '/analytics',
  '/sponsor-intelligence/businesses',
] as const;

export function shouldShowAskBensonFloating(pathname: string): boolean {
  // Full-page chat — no floating duplicate.
  if (pathname === '/ask-benson') return false;
  if (
    pathname === '/home' ||
    pathname === '/' ||
    pathname === '/strategist' ||
    pathname === '/analytics' ||
    pathname.startsWith('/analytics/') ||
    pathname === '/sponsor-intelligence/businesses' ||
    pathname.startsWith('/sponsor-intelligence/businesses/') ||
    pathname.startsWith('/intake') ||
    pathname.startsWith('/editor') ||
    pathname.startsWith('/planner') ||
    pathname.startsWith('/website')
  ) {
    return true;
  }
  return false;
}
