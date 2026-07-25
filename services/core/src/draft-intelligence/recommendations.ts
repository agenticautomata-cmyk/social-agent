import OpenAI from 'openai';
import { z } from 'zod';
import { env } from '../env.js';
import { refreshPostingTimeAnalytics } from '../creator-analytics/posting-times.js';
import {
  buildPostingScheduleContext,
  pickDraftPostingAdvice,
} from '../creator-analytics/posting-window.js';
import { getCreatorNowClock } from '../datetime.js';
import type { CreatorDraftAsset } from '../schema.js';
import type { PostingRecommendation } from './types.js';

const RecommendationSchema = z.object({
  should_post: z.enum(['yes', 'no', 'maybe']),
  recommended_action: z.enum([
    'post',
    'revise',
    'hold',
    'scrap',
    'schedule',
    'convert_to_story',
    'make_sequel',
  ]),
  recommended_platforms: z.array(z.string()).default(['tiktok']),
  recommended_time: z.string().nullable().optional(),
  reason: z.string(),
  confidence: z.enum(['low', 'medium', 'high']),
  required_edits: z.array(z.string()).default([]),
  caption_strategy: z.string().nullable().optional(),
  sponsor_angle: z.string().nullable().optional(),
  opportunity_link_reason: z.string().nullable().optional(),
});

function fallbackRecommendation(draft: CreatorDraftAsset): PostingRecommendation {
  const hasVisual = Boolean(draft.visualSummary?.trim());
  const hasTranscript = Boolean(draft.transcriptText?.trim());
  let should_post: PostingRecommendation['should_post'] = 'maybe';
  if (hasTranscript && draft.hookAssessment?.toLowerCase().includes('weak')) {
    should_post = 'maybe';
  } else if (hasTranscript) {
    should_post = 'yes';
  }

  return {
    should_post,
    recommended_action: draft.hookAssessment?.toLowerCase().includes('weak') ? 'revise' : 'post',
    recommended_platforms: ['tiktok'],
    recommended_time: draft.suggestedPostWindow ?? null,
    reason: hasVisual
      ? 'Benson watched this draft — review the hook and caption before posting.'
      : 'I can judge what is said here, but I do not have full visual context.',
    confidence: hasVisual ? 'medium' : 'low',
    required_edits: draft.hookAssessment?.toLowerCase().includes('weak')
      ? ['Tighten the first 3 seconds — lead with the hook']
      : [],
    caption_strategy: draft.suggestedCaption ?? null,
    sponsor_angle: draft.sponsorRelevanceScore ? 'Check sponsor angle in summary' : null,
    opportunity_link_reason: null,
  };
}

export async function buildPostingRecommendation(
  draft: CreatorDraftAsset,
  creatorId: string,
): Promise<PostingRecommendation> {
  const clock = getCreatorNowClock();
  let postingWindow: string | null = draft.suggestedPostWindow ?? null;
  let postingSchedule: ReturnType<typeof buildPostingScheduleContext> | null = null;
  let draftPostingAdvice: ReturnType<typeof pickDraftPostingAdvice> = null;

  try {
    const posting = await refreshPostingTimeAnalytics({
      creatorId,
      platform: 'tiktok',
      demoMode: env.DEMO_MODE,
    });
    postingSchedule = buildPostingScheduleContext(posting, clock);
    draftPostingAdvice = pickDraftPostingAdvice(posting, draft.id, clock);
    if (draftPostingAdvice) {
      postingWindow = draftPostingAdvice.label;
    }
  } catch {
    /* optional */
  }

  if (!env.OPENAI_API_KEY?.trim() || !env.INTAKE_OPENAI_ENABLED) {
    const fb = fallbackRecommendation(draft);
    return { ...fb, recommended_time: postingWindow ?? fb.recommended_time };
  }

  try {
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: env.BENSON_ASK_MODEL,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are Benson, a KC creator manager. Given an unposted draft analysis, return JSON posting recommendation: should_post (yes/no/maybe), recommended_action, recommended_platforms, recommended_time, reason (plain English for Kellie), confidence, required_edits, caption_strategy, sponsor_angle, opportunity_link_reason. If only transcript exists, say visual context is limited. Be direct — yes/no guidance. Use creatorNow for the current date/time. postingSchedule.patterns are historical hints — never tell Kellie to post every video at the same exact minute. If a pattern has weak signal (one video), soften to day-part language (e.g. "Tuesday evening"). recommended_time should be the next actionable window relative to now, not a fixed historical timestamp.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            creatorNow: clock,
            postingSchedule,
            draftPostingAdvice,
            draftTitle: draft.draftTitle,
            overallSummary: draft.overallSummary,
            visualSummary: draft.visualSummary,
            audioSummary: draft.audioSummary,
            transcriptPreview: draft.transcriptText?.slice(0, 2000),
            contextLimitations: draft.contextLimitations,
            hookAssessment: draft.hookAssessment,
            pacingAssessment: draft.pacingAssessment,
            detectedTheme: draft.detectedContentTheme,
            detectedBrands: draft.detectedBrandsJson,
            detectedLocations: draft.detectedLocationsJson,
            suggestedCaption: draft.suggestedCaption,
            linkedOpportunityId: draft.linkedOpportunityId,
          }),
        },
      ],
    });
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('empty');
    const parsed = RecommendationSchema.parse(JSON.parse(content));
    return {
      ...parsed,
      recommended_time: parsed.recommended_time ?? postingWindow,
      sponsor_angle: parsed.sponsor_angle ?? null,
      caption_strategy: parsed.caption_strategy ?? null,
      opportunity_link_reason: parsed.opportunity_link_reason ?? null,
    };
  } catch {
    const fb = fallbackRecommendation(draft);
    return { ...fb, recommended_time: postingWindow ?? fb.recommended_time };
  }
}
