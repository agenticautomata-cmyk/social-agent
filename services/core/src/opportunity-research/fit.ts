/**
 * KCKellie fit ratings with explicit reasons — not a mysterious single score.
 */

import type { FitRating, OfficialBusinessInfo, OpportunityContact, PartnershipProgram } from './types.js';

export function assessKcKellieFit(input: {
  businessName: string;
  location: string | null;
  category: string | null;
  business: OfficialBusinessInfo;
  contacts: OpportunityContact[];
  programs: PartnershipProgram[];
  openingDate: string | null;
  summary: string | null;
}): FitRating[] {
  const hasLocal =
    Boolean(input.location) ||
    Boolean(input.business.streetAddress.value) ||
    /kansas city|country club plaza|plaza|overland park|lawrence/i.test(
      `${input.location ?? ''} ${input.business.cityStateZip.value ?? ''}`,
    );

  const hasVisual =
    /retail|fashion|restaurant|hotel|attraction|boutique|store|dining|hospitality/i.test(
      `${input.category ?? ''} ${input.business.category.value ?? ''} ${input.summary ?? ''}`,
    );

  const hasProgram = input.programs.some(
    (p) =>
      ['creator', 'influencer', 'ambassador', 'press_media', 'hosted_experience'].includes(p.programType) &&
      p.verificationStatus !== 'not_found',
  );

  const hasContact = input.contacts.some(
    (c) => c.email || c.contactFormUrl || c.phone,
  );

  const luxuryOnly =
    /luxury|premium|high-end/i.test(`${input.summary ?? ''} ${input.business.category.value ?? ''}`) &&
    !hasLocal;

  return [
    {
      dimension: 'local_relevance',
      rating: hasLocal ? 'high' : 'low',
      reason: hasLocal
        ? 'Kansas City metro location or Plaza/local address is supported by evidence.'
        : 'No clear KC-local location evidence yet.',
    },
    {
      dimension: 'audience_fit',
      rating: luxuryOnly ? 'medium' : hasVisual ? 'high' : 'medium',
      reason: luxuryOnly
        ? 'Luxury positioning alone is not proof of strong KCKellie audience fit — treat as medium until coverage angle is clear.'
        : hasVisual
          ? 'Category supports lifestyle / what’s-new coverage Kellie typically publishes.'
          : 'Audience fit depends on a concrete local angle; evidence is still thin.',
    },
    {
      dimension: 'content_potential',
      rating: hasVisual ? 'high' : 'medium',
      reason: hasVisual
        ? 'Storefront, product, or experience visuals are plausible for short-form video.'
        : 'Content potential is unclear without stronger category or offering evidence.',
    },
    {
      dimension: 'relationship_potential',
      rating: hasContact || hasProgram ? 'medium' : 'low',
      reason: hasContact || hasProgram
        ? 'A public contact path or program exists for relationship outreach prep (human approval required).'
        : 'No public relationship path found yet — research contact/program pages first.',
    },
    {
      dimension: 'monetization_potential',
      rating: hasProgram ? 'medium' : 'low',
      reason: hasProgram
        ? 'A program pathway was found; compensation remains unconfirmed unless officially published.'
        : 'No official monetization pathway confirmed — organic coverage may still be valuable.',
    },
    {
      dimension: 'urgency',
      rating: input.openingDate ? 'high' : 'medium',
      reason: input.openingDate
        ? `Opening/announcement timing (${input.openingDate}) makes near-term coverage more timely.`
        : 'No firm opening date — evergreen or needs_research timing.',
    },
    {
      dimension: 'evidence_confidence',
      rating:
        input.business.website.label === 'verified' || input.business.streetAddress.label === 'verified'
          ? 'high'
          : input.business.website.value || input.business.streetAddress.value
            ? 'medium'
            : 'low',
      reason:
        input.business.website.label === 'verified' || input.business.streetAddress.label === 'verified'
          ? 'At least one core business fact is verified from a cited source.'
          : 'Core business facts are still leads or missing — keep confidence honest.',
    },
  ];
}
