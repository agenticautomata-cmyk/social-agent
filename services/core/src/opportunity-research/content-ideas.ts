/**
 * Source-grounded content recommendations — concepts only, no over-claiming.
 */

import { randomUUID } from 'node:crypto';
import type { ContentRecommendation, OfficialBusinessInfo, OpportunityResearchDossier } from './types.js';

export function buildContentRecommendations(input: {
  businessName: string;
  location: string | null;
  business: OfficialBusinessInfo;
  openingDate: string | null;
  category: string | null;
}): ContentRecommendation[] {
  const name = input.businessName;
  const place = input.location ?? input.business.cityStateZip.value ?? 'Kansas City';
  const hasAddress = Boolean(input.business.streetAddress.value);
  const isRetail = /retail|fashion|clothing|boutique|store/i.test(
    `${input.category ?? ''} ${input.business.category.value ?? ''}`,
  );
  const isFood = /restaurant|dining|cafe|coffee|bar|food/i.test(
    `${input.category ?? ''} ${input.business.category.value ?? ''}`,
  );
  const isHotel = /hotel|hospitality|lodging/i.test(
    `${input.category ?? ''} ${input.business.category.value ?? ''}`,
  );

  const ideas: ContentRecommendation[] = [
    {
      id: randomUUID(),
      concept: `${name} store-opening spotlight`,
      whyItFits: `Local what’s-new coverage for ${place} audiences.`,
      requiredAccess: hasAddress ? 'Public storefront visit during posted hours' : 'Confirm location before filming',
      estimatedEffort: 'medium',
      permissionNeeded: false,
      evidence: compactEvidence(input.business),
      suggestedTiming: input.openingDate ? `Within 2–4 weeks of ${input.openingDate}` : 'After hours/address verified',
    },
    {
      id: randomUUID(),
      concept: `What’s new at ${place}`,
      whyItFits: 'Roundup-friendly novelty angle without requiring partnership approval.',
      requiredAccess: 'Exterior + publicly visible interiors only',
      estimatedEffort: 'low',
      permissionNeeded: false,
      evidence: compactEvidence(input.business),
      suggestedTiming: 'After verifying the location is open to the public',
    },
  ];

  if (isRetail) {
    ideas.push({
      id: randomUUID(),
      concept: 'First impressions / styling session',
      whyItFits: 'Fashion retail supports try-on or styling storytelling when staff permits.',
      requiredAccess: 'In-store browse; ask staff before filming product close-ups',
      estimatedEffort: 'medium',
      permissionNeeded: true,
      evidence: compactEvidence(input.business),
      suggestedTiming: 'Weekday quieter hours after soft/grand opening',
    });
  }
  if (isFood) {
    ideas.push({
      id: randomUUID(),
      concept: 'First-bite / menu highlight',
      whyItFits: 'Dining openings perform well as practical local recommendations.',
      requiredAccess: 'Dine as a guest; confirm filming norms with staff',
      estimatedEffort: 'medium',
      permissionNeeded: true,
      evidence: compactEvidence(input.business),
      suggestedTiming: 'After menu and hours are verified',
    });
  }
  if (isHotel) {
    ideas.push({
      id: randomUUID(),
      concept: 'Hosted stay / property walkthrough pitch',
      whyItFits: 'Hospitality opportunities often need a polished access request first.',
      requiredAccess: 'Property PR or partnerships approval',
      estimatedEffort: 'high',
      permissionNeeded: true,
      evidence: compactEvidence(input.business),
      suggestedTiming: 'After corporate/local PR contact is ranked',
    });
  }

  return ideas.slice(0, 6);
}

function compactEvidence(business: OfficialBusinessInfo): string[] {
  return [
    business.website.value,
    business.locationPage.value,
    business.streetAddress.value,
    business.openingDate.value,
  ].filter((v): v is string => Boolean(v));
}

export function buildOutreachPrep(dossier: OpportunityResearchDossier): NonNullable<
  OpportunityResearchDossier['outreachPrep']
> {
  const ranked = [...dossier.contacts].filter((c) => c.rank != null).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const best = ranked[0] ?? null;
  const backup = ranked[1] ?? null;
  const name = dossier.business.officialName.value ?? 'the business';
  const angle = dossier.contentRecommendations[0]?.concept ?? 'local opening spotlight';

  const draft = best
    ? [
        `Hi${best.name ? ` ${best.name.split(' ')[0]}` : ''},`,
        '',
        `I'm Kellie with KCKellie — I cover what’s new around Kansas City for a local audience.`,
        `I noticed ${name}${dossier.business.streetAddress.value ? ` at ${dossier.business.streetAddress.value}` : ''} and would love to explore a short, useful local feature (${angle}).`,
        '',
        `Happy to share a media kit and keep the ask simple. Would you be the right person, or could you point me to the best contact?`,
        '',
        `Thanks,`,
        `Kellie`,
      ].join('\n')
    : null;

  return {
    bestContactId: best?.id ?? null,
    backupContactId: backup?.id ?? null,
    recommendedApproach: best?.contactFormUrl && !best.email
      ? 'Use the official form; do not invent an email.'
      : best?.email
        ? 'Personalized email to the ranked contact after human approval.'
        : best?.phone
          ? 'Call the published store/corporate phone; do not auto-dial.'
          : 'Research first — no usable public contact path yet.',
    personalizationFacts: [
      dossier.business.streetAddress.value,
      dossier.business.openingDate.value,
      dossier.business.locationPage.value,
    ].filter((v): v is string => Boolean(v)),
    proposedContentAngle: angle,
    valueToBusiness: 'Local awareness with a practical KC audience and clear source attribution.',
    appropriateRequest: 'Introduction + permission for a short local feature or program application guidance.',
    suggestedAttachments: ['KCKellie media kit', 'Recent local coverage samples'],
    followUpTiming: '5–7 business days after first touch if no reply',
    draft,
    requiresUserApproval: true,
    autoSend: false,
  };
}
