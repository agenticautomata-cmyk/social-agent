import { getCreatorLocalScope, localRelevanceUnresolvedNote } from './creator-local-scope.js';
import type { PartnershipDecisionBrief } from './partnership-sources.js';
import type { PartnershipUrlIntelligence } from './url-intelligence.js';
import { titleCaseSlug } from './url-intelligence.js';
import type { PartnershipResearch } from './types.js';
import type { SanitizedStoryAngle } from './story-angles.js';
import type { RankedNextAction } from './next-actions.js';

export function buildProvisionalDecisionBrief(input: {
  partnershipId: string;
  brandName: string | null;
  retailerName: string | null;
  title: string;
  urlIntel: PartnershipUrlIntelligence;
  researchStatus: string;
}): PartnershipDecisionBrief {
  const cleanEntities: PartnershipDecisionBrief['entities'] = [];
  if (input.retailerName) {
    cleanEntities.push({ name: input.retailerName, type: 'retailer', confidence: 0.7 });
  }
  if (input.brandName) {
    cleanEntities.push({ name: input.brandName, type: 'brand', confidence: 0.55 });
  }

  const provisionalSignals: string[] = [];
  if (input.urlIntel.storeFilterTokens.length > 0) {
    provisionalSignals.push(
      `URL store/local filter present (${input.urlIntel.storeFilterTokens.map((t) => t.storeId).join(', ')}) — not confirmed inventory`,
    );
  }
  for (const h of input.urlIntel.heuristics) {
    if (h.label === 'likely_category_path' || h.label === 'likely_brand_slug') {
      provisionalSignals.push(`URL hint: ${h.label.replace(/_/g, ' ')}`);
    }
  }

  const gaps: string[] = [
    'Page content not fetched yet',
    'Figuring out what kind of opportunity this is (creator/affiliate vs discovery)',
    'Creator/affiliate program research queued',
    'Local inventory not verified',
  ];
  const scope = getCreatorLocalScope();
  const localRelevance = scope.configured
    ? `Configured local scope: ${scope.label} (provisional — not verified)`
    : localRelevanceUnresolvedNote();

  return {
    phase: 'provisional',
    headline: input.title,
    entities: cleanEntities,
    localRelevance,
    provisionalSignals,
    knownGaps: gaps,
    researchStatus: input.researchStatus,
    partnershipHref: `/partnerships/${input.partnershipId}`,
    updatedAt: new Date().toISOString(),
  };
}

export function buildCompletedDecisionBrief(input: {
  partnershipId: string;
  title: string;
  brandName: string | null;
  retailerName: string | null;
  research: PartnershipResearch;
  fitScore: number | null;
  researchStatus: string;
  storyAngles: SanitizedStoryAngle[];
  nextActions: RankedNextAction[];
  urlIntel?: PartnershipUrlIntelligence | null;
}): PartnershipDecisionBrief {
  const entities: PartnershipDecisionBrief['entities'] = [];
  if (input.retailerName) {
    entities.push({ name: input.retailerName, type: 'retailer', confidence: 0.8 });
  }
  if (input.brandName) {
    entities.push({ name: input.brandName, type: 'brand', confidence: 0.75 });
  }

  const provisionalSignals: string[] = [];
  if (input.urlIntel?.storeFilterTokens.length) {
    provisionalSignals.push(
      'URL store/local filter was present — treated as provisional, not confirmed stock',
    );
  }

  const scope = getCreatorLocalScope();
  let localRelevance: string | null;
  if (!scope.configured) {
    localRelevance = localRelevanceUnresolvedNote();
  } else if (input.research.localFilmingPotential?.value) {
    localRelevance = `${scope.label}: ${input.research.localFilmingPotential.value} (${input.research.localFilmingPotential.status})`;
  } else {
    localRelevance = `${scope.label}: local filming potential still needs verification`;
  }

  return {
    phase: 'complete',
    headline: input.title,
    entities,
    localRelevance,
    provisionalSignals,
    knownGaps: input.research.needsVerification ?? [],
    storyAngles: input.storyAngles.map((a) => ({
      angle: a.angle,
      status: a.status,
    })),
    nextActions: input.nextActions.map((a) => ({
      action: a.action,
      why: a.why,
      href: a.href,
    })),
    fitScore: input.fitScore,
    researchStatus: input.researchStatus,
    partnershipHref: `/partnerships/${input.partnershipId}`,
    updatedAt: new Date().toISOString(),
  };
}

