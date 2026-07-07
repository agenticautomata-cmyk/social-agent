export const EQUIPMENT_CATEGORIES = [
  'gimbal',
  'microphone',
  'camera',
  'lighting',
  'tripod',
  'phone',
  'accessory',
  'software',
  'platform',
] as const;

export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number];

export const DEFAULT_EQUIPMENT_OWNER = 'Kellie';

export type SeedEquipment = {
  slug: string;
  name: string;
  brand: string;
  model: string;
  category: EquipmentCategory;
  notes: string;
  downloadPatterns: RegExp[];
  excludePatterns?: RegExp[];
  manualTitle: string;
};

export const SEED_EQUIPMENT: SeedEquipment[] = [
  {
    slug: 'dji-osmo-mobile-8',
    name: 'DJI Osmo Mobile 8',
    brand: 'DJI',
    model: 'Osmo Mobile 8',
    category: 'gimbal',
    notes: 'Phone gimbal for TikTok and walking content.',
    downloadPatterns: [/osmo.*mobile.*8/i, /osmo_mobile_8/i],
    manualTitle: 'Osmo Mobile 8 User Manual',
  },
  {
    slug: 'hollyland-lark-m2',
    name: 'Hollyland LARK M2',
    brand: 'Hollyland',
    model: 'LARK M2',
    category: 'microphone',
    notes: 'Wireless lav mic for clean audio on the go.',
    downloadPatterns: [/lark\s*m2/i, /lark_m2/i],
    manualTitle: 'LARK M2 User Manual',
  },
  {
    slug: 'apple-iphone-17-pro',
    name: 'Apple iPhone 17 Pro',
    brand: 'Apple',
    model: 'iPhone 17 Pro',
    category: 'phone',
    notes: 'Primary TikTok camera — Camera app, Camera Control, ProRes, focus/exposure lock.',
    downloadPatterns: [
      /iphone.*user.*guide/i,
      /iphone\s*17\s*pro/i,
      /iphone_17_pro/i,
      /camera control/i,
      /camera basics/i,
      /advanced camera settings/i,
      /apple.*iphone.*guide/i,
    ],
    excludePatterns: [/tiktok/i, /capcut/i, /blackmagic/i],
    manualTitle: 'iPhone User Guide',
  },
  {
    slug: 'tiktok-studio',
    name: 'TikTok Studio',
    brand: 'TikTok',
    model: 'Studio',
    category: 'platform',
    notes: 'Desktop/web creator workflow — upload, analytics, scheduling.',
    downloadPatterns: [/tiktok studio/i, /studio.*tiktok/i],
    manualTitle: 'TikTok Studio Guide',
  },
  {
    slug: 'tiktok',
    name: 'TikTok',
    brand: 'TikTok',
    model: 'Creator app',
    category: 'platform',
    notes: 'Mobile creator tools, analytics, Creator Search Insights, TikTok Academy.',
    downloadPatterns: [
      /tiktok creator tools/i,
      /creator search insights/i,
      /tiktok academy/i,
      /tiktok.*analytics/i,
      /tiktok.*creator/i,
    ],
    excludePatterns: [/tiktok studio/i, /capcut/i, /blackmagic/i],
    manualTitle: 'TikTok Creator Tools',
  },
  {
    slug: 'capcut',
    name: 'CapCut',
    brand: 'CapCut',
    model: 'Mobile / Desktop',
    category: 'software',
    notes: 'Quick TikTok edits, captions, templates, export for TikTok.',
    downloadPatterns: [/capcut/i],
    manualTitle: 'CapCut Editing Guide',
  },
  {
    slug: 'blackmagic-camera',
    name: 'Blackmagic Camera',
    brand: 'Blackmagic Design',
    model: 'Camera app',
    category: 'software',
    notes: 'Pro manual controls when iPhone Camera app is not enough.',
    downloadPatterns: [/blackmagic camera/i, /blackmagic.*iphone/i, /bmd.*camera/i],
    manualTitle: 'Blackmagic Camera Guide',
  },
];

export const OSMO_TOPIC_KEYWORDS = [
  'charging', 'unfold', 'attach', 'dji mimo', 'mimo', 'firmware', 'gimbal', 'osmo',
  'follow mode', 'tracking', 'balance', 'calibrat',
];

export const LARK_TOPIC_KEYWORDS = [
  'lark', 'hollyland', 'lav', 'microphone', 'noise cancel', 'transmitter', 'receiver', 'tx', 'rx',
];

export const IPHONE_TOPIC_KEYWORDS = [
  'iphone', 'camera control', 'camera app', 'exposure lock', 'focus lock', 'ae/af lock',
  'prores', 'log', '4k', '60fps', 'cinematic', 'portrait mode', 'night mode', 'settings',
  'control center', 'volume button', 'action button', 'apple',
];

export const TIKTOK_TOPIC_KEYWORDS = [
  'tiktok', 'creator tools', 'creator search insights', 'analytics', 'for you', 'fyp',
  'tiktok academy', 'hashtag', 'trending', 'posting time', 'watch time',
];

export const TIKTOK_STUDIO_TOPIC_KEYWORDS = [
  'tiktok studio', 'studio upload', 'schedule post', 'desktop upload', 'web studio',
];

export const CAPCUT_TOPIC_KEYWORDS = ['capcut', 'edit', 'caption', 'template', 'export', 'trim', 'cut'];

export const BLACKMAGIC_TOPIC_KEYWORDS = [
  'blackmagic', 'bmd', 'manual iso', 'manual shutter', 'log profile', 'pro video',
];

/** Map detected topic buckets to equipment slugs for search scoping. */
export const EQUIPMENT_SCOPE_RULES: Array<{ slug: string; patterns: RegExp[]; keywords: string[] }> = [
  { slug: 'dji-osmo-mobile-8', patterns: [/\bosmo\b/i, /\bgimbal\b/i, /\bmimo\b/i], keywords: OSMO_TOPIC_KEYWORDS },
  { slug: 'hollyland-lark-m2', patterns: [/\blark\b/i, /\bhollyland\b/i, /\blav\b/i], keywords: LARK_TOPIC_KEYWORDS },
  { slug: 'apple-iphone-17-pro', patterns: [/\biphone\b/i, /camera control/i, /exposure lock/i, /focus lock/i], keywords: IPHONE_TOPIC_KEYWORDS },
  { slug: 'tiktok-studio', patterns: [/tiktok studio/i], keywords: TIKTOK_STUDIO_TOPIC_KEYWORDS },
  { slug: 'tiktok', patterns: [/\btiktok\b/i, /creator search insights/i, /creator tools/i], keywords: TIKTOK_TOPIC_KEYWORDS },
  { slug: 'capcut', patterns: [/\bcapcut\b/i], keywords: CAPCUT_TOPIC_KEYWORDS },
  { slug: 'blackmagic-camera', patterns: [/blackmagic/i, /\bbmd\b/i], keywords: BLACKMAGIC_TOPIC_KEYWORDS },
];

export const SOURCE_EXTENSIONS = ['.pdf', '.html', '.htm', '.mhtml'] as const;
