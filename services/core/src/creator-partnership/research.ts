import OpenAI from 'openai';
import { z } from 'zod';
import { env } from '../env.js';
import { searchWeb, type WebResearchCitation } from '../web-research/index.js';
import {
  buildLocalInventorySearchQuery,
  getCreatorLocalScope,
  localRelevanceUnresolvedNote,
} from './creator-local-scope.js';
import { buildLocalLocationRows } from './local-verification.js';
import type { PartnershipResearch, VerifiedResearchField } from './types.js';

const FieldSchema = z.object({
  value: z.string().nullable(),
  status: z.enum(['verified', 'inferred', 'needs_verification', 'unavailable']),
  source: z.string().nullable(),
});

const StoryAngleSchema = z.object({
  angle: z.string(),
  premiseTags: z.array(z.enum(['verified', 'inferred', 'blocked'])).default(['inferred']),
  blockedReason: z.string().optional(),
});

const NextActionInputSchema = z.object({
  action: z.string(),
  rationale: z.string(),
  blockedBy: z.array(z.string()).optional(),
});

const ResearchSchema = z.object({
  companySummary: FieldSchema,
  audienceFitRationale: FieldSchema,
  creatorProgram: FieldSchema,
  programBenefits: FieldSchema,
  programRequirements: FieldSchema,
  socialAccounts: FieldSchema,
  recentCollaborations: FieldSchema,
  retailerRelationships: FieldSchema,
  localFilmingPotential: FieldSchema,
  creatorContactPath: FieldSchema,
  productsPricingHooks: FieldSchema,
  organicBeforeApproval: FieldSchema,
  needsVerification: z.array(z.string()).default([]),
  researchSummary: z.string().nullable(),
  storyAngleCandidates: z.array(StoryAngleSchema).default([]),
  nextActionInputs: z.array(NextActionInputSchema).default([]),
  monetizationPathHints: z
    .array(
      z.object({
        path: z.string(),
        status: z.string(),
        source: z.string().optional(),
      }),
    )
    .default([]),
});

function field(
  value: string | null,
  status: VerifiedResearchField['status'],
  source: string | null,
): VerifiedResearchField {
  return { value, status, source };
}

function mergeCitations(...groups: WebResearchCitation[][]): WebResearchCitation[] {
  const seen = new Set<string>();
  const out: WebResearchCitation[] = [];
  for (const group of groups) {
    for (const c of group) {
      if (seen.has(c.url)) continue;
      seen.add(c.url);
      out.push(c);
    }
  }
  return out;
}

/** Max paid web searches per partnership research cycle (see searchTargets below). */
export const PARTNERSHIP_RESEARCH_SEARCH_TARGET_COUNT = 6;

