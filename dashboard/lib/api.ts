// Server-side fetch helpers for the dashboard. All routes go through Next's
// rewrite to the Hono API.

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = { get, post, patch };

// ----------------------------------------------------------------------------
// Types — kept minimal here; full types live in @social-agent/core
// ----------------------------------------------------------------------------

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  autonomyMode: 'manual' | 'hitl' | 'auto';
  weeklyTestimonials: number;
  weeklyCaseStudies: number;
  weeklyExplainers: number;
  weeklyEducational: number;
  weeklyFounderMessages: number;
  weeklyIndustryInsights: number;
  postingSchedule: string;
  postingTimezone: string;
  brandVoice: string | null;
  brandDefaultCta: string | null;
  languages: string[];
  createdAt: string;
}

export interface ContentItem {
  id: string;
  campaignId: string;
  industryId: string | null;
  personaId: string | null;
  type: string;
  language: string;
  state: string;
  topic: string;
  hook: string | null;
  script: string | null;
  cta: string | null;
  durationSeconds: number | null;
  captionInstagram: string | null;
  captionTiktok: string | null;
  finalVideoUrl: string | null;
  heygenVideoUrl: string | null;
  plannedForDate: string | null;
  scheduledFor: string | null;
  publishedAt: string | null;
  scriptApprovedAt: string | null;
  scriptApprovedBy: string | null;
  scriptRejectionReason: string | null;
  lastError: string | null;
  retryCount: number;
  sourceId: string | null;
  sourceExternalId: string | null;
  sourceUrl: string | null;
  discoveredAt: string | null;
  locationName: string | null;
  eventStartsAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalRow {
  item: ContentItem;
  industryName: string | null;
  personaName: string | null;
  campaignName: string | null;
  autonomyMode: string;
}

export interface ShareIntakeSubmission {
  id: string;
  campaignId: string;
  creatorId: string | null;
  sourceType: string;
  intakeType: string;
  originalUrl: string | null;
  rawText: string | null;
  notes: string | null;
  uploadedImagePath: string | null;
  uploadedImageUrl: string | null;
  originalFilename: string | null;
  mimeType: string | null;
  fileSize: number | null;
  durationSeconds: string | null;
  tempFilePath: string | null;
  transcriptText: string | null;
  transcriptSegmentsJson: unknown;
  contentTheme: string | null;
  hookSummary: string | null;
  keyMomentsJson: unknown;
  sponsorRelevance: string | null;
  detectedProductsJson: unknown;
  detectedBrandsJson: unknown;
  detectedLocationsJson: unknown;
  captionSuggestionsJson: unknown;
  hashtagSuggestionsJson: unknown;
  followUpIdeasJson: unknown;
  processingStatus: string | null;
  processingError: string | null;
  linkedPostPackageId: string | null;
  linkedPlannerItemId: string | null;
  aiSummary: string | null;
  extractedTitle: string | null;
  displayTitle?: string | null;
  previewUrl?: string | null;
  extractedDate: string | null;
  extractedLocation: string | null;
  extractedBusiness: string | null;
  extractedCategory: string | null;
  extractedTags: string[];
  confidenceScore: string | null;
  reviewStatus: string;
  rejectionReason: string | null;
  promotedContentItemId: string | null;
  submittedBy: string;
  submittedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  clientMetadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
