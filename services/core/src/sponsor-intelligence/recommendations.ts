import { db } from '../db.js';
import { sponsorContacts } from '../schema.js';
import type { InventoryItem } from '../inventory/normalize.js';
import type { SponsorContactStatus } from '../sponsor-outreach/constants.js';
import { hasPlatformData, computePlatformDashboard } from '../creator-analytics/dashboard.js';
import {
  analyticsBoostForCategory,
  computeAllScores,
  contactFirstComposite,
  expectedAudienceFitLabel,
  isFastWinEligible,
  isHighRevenueEligible,
  isNewOpeningEligible,
  isSponsorEligible,
  isWorldCupEligible,
  recommendedPitchAngle,
  suggestedContentAngle,
  suggestedSponsorshipAngle,
} from './scoring.js';

export type SponsorIntelligenceSectionId =
  | 'contactFirst'
  | 'highRevenue'
  | 'fastWins'
  | 'worldCup'
  | 'newOpenings';

export type SponsorRecommendation = {
  contentItemId: string;
  sponsorContactId: string | null;
  sponsorContactStatus: SponsorContactStatus | null;
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

export type SponsorIntelligenceSection = {
  id: SponsorIntelligenceSectionId;
  title: string;
  description: string;
  items: SponsorRecommendation[];
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
  sections: SponsorIntelligenceSection[];
};

const SECTION_META: Record<
  SponsorIntelligenceSectionId,
  { title: string; description: string }
> = {
  contactFirst: {
    title: 'Contact First',
    description: 'Highest-probability sponsors — strong fit, confidence, and revenue signals combined.',
  },
  highRevenue: {
    title: 'High Revenue Potential',
    description: 'Luxury, dining, shopping districts, and visitor-focused businesses.',
  },
  fastWins: {
    title: 'Fast Wins',
    description: 'Local named businesses with simple, low-friction sponsorship opportunities.',
  },
  worldCup: {
    title: 'World Cup Opportunities',
    description: 'Businesses likely to benefit from WC26 visitor traffic in Kansas City.',
  },
  newOpenings: {
    title: 'New Openings',
    description: 'Businesses opening soon that need visibility and launch-week coverage.',
  },
};

type ContactLookup = Map<
  string,
  { id: string; status: SponsorContactStatus; sponsorFitScore: number | null }
>;

async function loadContactLookup(): Promise<ContactLookup> {
  const rows = await db.select().from(sponsorContacts);
  const map: ContactLookup = new Map();
  for (const row of rows) {
    if (!row.sourceOpportunityId) continue;
    map.set(row.sourceOpportunityId, {
      id: row.id,
      status: row.status,
      sponsorFitScore: row.sponsorFitScore != null ? Number(row.sponsorFitScore) : null,
    });
  }
  return map;
}

async function loadCategoryPerformance(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const hasData = await hasPlatformData('tiktok');
  if (!hasData) return map;

  const dash = await computePlatformDashboard('tiktok', true);
  for (const cat of dash.topCategories) {
    map.set(cat.label.toLowerCase(), cat.performanceIndex);
    map.set(cat.key.toLowerCase(), cat.performanceIndex);
  }
  return map;
}

function buildRecommendation(
  item: InventoryItem,
  contactLookup: ContactLookup,
  categoryPerformance: Map<string, number>,
): SponsorRecommendation {
  const contact = contactLookup.get(item.id);
  const analyticsBoost = analyticsBoostForCategory(item.category, categoryPerformance);
  const scores = computeAllScores(item, analyticsBoost);
  const contactFirst = contactFirstComposite(scores);

  return {
    contentItemId: item.id,
    sponsorContactId: contact?.id ?? null,
    sponsorContactStatus: contact?.status ?? null,
    title: item.title,
    businessName: item.businessName ?? item.title,
    category: item.category,
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    scores: { ...scores, contactFirst },
    recommendedPitchAngle: recommendedPitchAngle(item),
    whyBensonRecommends: item.whyItMatters,
    expectedAudienceFit: expectedAudienceFitLabel(scores.audienceFit),
    suggestedContentAngle: suggestedContentAngle(item),
    suggestedSponsorshipAngle: suggestedSponsorshipAngle(item),
  };
}

function rankItems(
  items: SponsorRecommendation[],
  scoreFn: (r: SponsorRecommendation) => number,
  limit: number,
): SponsorRecommendation[] {
  return [...items]
    .sort((a, b) => scoreFn(b) - scoreFn(a))
    .slice(0, limit);
}

function filterActive(
  items: InventoryItem[],
  contactLookup: ContactLookup,
): InventoryItem[] {
  return items.filter((item) => {
    const contact = contactLookup.get(item.id);
    if (contact?.status === 'not_interested') return false;
    return isSponsorEligible(item);
  });
}

export async function computeSponsorIntelligence(
  items: InventoryItem[],
  options?: { now?: Date; limit?: number; demoMode?: boolean },
): Promise<SponsorIntelligenceResponse> {
  const now = options?.now ?? new Date();
  const limit = options?.limit ?? 6;
  const contactLookup = await loadContactLookup();
  const categoryPerformance = await loadCategoryPerformance();
  const analyticsAvailable = categoryPerformance.size > 0;

  const dismissed = [...contactLookup.values()].filter((c) => c.status === 'not_interested').length;
  const activeItems = filterActive(items, contactLookup);
  const recommendations = activeItems.map((item) =>
    buildRecommendation(item, contactLookup, categoryPerformance),
  );

  const withLeads = recommendations.filter((r) => r.sponsorContactId).length;

  const contactFirst = rankItems(
    recommendations.filter((r) => r.sponsorContactStatus !== 'sent' && r.sponsorContactStatus !== 'converted'),
    (r) => r.scores.contactFirst,
    limit,
  );

  const highRevenue = rankItems(
    recommendations.filter((r) => {
      const item = activeItems.find((i) => i.id === r.contentItemId)!;
      return isHighRevenueEligible(item);
    }),
    (r) => r.scores.revenuePotential,
    limit,
  );

  const fastWins = rankItems(
    recommendations.filter((r) => {
      const item = activeItems.find((i) => i.id === r.contentItemId)!;
      return isFastWinEligible(item);
    }),
    (r) => r.scores.confidence + r.scores.sponsorFit * 0.5,
    limit,
  );

  const worldCup = rankItems(
    recommendations.filter((r) => {
      const item = activeItems.find((i) => i.id === r.contentItemId)!;
      return isWorldCupEligible(item);
    }),
    (r) => r.scores.revenuePotential + r.scores.audienceFit * 0.3,
    limit,
  );

  const newOpenings = rankItems(
    recommendations.filter((r) => {
      const item = activeItems.find((i) => i.id === r.contentItemId)!;
      return isNewOpeningEligible(item);
    }),
    (r) => r.scores.sponsorFit + r.scores.confidence * 0.4,
    limit,
  );

  const sectionIds: SponsorIntelligenceSectionId[] = [
    'contactFirst',
    'highRevenue',
    'fastWins',
    'worldCup',
    'newOpenings',
  ];

  const sectionItems: Record<SponsorIntelligenceSectionId, SponsorRecommendation[]> = {
    contactFirst,
    highRevenue,
    fastWins,
    worldCup,
    newOpenings,
  };

  return {
    demoMode: options?.demoMode ?? false,
    generatedAt: now.toISOString(),
    analyticsAvailable,
    counts: {
      totalEligible: activeItems.length,
      dismissed,
      withLeads,
    },
    sections: sectionIds.map((id) => ({
      id,
      title: SECTION_META[id].title,
      description: SECTION_META[id].description,
      items: sectionItems[id],
    })),
  };
}