export async function researchCreatorPartnership(
  input: {
    title: string;
    brandName: string | null;
    productName: string | null;
    retailerName: string | null;
    submittedUrl: string | null;
    submittedText: string | null;
    pageTitle?: string | null;
    pageText?: string | null;
    partnershipId?: string;
    researchRunId?: string;
    trigger?: string;
  },
  deps?: { searchWeb?: typeof searchWeb },
): Promise<PartnershipResearch> {
  const brand = input.brandName ?? input.title;
  const retailer = input.retailerName;
  const product = input.productName;
  const year = new Date().getFullYear();
  const localScope = getCreatorLocalScope();
  const localQuery = buildLocalInventorySearchQuery({
    retailerName: retailer,
    brandName: brand,
  });

  const searchTargets: Array<{ key: string; query: string }> = [
    {
      key: 'company',
      query: `What is ${brand}${product ? ` (${product})` : ''}?${retailer ? ` Relationship between ${brand} and ${retailer}.` : ''} Official description, product category, authentication/pre-owned positioning if applicable. Cite official sources.`,
    },
    {
      key: 'program',
      query: `${brand}${retailer ? ` OR ${retailer}` : ''} official creator program OR ambassador program OR influencer program OR affiliate program OR UGC program. Include application links, benefits, requirements. Cite official program pages only when found.`,
    },
    {
      key: 'social',
      query: `${brand} official Instagram TikTok social accounts and recent creator collaborations or influencer partnerships ${year}. Cite sources.`,
    },
    {
      key: 'retailer',
      query: `${brand}${retailer ? ` sold at ${retailer} retail partner` : ''} official retail partnership. Cite sources.`,
    },
    {
      key: 'affiliate',
      query: `${brand} ShopMy LTK affiliate creator monetization platform workflow. Cite only if verified.`,
    },
  ];

  if (localQuery) {
    searchTargets.splice(4, 0, { key: 'local', query: localQuery });
  } else {
    searchTargets.splice(4, 0, {
      key: 'local',
      query: `${retailer ?? brand} ${brand} national store locator inventory availability. Do not assume local inventory. Cite official pages only.`,
    });
  }

  const searchResults: Array<{ key: string; summary: string | null; citations: WebResearchCitation[] }> =
    [];
  const doSearch = deps?.searchWeb ?? searchWeb;
  for (const target of searchTargets) {
    const result = await doSearch(target.query, undefined, {
      context: 'user',
      caller: 'creator_partnership.research',
      module: 'creator_partnership.research',
      partnershipId: input.partnershipId,
      researchRunId: input.researchRunId,
      trigger: input.trigger ?? 'user_submit',
      process: 'api',
    });
    searchResults.push({
      key: target.key,
      summary: result.summary,
      citations: result.citations,
    });
  }

  const citations = mergeCitations(...searchResults.map((r) => r.citations));
  const evidenceBlock = searchResults
    .map((r) => `## ${r.key}\n${r.summary ?? '(no results)'}`)
    .join('\n\n');

  const pageContext = [
    input.submittedUrl ? `Submitted URL: ${input.submittedUrl}` : null,
    input.pageTitle ? `Page title: ${input.pageTitle}` : null,
    input.pageText ? `Page excerpt: ${input.pageText.slice(0, 2500)}` : null,
    input.submittedText ? `User note: ${input.submittedText}` : null,
    localScope.configured
      ? `Creator local scope (configured geography): ${localScope.label}`
      : 'Creator local scope: not configured — treat local relevance as unresolved; do not invent a metro.',
  ]
    .filter(Boolean)
    .join('\n');

  if (!env.OPENAI_API_KEY) {
    return buildFallbackResearch(input, citations, evidenceBlock);
  }

  const audienceHint = localScope.configured
    ? `creator's ${localScope.label} lifestyle/food/shopping/local discovery audience`
    : `creator's lifestyle/food/shopping/local discovery audience (local metro not configured)`;

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: env.BENSON_ASK_MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.2,
    max_tokens: 2600,
    messages: [
      {
        role: 'system',
        content: `You synthesize creator partnership research for creator KCKellie.
Rules:
- Use ONLY facts supported by the provided web research and page context.
- Never invent program names, benefits, emails, or store inventory.
- Mark unsupported items status "needs_verification" and list them in needsVerification prefixed with "NEEDS VERIFICATION:".
- If a fact is strongly implied but not explicitly verified, use status "inferred".
- If unknown, use status "unavailable" with value null.
- audienceFitRationale must explain why this could fit ${audienceHint} WITHOUT inventing past collaborations.
- Do not assume a local metro unless creator local scope is provided in pageContext.
- URL storeAvailability / store filter params mean a filter was applied — NOT confirmed in-store stock.
- organicBeforeApproval: can Kellie create useful organic content before brand approval? Be conservative.
- Also return storyAngleCandidates (array of {angle, premiseTags: verified|inferred|blocked, blockedReason?}).
- Also return nextActionInputs (array of {action, rationale, blockedBy?}) using actions like call_location, research_further, apply_creator_program, build_creator_play, save_monitor. Never suggest auto-pitching or sending email.
- Also return monetizationPathHints (array of {path, status, source?}).
Respond JSON with keys: companySummary, audienceFitRationale, creatorProgram, programBenefits, programRequirements, socialAccounts, recentCollaborations, retailerRelationships, localFilmingPotential, creatorContactPath, productsPricingHooks, organicBeforeApproval, needsVerification, researchSummary, storyAngleCandidates, nextActionInputs, monetizationPathHints.`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          brand,
          product,
          retailer,
          pageContext,
          evidenceBlock,
        }),
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return buildResearchFromSearchResults(input, searchResults, citations, evidenceBlock);

  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    return buildResearchFromSearchResults(input, searchResults, citations, evidenceBlock);
  }

  const parsed = ResearchSchema.safeParse(json);
  if (!parsed.success) {
    return buildResearchFromSearchResults(input, searchResults, citations, evidenceBlock);
  }

  const localLocations = buildLocalLocationRows({
    researchText: `${evidenceBlock}\n${parsed.data.localFilmingPotential.value ?? ''}`,
    retailerName: retailer,
    citations,
  });

  const needsVerification = [...parsed.data.needsVerification];
  if (!localScope.configured) {
    needsVerification.push(`NEEDS VERIFICATION: ${localRelevanceUnresolvedNote()}`);
  }

  return {
    ...parsed.data,
    needsVerification,
    citations,
    localLocations,
    researchedAt: new Date().toISOString(),
  };
}

