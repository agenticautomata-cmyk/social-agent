export const PLAYBOOK_CATEGORY = 'TikTok Creator Playbook' as const;

export const PLAYBOOK_CATEGORIES = [
  'tiktok-academy',
  'creator-tools',
  'tiktok-studio',
  'creator-search-insights',
  'creative-center',
  'ads-creative-best-practices',
  'ads-best-practices',
] as const;

export type PlaybookCategory = (typeof PLAYBOOK_CATEGORIES)[number];

export type PlaybookCapability =
  | 'general'
  | 'improve-hook'
  | 'rewrite-caption'
  | 'tiktok-seo'
  | 'hashtags'
  | 'posting-times'
  | 'studio-metrics'
  | 'search-insights'
  | 'sponsor-angle'
  | 'script'
  | 'before-posting'
  | 'analyze-screenshot'
  | 'content-ideas'
  | 'post-today';

export type SeedPlaybookSource = {
  slug: string;
  name: string;
  category: PlaybookCategory;
  notes: string;
  downloadPatterns: RegExp[];
  excludePatterns?: RegExp[];
  documentTitle: string;
};

export const SEED_PLAYBOOK_SOURCES: SeedPlaybookSource[] = [
  {
    slug: 'tiktok-academy',
    name: 'TikTok Academy',
    category: 'tiktok-academy',
    notes: 'Official creator education — growth, analytics, best practices.',
    downloadPatterns: [/tiktok academy/i, /creator academy/i, /creator-academy/i],
    excludePatterns: [/creative center/i, /ads\.tiktok/i],
    documentTitle: 'TikTok Academy',
  },
  {
    slug: 'tiktok-creator-tools',
    name: 'TikTok Creator Tools',
    category: 'creator-tools',
    notes: 'In-app creator tools, analytics, monetization basics.',
    downloadPatterns: [/tiktok creator tools/i, /creator tools/i, /tiktok.*analytics/i],
    excludePatterns: [/tiktok studio/i, /creative center/i, /search insights/i, /ads/i],
    documentTitle: 'TikTok Creator Tools',
  },
  {
    slug: 'tiktok-studio-help',
    name: 'TikTok Studio Help',
    category: 'tiktok-studio',
    notes: 'Desktop Studio upload, analytics, scheduling, bulk upload.',
    downloadPatterns: [/tiktok studio/i, /studio.*tiktok/i, /advanced desktop tools/i],
    excludePatterns: [/creative center/i, /ads/i],
    documentTitle: 'TikTok Studio Guide',
  },
  {
    slug: 'creator-search-insights',
    name: 'Creator Search Insights',
    category: 'creator-search-insights',
    notes: 'Search topics, content gaps, search analytics.',
    downloadPatterns: [/creator search insights/i, /search analytics/i, /search insights/i],
    excludePatterns: [/creative center/i, /ads/i],
    documentTitle: 'Creator Search Insights',
  },
  {
    slug: 'tiktok-creative-center',
    name: 'TikTok Creative Center',
    category: 'creative-center',
    notes: 'Trending hooks, top ads, creative inspiration.',
    downloadPatterns: [/creative center/i, /creativecenter/i, /tiktok creative/i],
    excludePatterns: [/ads best practices guide/i],
    documentTitle: 'TikTok Creative Center',
  },
  {
    slug: 'tiktok-ads-creative-best-practices',
    name: 'TikTok Ads Creative Best Practices',
    category: 'ads-creative-best-practices',
    notes: 'Official ad creative guidance applicable to organic hooks and structure.',
    downloadPatterns: [/ads creative best/i, /creative best practices/i, /best practices.*creative/i],
    documentTitle: 'TikTok Ads Creative Best Practices',
  },
  {
    slug: 'tiktok-ads-best-practices',
    name: 'TikTok Ads Best Practices',
    category: 'ads-best-practices',
    notes: 'Platform best practices for content structure and engagement.',
    downloadPatterns: [/tiktok ads best practices/i, /ads best practices/i, /advertis.*best practices/i],
    excludePatterns: [/creative best practices/i],
    documentTitle: 'TikTok Ads Best Practices',
  },
];

export const PLAYBOOK_SCOPE_RULES: Array<{
  slug: string;
  patterns: RegExp[];
  keywords: string[];
}> = [
  {
    slug: 'tiktok-academy',
    patterns: [/academy/i, /creator academy/i],
    keywords: ['academy', 'course', 'learn', 'education'],
  },
  {
    slug: 'tiktok-studio-help',
    patterns: [/studio/i, /desktop/i, /bulk upload/i, /schedule/i],
    keywords: ['studio', 'upload', 'schedule', 'analytics tab', 'desktop'],
  },
  {
    slug: 'creator-search-insights',
    patterns: [/search insights/i, /search analytics/i, /content gap/i],
    keywords: ['search insights', 'search topic', 'content gap', 'searchable'],
  },
  {
    slug: 'tiktok-creative-center',
    patterns: [/creative center/i, /trending/i, /top ads/i],
    keywords: ['creative center', 'trend', 'hook inspiration'],
  },
  {
    slug: 'tiktok-creator-tools',
    patterns: [/creator tools/i, /in-app analytics/i],
    keywords: ['creator tools', 'analytics', 'retention', 'watch time'],
  },
  {
    slug: 'tiktok-ads-creative-best-practices',
    patterns: [/creative best/i, /hook/i, /first 3 seconds/i],
    keywords: ['hook', 'creative', 'first frame', 'caption'],
  },
  {
    slug: 'tiktok-ads-best-practices',
    patterns: [/best practices/i, /posting/i, /hashtag/i],
    keywords: ['hashtag', 'posting', 'best practice', 'strategy'],
  },
];

export const SCRIPT_FORMATS = [
  'food-review',
  'thrift-find',
  'store-walkthrough',
  'kc-event',
  'product-review',
  'talking-head',
] as const;

export type ScriptFormat = (typeof SCRIPT_FORMATS)[number];
