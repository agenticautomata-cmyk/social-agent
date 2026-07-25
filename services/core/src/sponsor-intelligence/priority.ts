import type { SponsorRecommendation } from './recommendations.js';

export type SponsorBriefingLink = {
  label: string;
  href: string;
};

export function shouldPromoteSponsorCandidate(rec: SponsorRecommendation): boolean {
  if (rec.sponsorContactStatus === 'not_interested') return false;
  if (/^KC Sipps:/i.test(rec.title)) return false;
  if (rec.recommendedPitchAngle === 'NO VALID ANGLE') return false;
  if (rec.suggestedContentAngle === 'NO VALID ANGLE') return false;
  return rec.scores.contactFirst >= 70;
}

export function sponsorBriefingLinkFromCandidate(rec: SponsorRecommendation): SponsorBriefingLink {
  if (rec.sponsorContactId) {
    return {
      label: `Finish pitch email: ${rec.businessName}`,
      href: `/email/approvals`,
    };
  }
  return {
    label: `Start sponsor pitch: ${rec.businessName}`,
    href: `/sponsor-intelligence`,
  };
}