function buildResearchFromSearchResults(
  input: {
    title: string;
    brandName: string | null;
    retailerName: string | null;
    submittedUrl: string | null;
  },
  searchResults: Array<{ key: string; summary: string | null; citations: WebResearchCitation[] }>,
  citations: WebResearchCitation[],
  evidenceBlock: string,
): PartnershipResearch {
  const byKey = Object.fromEntries(searchResults.map((r) => [r.key, r.summary]));
  const brand = input.brandName ?? input.title;
  const localScope = getCreatorLocalScope();

  const needsVerification: string[] = [];
  const mark = (text: string | null | undefined, label: string) => {
    if (!text || /cannot find|not found|no official/i.test(text)) {
      needsVerification.push(`NEEDS VERIFICATION: ${label}`);
      return null;
    }
    return text;
  };

  const companySummary = mark(byKey.company, 'Company/product description');
  const creatorProgram = mark(byKey.program, 'Official creator/affiliate program details');
  if (!byKey.local || /do not|not currently|online only|verify/i.test(byKey.local ?? '')) {
    needsVerification.push(
      localScope.configured
        ? `NEEDS VERIFICATION: Store inventory for filming within ${localScope.label}`
        : `NEEDS VERIFICATION: ${localRelevanceUnresolvedNote()}`,
    );
  }
  if (!creatorProgram) {
    needsVerification.push('NEEDS VERIFICATION: Application or contact path for creators');
  }

  return {
    companySummary: field(companySummary ?? brand, companySummary ? 'inferred' : 'needs_verification', 'web_search'),
    audienceFitRationale: field(
      mark(byKey.company, 'Audience fit rationale') ??
        'NEEDS VERIFICATION: Assess fit for creator audience after program verification.',
      'needs_verification',
      'web_search',
    ),
    creatorProgram: field(creatorProgram, creatorProgram ? 'inferred' : 'needs_verification', 'web_search'),
    programBenefits: field(byKey.program ?? null, byKey.program ? 'inferred' : 'unavailable', 'web_search'),
    programRequirements: field(null, 'needs_verification', null),
    socialAccounts: field(byKey.social ?? null, byKey.social ? 'inferred' : 'unavailable', 'web_search'),
    recentCollaborations: field(byKey.social ?? null, byKey.social ? 'inferred' : 'unavailable', 'web_search'),
    retailerRelationships: field(byKey.retailer ?? null, byKey.retailer ? 'inferred' : 'unavailable', 'web_search'),
    localFilmingPotential: field(byKey.local ?? null, byKey.local ? 'inferred' : 'needs_verification', 'web_search'),
    creatorContactPath: field(
      creatorProgram,
      creatorProgram ? 'inferred' : 'needs_verification',
      'web_search',
    ),
    productsPricingHooks: field(byKey.company ?? null, byKey.company ? 'inferred' : 'unavailable', 'web_search'),
    organicBeforeApproval: field(
      'NEEDS VERIFICATION: Confirm whether organic teaser content is viable before partnership approval.',
      'needs_verification',
      null,
    ),
    needsVerification,
    citations,
    localLocations: buildLocalLocationRows({
      researchText: `${evidenceBlock}\n${byKey.local ?? ''}`,
      retailerName: input.retailerName,
      citations,
    }),
    researchSummary: [byKey.company, byKey.program, byKey.retailer].filter(Boolean).join(' ').slice(0, 500) || null,
    storyAngleCandidates: [
      {
        angle: `Discover ${brand}${input.retailerName ? ` at ${input.retailerName}` : ''} — verify inventory before filming.`,
        premiseTags: ['inferred'],
      },
    ],
    nextActionInputs: [
      {
        action: 'call_location',
        rationale: 'Confirm local inventory before recommending in-store filming.',
        blockedBy: ['inventory_unresolved'],
      },
      {
        action: creatorProgram ? 'apply_creator_program' : 'research_further',
        rationale: creatorProgram
          ? 'Creator/affiliate program signals found — review application path.'
          : 'Creator program details still need verification.',
      },
    ],
    researchedAt: new Date().toISOString(),
  };
}

