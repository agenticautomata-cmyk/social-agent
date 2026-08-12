import OpenAI from 'openai';
import { z } from 'zod';
import { env } from '../env.js';
import { enforceCreatorPlayVerification, buildSafeHook } from './creator-play-consistency.js';
import { buildVerificationContext, verificationLedgerForPrompt } from './verification-context.js';
import type {
  CreatorPlay,
  FitScoreBreakdown,
  PartnershipMonetizationPath,
  PartnershipResearch,
} from './types.js';

const PlaySchema = z.object({
  opportunitySummary: z.string(),
  whyKellieShouldCare: z.string(),
  recommendedStrategy: z.string(),
  organicFirstVsPitchFirst: z.enum(['organic_first', 'pitch_first', 'hybrid']),
  organicFirstRationale: z.string(),
  contentConcepts: z.array(z.string()).min(3).max(5),
  openingHook: z.string(),
  talkingPoints: z.array(z.string()).min(3).max(8),
  shotList: z.array(z.string()).min(3).max(10),
  bRollSuggestions: z.array(z.string()).min(2).max(8),
  researchBeforeFilming: z.array(z.string()).min(1).max(8),
  productsToFeature: z.array(z.string()).max(8),
  brandPositioningToPreserve: z.array(z.string()).min(1).max(6),
  potentialProblems: z.array(z.string()).min(1).max(6),
  disclosureRequirements: z.array(z.string()).min(1).max(6),
  monetizationPaths: z.array(z.string()).min(1).max(9),
  programLinks: z.array(z.string()).max(6),
  brandContactResearch: z.string(),
  partnershipPitch: z.string(),
  followUpRecommendation: z.string(),
});

export async function buildCreatorPlay(input: {
  title: string;
  brandName: string | null;
  retailerName: string | null;
  research: PartnershipResearch;
  fitScore: FitScoreBreakdown;
  monetizationPaths: PartnershipMonetizationPath[];
  submittedUrl: string | null;
}): Promise<CreatorPlay> {
  const context = buildVerificationContext(input.research, input.brandName, input.retailerName);
  const verificationLedger = verificationLedgerForPrompt(context, input.research);

  let draft: CreatorPlay;
  if (!env.OPENAI_API_KEY) {
    draft = buildFallbackPlay(input, context);
  } else {
    draft = await generateCreatorPlayDraft(input, verificationLedger);
  }

  return enforceCreatorPlayVerification(draft, input.research, input.brandName, input.retailerName);
}

