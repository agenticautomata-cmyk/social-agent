import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { creatorDraftAssets } from '../schema.js';
import type { CreatorDraftAsset } from '../schema.js';
import { getCreatorNowClock, type CreatorNowClock } from '../datetime.js';
import { humanDraftTitle } from './display-title.js';
import type { PostingRecommendation, OpportunityMatch } from './types.js';

export type DraftDiscussionContext = {
  creatorNow: CreatorNowClock;
  draftId: string;
  title: string;
  status: string;
  overallSummary: string | null;
  visualSummary: string | null;
  audioSummary: string | null;
  transcriptPreview: string | null;
  contextLimitations: string | null;
  hookAssessment: string | null;
  pacingAssessment: string | null;
  visualQualityNotes: string | null;
  suggestedCaption: string | null;
  suggestedHashtags: string[];
  suggestedPostWindow: string | null;
  readinessScore: string | null;
  postingRecommendation: PostingRecommendation | null;
  opportunityMatch: OpportunityMatch | null;
  linkedOpportunityId: string | null;
  detectedTheme: string | null;
  detectedBrands: string[];
  detectedLocations: string[];
  frameMoments: Array<{ label: string; description: string; timestamp_seconds?: number }>;
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

export function buildDraftDiscussionContext(draft: CreatorDraftAsset): DraftDiscussionContext {
  const rec = draft.postingRecommendationJson as PostingRecommendation | null;
  const match = draft.opportunityMatchJson as OpportunityMatch | null;
  const frames = Array.isArray(draft.frameSummariesJson)
    ? (draft.frameSummariesJson as Array<{ label: string; description: string; timestamp_seconds?: number }>)
    : [];

  return {
    creatorNow: getCreatorNowClock(),
    draftId: draft.id,
    title:
      humanDraftTitle({
        draftTitle: draft.draftTitle,
        suggestedCaption: draft.suggestedCaption,
        overallSummary: draft.overallSummary,
        hookAssessment: draft.hookAssessment,
      }) ?? 'Unposted draft',
    status: draft.status,
    overallSummary: draft.overallSummary,
    visualSummary: draft.visualSummary,
    audioSummary: draft.audioSummary,
    transcriptPreview: draft.transcriptText?.slice(0, 2500) ?? null,
    contextLimitations: draft.contextLimitations,
    hookAssessment: draft.hookAssessment,
    pacingAssessment: draft.pacingAssessment,
    visualQualityNotes: draft.visualQualityNotes,
    suggestedCaption: draft.suggestedCaption,
    suggestedHashtags: asStringArray(draft.suggestedHashtagsJson),
    suggestedPostWindow: draft.suggestedPostWindow,
    readinessScore: draft.readinessScore,
    postingRecommendation: rec,
    opportunityMatch: match,
    linkedOpportunityId: draft.linkedOpportunityId,
    detectedTheme: draft.detectedContentTheme,
    detectedBrands: asStringArray(draft.detectedBrandsJson),
    detectedLocations: asStringArray(draft.detectedLocationsJson),
    frameMoments: frames,
  };
}

export async function loadDraftDiscussionContext(
  draftId: string,
): Promise<DraftDiscussionContext | null> {
  const draft = await db.query.creatorDraftAssets.findFirst({
    where: eq(creatorDraftAssets.id, draftId),
  });
  if (!draft) return null;

  await db
    .update(creatorDraftAssets)
    .set({ lastDiscussedAt: new Date(), updatedAt: new Date() })
    .where(eq(creatorDraftAssets.id, draftId));

  return buildDraftDiscussionContext(draft);
}

export function draftDiscussionPromptBlock(ctx: DraftDiscussionContext): string {
  return [
    'UNPOSTED DRAFT (private — not published):',
    JSON.stringify(ctx, null, 2),
    'Answer Kellie about THIS specific draft only. Distinguish verified facts from guesses. If visual context is limited, say so. Give clear if/when/where guidance.',
    'Use creatorNow for current date/time. suggestedPostWindow is a suggested next window — not a mandate to post every video at the same historical minute.',
  ].join('\n');
}