function buildFallbackResearch(
  input: {
    title: string;
    brandName: string | null;
    retailerName: string | null;
    submittedUrl: string | null;
  },
  citations: WebResearchCitation[],
  evidenceBlock: string,
): PartnershipResearch {
  const brand = input.brandName ?? input.title;
  const localScope = getCreatorLocalScope();
  return {
    companySummary: field(brand, 'inferred', 'submission'),
    audienceFitRationale: field(
      'NEEDS VERIFICATION: Run full web research to assess audience fit for KCKellie.',
      'needs_verification',
      null,
    ),
    creatorProgram: field(null, 'needs_verification', null),
    programBenefits: field(null, 'unavailable', null),
    programRequirements: field(null, 'unavailable', null),
    socialAccounts: field(null, 'unavailable', null),
    recentCollaborations: field(null, 'unavailable', null),
    retailerRelationships: field(
      input.retailerName ? `${brand} may be sold via ${input.retailerName}` : null,
      input.retailerName ? 'inferred' : 'unavailable',
      input.submittedUrl,
    ),
    localFilmingPotential: field(
      localScope.configured
        ? `NEEDS VERIFICATION: Confirm inventory within ${localScope.label} before recommending a filming location.`
        : localRelevanceUnresolvedNote(),
      'needs_verification',
      null,
    ),
    creatorContactPath: field(null, 'unavailable', null),
    productsPricingHooks: field(null, 'unavailable', null),
    organicBeforeApproval: field(
      'NEEDS VERIFICATION: Assess whether organic content is viable before partnership approval.',
      'needs_verification',
      null,
    ),
    needsVerification: [
      'NEEDS VERIFICATION: Official creator/affiliate program details',
      localScope.configured
        ? `NEEDS VERIFICATION: Store inventory for filming within ${localScope.label}`
        : `NEEDS VERIFICATION: ${localRelevanceUnresolvedNote()}`,
      'NEEDS VERIFICATION: Application or contact path for creators',
    ],
    citations,
    localLocations: buildLocalLocationRows({
      researchText: evidenceBlock,
      retailerName: input.retailerName,
      citations,
    }),
    researchSummary: `Initial partnership candidate captured for ${brand}. Web research ${env.OPENAI_API_KEY ? 'failed to structure' : 'requires API key'}.`,
    storyAngleCandidates: [],
    nextActionInputs: [
      {
        action: 'research_further',
        rationale: 'Research could not be fully structured — gather official program details.',
      },
    ],
    researchedAt: new Date().toISOString(),
  };
}
