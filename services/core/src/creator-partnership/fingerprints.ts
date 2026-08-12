import type { PartnershipFingerprints, PartnershipResearch, VerifiedResearchField } from './types.js';

const SHARED_PLATFORMS = ['shopmy', 'ltk', 'grin', 'aspire', 'impact', 'rewardstyle'];

function domainFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function phrasesFromField(field: VerifiedResearchField | undefined, minLen = 4): string[] {
  if (!field?.value || field.status === 'unavailable' || field.status === 'needs_verification') {
    return [];
  }
  return field.value
    .split(/[^a-zA-Z0-9+'®]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= minLen)
    .slice(0, 12);
}

function extractProgramNames(research: PartnershipResearch): string[] {
  const names = new Set<string>();
  const sources = [research.creatorProgram, research.programBenefits];
  for (const field of sources) {
    if (!field?.value) continue;
    const match = field.value.match(/conscious collective|creator program|ambassador program|affiliate program/gi);
    if (match) {
      for (const m of match) names.add(m.replace(/\b\w/g, (c) => c.toUpperCase()));
    }
    if (/conscious collective/i.test(field.value)) names.add('Conscious Collective');
  }
  return [...names];
}

/** Build match fingerprints from verified/inferred research — not hard-coded brand logic. */
export function buildPartnershipFingerprints(input: {
  brandName: string | null;
  retailerName: string | null;
  research: PartnershipResearch;
}): PartnershipFingerprints {
  const domains = new Set<string>();
  for (const citation of input.research.citations ?? []) {
    const domain = domainFromUrl(citation.url);
    if (domain) domains.add(domain);
  }

  for (const field of [input.research.creatorContactPath, input.research.creatorProgram]) {
    if (!field?.value) continue;
    const urlMatch = field.value.match(/https?:\/\/[^\s)]+/gi) ?? [];
    for (const url of urlMatch) {
      const domain = domainFromUrl(url);
      if (domain) domains.add(domain);
    }
  }

  const keywordPhrases = new Set<string>();
  if (input.brandName) keywordPhrases.add(input.brandName.toLowerCase());
  for (const field of [
    input.research.companySummary,
    input.research.retailerRelationships,
    input.research.creatorProgram,
  ]) {
    for (const phrase of phrasesFromField(field)) {
      if (phrase.length >= 5) keywordPhrases.add(phrase.toLowerCase());
    }
  }

  const programNames = extractProgramNames(input.research);
  for (const platform of SHARED_PLATFORMS) {
    const blob = JSON.stringify(input.research).toLowerCase();
    if (blob.includes(platform)) {
      // Platforms referenced in research are tracked separately — not brand-specific match keys.
    }
  }

  return {
    brandName: input.brandName,
    retailerNames: input.retailerName ? [input.retailerName] : [],
    programNames,
    domains: [...domains],
    keywordPhrases: [...keywordPhrases].slice(0, 24),
    sharedPlatforms: SHARED_PLATFORMS,
    updatedAt: new Date().toISOString(),
  };
}

export { SHARED_PLATFORMS };
