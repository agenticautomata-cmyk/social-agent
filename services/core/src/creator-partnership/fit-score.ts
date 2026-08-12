import OpenAI from 'openai';
import { z } from 'zod';
import { env } from '../env.js';
import type { FitScoreBreakdown, FitScoreDimension, PartnershipResearch } from './types.js';

const DIMENSIONS: FitScoreDimension[] = [
  'audienceFit',
  'personalityFit',
  'contentStoryPotential',
  'visualPotential',
  'localAccessibility',
  'organicContentPotential',
  'monetizationPotential',
  'partnershipLikelihood',
  'differentiationNovelty',
  'effortCostRequired',
];

const DimensionSchema = z.object({
  score: z.number().min(0).max(100),
  reason: z.string(),
});

const ScoreSchema = z.object({
  audienceFit: DimensionSchema,
  personalityFit: DimensionSchema,
  contentStoryPotential: DimensionSchema,
  visualPotential: DimensionSchema,
  localAccessibility: DimensionSchema,
  organicContentPotential: DimensionSchema,
  monetizationPotential: DimensionSchema,
  partnershipLikelihood: DimensionSchema,
  differentiationNovelty: DimensionSchema,
  effortCostRequired: DimensionSchema,
  composite: z.number().min(0).max(100),
  summary: z.string(),
});

export async function scoreCreatorPartnershipFit(input: {
  title: string;
  brandName: string | null;
  research: PartnershipResearch;
}): Promise<FitScoreBreakdown> {
  if (!env.OPENAI_API_KEY) {
    return buildFallbackScore(input);
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: env.BENSON_ASK_MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.25,
    max_tokens: 1600,
    messages: [
      {
        role: 'system',
        content: `Score this creator partnership opportunity for KCKellie (KC lifestyle TikTok creator: local food, shopping, events, accessible luxury, authentic personality).
Score each dimension 0-100 with a specific reason citing verified research only.
effortCostRequired: higher score = LOWER effort/cost (easier/cheaper).
composite: weighted average emphasizing audienceFit, monetizationPotential, organicContentPotential, differentiationNovelty.
Do not inflate scores for unverified program claims — penalize missing verification.
Respond JSON with all dimension keys plus composite and summary.`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          title: input.title,
          brandName: input.brandName,
          research: input.research,
        }),
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return buildFallbackScore(input);

  const parsed = ScoreSchema.safeParse(JSON.parse(content));
  if (!parsed.success) return buildFallbackScore(input);
  return parsed.data;
}

function buildFallbackScore(input: {
  title: string;
  research: PartnershipResearch;
}): FitScoreBreakdown {
  const baseReason = 'Limited research — score provisional until verification completes.';
  const breakdown = {} as FitScoreBreakdown;
  for (const dim of DIMENSIONS) {
    breakdown[dim] = { score: 45, reason: baseReason };
  }
  const verifiedProgram = input.research.creatorProgram.status === 'verified';
  breakdown.monetizationPotential = {
    score: verifiedProgram ? 62 : 35,
    reason: verifiedProgram
      ? 'Verified creator program found in research.'
      : 'NEEDS VERIFICATION: creator program not yet confirmed.',
  };
  breakdown.composite = 42;
  breakdown.summary = `Provisional fit score for ${input.title}. Complete research to refine.`;
  return breakdown;
}

export function inferMonetizationPaths(research: PartnershipResearch): string[] {
  const text = [
    research.creatorProgram.value,
    research.programBenefits.value,
    research.organicBeforeApproval.value,
    research.researchSummary,
    research.companySummary.value,
    research.retailerRelationships.value,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const paths = new Set<string>();
  if (/\baffiliate|commission|shopmy|ltk|referral link\b/.test(text)) paths.add('affiliate');
  if (/\bgifted|gifting|product seed|seeding\b/.test(text)) paths.add('gifted_product');
  if (/\bpaid sponsorship|sponsored|brand deal\b/.test(text)) paths.add('paid_sponsorship');
  if (/\bugc|user generated content\b/.test(text)) paths.add('ugc');
  if (/\bevent invitation|invite-only event\b/.test(text)) paths.add('event_invitation');
  if (/\bambassador\b/.test(text)) paths.add('ambassador_program');
  if (/\borganic|editorial|before approval\b/.test(text)) paths.add('organic_content');
  if (/\bfilming|in-store|store visit|local\b/.test(text)) paths.add('local_filming');
  if (/\bcredit|store credit|product credit\b/.test(text)) paths.add('product_credit');
  if (paths.size === 0) paths.add('organic_content');
  return [...paths];
}
