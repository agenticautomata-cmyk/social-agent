export type EquipmentItemRecord = {
  id: string;
  slug: string;
  name: string;
  brand: string;
  model: string;
  category: string;
  owner: string;
  manualFilePath: string | null;
  notes: string | null;
  manual: {
    id: string;
    title: string;
    chunkCount: number;
    pageCount: number | null;
    ingestedAt: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type EquipmentManualSummary = {
  id: string;
  equipmentId: string;
  equipmentName: string;
  equipmentSlug: string;
  title: string;
  originalFilename: string;
  chunkCount: number;
  pageCount: number | null;
  ingestedAt: string | null;
  sourcePath: string | null;
};

export type EquipmentChecklistRecord = {
  id: string;
  slug: string;
  title: string;
  shootType: string;
  description: string | null;
  gearToBring: string[];
  steps: Array<{ title: string; detail: string }>;
  commonMistakes: string[];
  recoverySteps: string[];
  updatedAt: string;
};

export type EquipmentTroubleshootingRecord = {
  id: string;
  slug: string;
  label: string;
  equipmentSlug: string | null;
  quickPrompt: string;
  symptoms: string[];
  steps: Array<{ title: string; detail: string }>;
  sortOrder: number;
};

export type EquipmentAskResponse = {
  answer: string;
  sources: Array<{
    manualTitle: string;
    pageNumber: number | null;
    sectionTitle: string | null;
    equipmentName: string;
  }>;
  referenceVideos?: Array<{
    title: string;
    sourceChannel: string;
    referenceUrl: string;
    referenceKind: 'youtube' | 'web';
    equipmentName: string | null;
  }>;
  groundedInManual: boolean;
  usedGeneralKnowledge: boolean;
  equipmentScope: string[];
};

export type EquipmentReferenceVideoRecord = {
  id: string;
  slug: string;
  title: string;
  equipmentSlug: string | null;
  equipmentName: string | null;
  sourceChannel: string;
  referenceUrl: string;
  referenceKind: 'youtube' | 'web';
  youtubeVideoId: string | null;
  topicTags: string[];
  notes: string | null;
  priority: number;
  watchedByKellie: boolean;
  usefulForChecklist: boolean;
  usefulForTroubleshooting: boolean;
  usefulForTraining: boolean;
};

export type HelpNowButton = {
  label: string;
  prompt: string;
  equipmentSlug?: string;
  shootType?: string;
};

export const HELP_KELLIE_NOW: HelpNowButton[] = [
  {
    label: "My gimbal won't connect",
    prompt: "My DJI Osmo Mobile 8 won't connect to DJI Mimo. Step-by-step fix.",
    equipmentSlug: 'dji-osmo-mobile-8',
  },
  {
    label: 'My mic has no sound',
    prompt: 'My Hollyland LARK M2 has no audio. Troubleshoot step by step.',
    equipmentSlug: 'hollyland-lark-m2',
  },
  {
    label: 'Audio sounds bad',
    prompt: 'My LARK M2 audio sounds muffled or noisy. How do I fix it?',
    equipmentSlug: 'hollyland-lark-m2',
  },
  {
    label: 'Gimbal is shaking',
    prompt: 'My Osmo Mobile 8 is shaking while filming. How do I fix balance and follow mode?',
    equipmentSlug: 'dji-osmo-mobile-8',
  },
  {
    label: 'How do I track myself?',
    prompt: 'How do I enable subject tracking on Osmo Mobile 8?',
    equipmentSlug: 'dji-osmo-mobile-8',
  },
  {
    label: 'Switch portrait/landscape?',
    prompt: 'How do I switch between portrait and landscape on Osmo Mobile 8?',
    equipmentSlug: 'dji-osmo-mobile-8',
  },
  {
    label: 'What do these lights mean?',
    prompt: 'What do the indicator lights mean on Hollyland LARK M2 and DJI Osmo Mobile 8?',
  },
  {
    label: 'Setup for restaurant video',
    prompt: 'Give me gimbal and LARK M2 setup for a restaurant TikTok food review.',
    shootType: 'food-review-restaurant',
  },
  {
    label: 'Setup for walking store video',
    prompt: 'Setup my Osmo and LARK for a walking thrift store TikTok.',
    shootType: 'store-thrift-walkthrough',
  },
  {
    label: 'Setup for sponsor/product review',
    prompt: 'Setup gear for a sponsor product review TikTok.',
    shootType: 'sponsor-product-video',
  },
  {
    label: 'Best iPhone TikTok settings',
    prompt: 'Best iPhone 17 Pro camera settings for TikTok — resolution, HDR, and mic.',
    equipmentSlug: 'apple-iphone-17-pro',
  },
  {
    label: 'Use Camera Control',
    prompt: 'How do I use Camera Control on iPhone 17 Pro for TikTok?',
    equipmentSlug: 'apple-iphone-17-pro',
  },
  {
    label: 'Lock focus & exposure',
    prompt: 'How do I lock focus and exposure on iPhone while filming?',
    equipmentSlug: 'apple-iphone-17-pro',
  },
  {
    label: 'Creator Search Insights',
    prompt: 'How do I use TikTok Creator Search Insights?',
    equipmentSlug: 'tiktok',
  },
  {
    label: 'Read TikTok analytics',
    prompt: 'Help me interpret my TikTok analytics — watch time and retention.',
    equipmentSlug: 'tiktok',
  },
  {
    label: 'CapCut quick edit',
    prompt: 'Fast CapCut workflow for a TikTok talking-head clip.',
    equipmentSlug: 'capcut',
  },
  {
    label: 'Blackmagic vs Camera app',
    prompt: 'When should I use Blackmagic Camera instead of the iPhone Camera app?',
    equipmentSlug: 'blackmagic-camera',
  },
  {
    label: 'iPhone TikTok setup',
    prompt: 'Walk me through iPhone 17 Pro TikTok camera setup before filming.',
    shootType: 'iphone-17-pro-tiktok-setup',
  },
  {
    label: 'Low-light recording',
    prompt: 'How do I set up iPhone and mic for low-light TikTok recording?',
    shootType: 'low-light-recording',
  },
  {
    label: 'Talking-head setup',
    prompt: 'Setup iPhone and LARK for a sit-down TikTok talking-head video.',
    shootType: 'talking-head-recording',
  },
  {
    label: 'TikTok Studio workflow',
    prompt: 'Walk me through TikTok Studio workflow for uploading and reviewing analytics.',
    equipmentSlug: 'tiktok-studio',
  },
];