export function formatProvisionalBriefAnswer(brief: PartnershipDecisionBrief): {
  answer: string;
  evidence: string[];
  suggestedActions: string[];
} {
  const entityLine =
    brief.entities.length > 0
      ? brief.entities.map((e) => `${e.name} (${e.type}, ~${Math.round(e.confidence * 100)}%)`).join('; ')
      : 'entities still resolving from URL structure';

  const lines = [
    `Looking at: ${brief.headline}`,
    '',
    `Tentative entities: ${entityLine}`,
    brief.localRelevance ? `Local relevance: ${brief.localRelevance}` : null,
    '',
    'Provisional signals:',
    ...(brief.provisionalSignals.length
      ? brief.provisionalSignals.map((s) => `• ${s}`)
      : ['• URL captured; deeper signals pending async research']),
    '',
    'Still checking:',
    ...brief.knownGaps.map((g) => `• ${g}`),
    '',
    'Research is running in the background — this card will update when it finishes.',
  ].filter((l): l is string => l != null);

  return {
    answer: lines.join('\n'),
    evidence: brief.provisionalSignals,
    suggestedActions: [`Open Creator Partnership → ${brief.partnershipHref}`],
  };
}

export function formatCompletedBriefAnswer(brief: PartnershipDecisionBrief): {
  answer: string;
  evidence: string[];
  suggestedActions: string[];
} {
  const lines = [
    `Opportunity: ${brief.headline}`,
    '',
    brief.entities.length
      ? `Entities: ${brief.entities.map((e) => e.name).join(', ')}`
      : null,
    brief.fitScore != null ? `Creator Fit Score: ${brief.fitScore}` : null,
    brief.localRelevance ? `Local relevance: ${brief.localRelevance}` : null,
    '',
    'Needs verification:',
    ...(brief.knownGaps.length ? brief.knownGaps.map((g) => `• ${g}`) : ['• None listed']),
  ].filter((l): l is string => l != null);

  if (brief.storyAngles?.length) {
    lines.push('', 'Story angles:');
    for (const a of brief.storyAngles.slice(0, 3)) {
      lines.push(`• [${a.status}] ${a.angle}`);
    }
  }

  if (brief.nextActions?.length) {
    lines.push('', 'Recommended next actions:');
    for (const a of brief.nextActions) {
      lines.push(`• ${a.action}: ${a.why}`);
    }
  }

  const suggested = [`Open Creator Partnership → ${brief.partnershipHref}`];
  if (brief.nextActions?.[0]?.href) {
    suggested.push(`${brief.nextActions[0].action} → ${brief.nextActions[0].href}`);
  }

  return {
    answer: lines.join('\n'),
    evidence: brief.provisionalSignals,
    suggestedActions: suggested,
  };
}

/** Helper for URL-only title when page is not fetched yet. */
export function buildTitleFromUrlIntel(input: {
  brandName: string | null;
  retailerName: string | null;
  brandSlug: string | null;
}): string {
  const brand = input.brandName ?? (input.brandSlug ? titleCaseSlug(input.brandSlug) : null);
  if (brand && input.retailerName && !brand.toLowerCase().includes(input.retailerName.toLowerCase())) {
    return `${brand} at ${input.retailerName}`;
  }
  return brand || input.retailerName || 'Creator partnership candidate';
}
