import { formatIsoDate } from '../datetime.js';
import type { CoverageFormat } from '../coverage-format/constants.js';
import type { OpportunityFacts } from './validate-facts.js';
import type { FactValidation } from './validate-facts.js';

export type FallbackGreenScreenContent = {
  status: 'draft';
  suggestedHeadline: string;
  openingHook: string;
  spokenScript: string;
  keyFacts: string[];
  eventDates: string | null;
  location: string | null;
  priceOrOffer: string | null;
  restrictions: string | null;
  backgroundSources: Array<{ label: string; url: string | null }>;
  onScreenText: string[];
  caption: string;
  hashtags: string[];
  callToAction: string;
  sourceAttribution: string | null;
  verificationStatus: FactValidation['verificationStatus'];
  verificationFlags: string[];
  visitLaterNotes: string | null;
};

export function buildFallbackGreenScreenPackage(
  facts: OpportunityFacts,
  validation: FactValidation,
  coverageFormat: CoverageFormat | null,
): FallbackGreenScreenContent {
  const headline = facts.title.slice(0, 100);
  const hook = facts.firsthandVisited
    ? `Quick KC update: ${headline}`
    : `Here's what was announced in KC: ${headline}`;

  const scriptParts = [
    hook,
    facts.summary ? facts.summary.slice(0, 400) : null,
    facts.eventDate ? `Date: ${formatIsoDate(facts.eventDate)}` : null,
    facts.location ? `Location: ${facts.location}` : null,
    facts.priceOrOffer ? `Offer: ${facts.priceOrOffer}` : null,
    !facts.firsthandVisited && coverageFormat === 'green_screen_then_visit'
      ? "I haven't visited yet — I'll follow up after it opens."
      : !facts.firsthandVisited
        ? 'According to the announcement — I have not verified this in person yet.'
        : null,
  ].filter(Boolean);

  const flags = [
    ...validation.missingFields.map((f) => `Missing: ${f}`),
    ...validation.unverifiedFields.map((f) => `Unverified: ${f}`),
    ...validation.warnings,
  ];

  return {
    status: 'draft',
    suggestedHeadline: headline,
    openingHook: hook,
    spokenScript: scriptParts.join('\n\n'),
    keyFacts: scriptParts.slice(1, 4).filter((p): p is string => Boolean(p)),
    eventDates: facts.eventDate ? formatIsoDate(facts.eventDate) : null,
    location: facts.location,
    priceOrOffer: facts.priceOrOffer,
    restrictions: facts.restrictions,
    backgroundSources: facts.sourceUrl
      ? [{ label: 'Source link', url: facts.sourceUrl }]
      : [],
    onScreenText: [headline.slice(0, 40)],
    caption: `${hook}\n\n${facts.location ? `📍 ${facts.location}` : ''}\n\n#KansasCity #KC #kclife`.trim(),
    hashtags: ['KansasCity', 'KC', 'kclife'],
    callToAction: 'Save this for your KC plans ✨',
    sourceAttribution: facts.sourceAttribution ?? facts.sourceUrl,
    verificationStatus: validation.verificationStatus,
    verificationFlags: flags,
    visitLaterNotes:
      coverageFormat === 'green_screen_then_visit'
        ? 'Plan an in-person visit after opening for a follow-up POV or review.'
        : null,
  };
}
