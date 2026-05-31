export type SponsorIntelligenceSectionId =
  | 'contactFirst'
  | 'highRevenue'
  | 'fastWins'
  | 'worldCup'
  | 'newOpenings';

export type SponsorRecommendation = {
  contentItemId: string;
  sponsorContactId: string | null;
  sponsorContactStatus: string | null;
  title: string;
  businessName: string;
  category: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  scores: {
    sponsorFit: number;
    audienceFit: number;
    revenuePotential: number;
    confidence: number;
    contactFirst: number;
  };
  recommendedPitchAngle: string;
  whyBensonRecommends: string;
  expectedAudienceFit: string;
  suggestedContentAngle: string;
  suggestedSponsorshipAngle: string;
};

export type SponsorIntelligenceResponse = {
  demoMode: boolean;
  generatedAt: string;
  analyticsAvailable: boolean;
  counts: {
    totalEligible: number;
    dismissed: number;
    withLeads: number;
  };
  sections: Array<{
    id: SponsorIntelligenceSectionId;
    title: string;
    description: string;
    items: SponsorRecommendation[];
  }>;
};

export function scoreTone(score: number): string {
  if (score >= 70) return 'text-accent font-bold';
  if (score >= 45) return 'text-paper-ink';
  return 'text-paper-muted';
}
