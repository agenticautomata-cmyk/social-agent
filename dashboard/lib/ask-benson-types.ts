export type AskBensonTokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
};

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
};

export type BensonChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imagePreviewUrl?: string;
  imageName?: string;
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
  // Home has Ask in the bottom tab bar — skip the floating avatar so pulse cards stay readable.
  if (pathname === '/home') return false;
  if (pathname === '/ask-benson' || pathname === '/strategist') return true;
  if (pathname === '/analytics' || pathname.startsWith('/analytics/')) return true;
  if (
    pathname === '/sponsor-intelligence/businesses' ||
    pathname.startsWith('/sponsor-intelligence/businesses/')
  ) {
    return true;
  }
  return false;
}
