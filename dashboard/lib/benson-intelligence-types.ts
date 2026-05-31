export type BensonScores = {
  audience: number;
  sponsor: number;
  revenue: number;
  trend: number;
  confidence: number;
};

export type BensonAnalyticsSimilar = {
  category: string | null;
  avgViews: number | null;
  avgEngagementRate: number | null;
  avgCompletionRate: number | null;
  sampleSize: number;
};

export type LinkedPipelineOpportunity = {
  id: string;
  title: string;
  status: string;
  statusLabel: string;
  estimatedValue: number | null;
  sponsorBusinessName: string;
  plannerListName: string | null;
};

export type BensonBriefingPriority = {
  rank: number;
  label: string;
  href: string | null;
  kind: 'pipeline' | 'content' | 'outreach' | 'planner' | 'analytics';
};

export type BensonHubSection = {
  headline: string;
  summary: string;
  metrics: Array<{ label: string; value: string | number }>;
  highlights: string[];
  href: string;
};

export type BensonHubResponse = {
  demoMode: boolean;
  generatedAt: string;
  briefingPriorities: BensonBriefingPriority[];
  sections: {
    content: BensonHubSection;
    sponsors: BensonHubSection;
    pipeline: BensonHubSection;
    analytics: BensonHubSection;
    outreach: BensonHubSection;
  };
};

export type PlannedContentLink = {
  contentItemId: string;
  title: string;
  listName: string;
  plannedDate: string | null;
  status: string;
};