async function generateCreatorPlayDraft(
  input: {
    title: string;
    brandName: string | null;
    retailerName: string | null;
    research: PartnershipResearch;
    fitScore: FitScoreBreakdown;
    monetizationPaths: PartnershipMonetizationPath[];
    submittedUrl: string | null;
  },
  verificationLedger: string,
): Promise<CreatorPlay> {
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: env.BENSON_ASK_DEEP_MODEL ?? env.BENSON_ASK_MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.35,
    max_tokens: 2600,
    messages: [
      {
        role: 'system',
        content: `Build a Creator Play for KCKellie (KC TikTok creator).

STRICT VERIFICATION RULES:
- Only fields marked CONFIRMED in the ledger may be stated as fact without qualification.
- INFERRED facts may be used but must be qualified ("may", "appears to") unless already widely safe.
- NEEDS VERIFICATION / UNKNOWN / CALL FIRST / LIKELY AVAILABLE must NEVER appear as confirmed facts.
- If KC in-store inventory is not CONFIRMED AVAILABLE, do NOT write hooks or concepts implying Kellie can shop or film locally.
- Do NOT write hooks like "shop BRAND at RETAILER in KC".
- Safe hook pattern when KC inventory unverified: "I didn't know RETAILER carried authenticated pre-owned luxury through BRAND."
- Put unresolved items in researchBeforeFilming as verification actions, not as confirmed story beats.
- partnershipPitch must not assume program approval or KC inventory.
- programLinks: only URLs from research citations when verified/inferred.

${verificationLedger}

Respond JSON with all required keys.`,
      },
      {
        role: 'user',
        content: JSON.stringify(input),
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return buildFallbackPlay(input, buildVerificationContext(input.research, input.brandName, input.retailerName));

  try {
    const parsed = PlaySchema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      return buildFallbackPlay(input, buildVerificationContext(input.research, input.brandName, input.retailerName));
    }
    return {
      ...parsed.data,
      monetizationPaths: parsed.data.monetizationPaths.filter(Boolean) as PartnershipMonetizationPath[],
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return buildFallbackPlay(input, buildVerificationContext(input.research, input.brandName, input.retailerName));
  }
}

function buildFallbackPlay(
  input: {
    brandName: string | null;
    retailerName: string | null;
    research: PartnershipResearch;
    monetizationPaths: PartnershipMonetizationPath[];
  },
  context: ReturnType<typeof buildVerificationContext>,
): CreatorPlay {
  const brand = input.brandName ?? 'this brand';
  const retailer = input.retailerName;
  const hook = buildSafeHook(context, input.research);

  return {
    opportunitySummary: `${brand}${retailer ? ` via ${retailer}` : ''} — creator partnership candidate.`,
    whyKellieShouldCare:
      input.research.audienceFitRationale.status === 'verified'
        ? (input.research.audienceFitRationale.value ?? 'Audience fit still being verified.')
        : 'NEEDS VERIFICATION: audience fit not yet confirmed.',
    recommendedStrategy: context.kcInventoryUnverified
      ? 'Verify KC inventory and creator program details before filming or pitching.'
      : 'Complete verification, then decide organic-first vs pitch-first.',
    organicFirstVsPitchFirst: 'hybrid',
    organicFirstRationale: input.research.organicBeforeApproval.value ?? 'NEEDS VERIFICATION',
    contentConcepts: context.kcInventoryUnverified
      ? [
          `Explain what ${brand} is and why it may fit Kellie's audience`,
          'Authentication / pre-owned luxury education angle (online-safe)',
          'Verification-first: call a KC-area store before any in-person filming',
        ]
      : [
          `Discovery angle for ${brand}`,
          'Value/authentication education for KC shoppers',
          'Product reveal after inventory confirmed',
        ],
    openingHook: hook,
    talkingPoints: [
      'What makes this brand different (verified details only)',
      'Who it may be best for in KC',
      'What still needs verification before filming',
    ],
    shotList: context.kcInventoryUnverified
      ? ['Hook on camera', 'Official product imagery', 'On-screen verification checklist']
      : ['Hook on camera', 'Product close-ups', 'Price/value context', 'Store exterior if confirmed'],
    bRollSuggestions: context.kcInventoryUnverified
      ? ['Official site/product pages', 'Text overlay of open questions']
      : ['Handbag/product details', 'Store signage', 'Shopping reaction'],
    researchBeforeFilming: input.research.needsVerification.length
      ? input.research.needsVerification
      : ['NEEDS VERIFICATION: Confirm KC inventory and filming policy'],
    productsToFeature: input.research.productsPricingHooks.value
      ? [input.research.productsPricingHooks.value]
      : [],
    brandPositioningToPreserve: ['Use official brand positioning; do not claim partnerships that are not approved'],
    potentialProblems: ['Unverified inventory', 'Filming restrictions', 'Undisclosed affiliate relationship'],
    disclosureRequirements: ['Disclose gifted product, paid partnership, or affiliate links when applicable'],
    monetizationPaths: input.monetizationPaths,
    programLinks: input.research.citations.map((c) => c.url).slice(0, 4),
    brandContactResearch:
      input.research.creatorContactPath.value ?? 'NEEDS VERIFICATION: official creator contact path',
    partnershipPitch: `Hi — I'm Kellie, a Kansas City creator exploring a collaboration around ${brand}. ${
      input.research.creatorProgram.status !== 'needs_verification' && input.research.creatorProgram.value
        ? `I am reviewing your creator program details.`
        : 'I would love to learn about creator partnership options.'
    }`,
    followUpRecommendation: context.kcInventoryUnverified
      ? 'Verify KC-area inventory via store locator, then send pitch or publish an online-safe teaser.'
      : 'Verify program details, confirm local inventory, then send pitch or publish organic teaser.',
    generatedAt: new Date().toISOString(),
  };
}
