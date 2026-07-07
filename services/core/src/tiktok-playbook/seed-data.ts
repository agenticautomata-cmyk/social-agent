import { asc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { playbookQuickActions, playbookChecklists } from '../schema.js';
import type { PlaybookCapability } from './constants.js';

type QuickActionSeed = {
  slug: string;
  label: string;
  prompt: string;
  capability: PlaybookCapability;
  sourceSlug?: string;
  sortOrder: number;
};

export const PLAYBOOK_QUICK_ACTION_SEEDS: QuickActionSeed[] = [
  {
    slug: 'improve-hook',
    label: 'Improve this hook',
    prompt:
      'Improve the hook for this TikTok idea. Give me 3 stronger opening lines and why each works. Idea: ',
    capability: 'improve-hook',
    sortOrder: 1,
  },
  {
    slug: 'rewrite-caption-kellie',
    label: 'Rewrite caption like Kellie',
    prompt:
      'Rewrite this TikTok caption in Kellie\'s voice — warm, KC-local, conversational, not salesy. Caption: ',
    capability: 'rewrite-caption',
    sortOrder: 2,
  },
  {
    slug: 'make-searchable',
    label: 'Make this more searchable',
    prompt:
      'Make this TikTok topic more searchable on TikTok. Suggest SEO keywords, on-screen text, and caption phrasing people actually search. Topic: ',
    capability: 'tiktok-seo',
    sourceSlug: 'creator-search-insights',
    sortOrder: 3,
  },
  {
    slug: 'turn-into-script',
    label: 'Turn this into a TikTok script',
    prompt:
      'Turn this into a short TikTok script with hook, beats, and CTA. Keep it filmable solo with iPhone + mic. Idea: ',
    capability: 'script',
    sortOrder: 4,
  },
  {
    slug: 'analyze-screenshot',
    label: 'Analyze this screenshot',
    prompt:
      'Analyze this TikTok screenshot — hook, caption, hashtags, and what Kellie should change before posting.',
    capability: 'analyze-screenshot',
    sortOrder: 5,
  },
  {
    slug: 'what-post-today',
    label: 'What should Kellie post today?',
    prompt:
      'What should Kellie post on TikTok today? Use her analytics, top categories, and any fresh KC angles. One primary pick + one backup.',
    capability: 'post-today',
    sortOrder: 6,
  },
  {
    slug: 'explain-analytics',
    label: 'Explain these analytics',
    prompt:
      'Explain my TikTok analytics in plain language — watch time, retention, search, and what to do next.',
    capability: 'studio-metrics',
    sourceSlug: 'tiktok-studio-help',
    sortOrder: 7,
  },
  {
    slug: 'sponsor-video-angle',
    label: 'Build sponsor video angle',
    prompt:
      'Turn this sponsor offer into a TikTok content angle Kellie can film authentically. Include hook, proof points, and disclosure reminder. Offer: ',
    capability: 'sponsor-angle',
    sortOrder: 8,
  },
  {
    slug: 'five-ideas-from-trend',
    label: 'Make 5 content ideas from this trend',
    prompt:
      'Make 5 TikTok content ideas for Kellie from this trend or search topic. Tie to KC where it fits. Trend/topic: ',
    capability: 'content-ideas',
    sourceSlug: 'creator-search-insights',
    sortOrder: 9,
  },
  {
    slug: 'before-posting-checklist',
    label: 'Create a TikTok checklist',
    prompt: 'Give Kellie a before-posting checklist for her next TikTok.',
    capability: 'before-posting',
    sortOrder: 10,
  },
];

const CHECKLIST_SEEDS = [
  {
    slug: 'before-posting',
    title: 'Before posting checklist',
    capability: 'before-posting' as PlaybookCapability,
    description: 'Quick pass before Kellie hits Post.',
    steps: [
      { title: 'Hook in first 1–2 seconds', detail: 'Face or food/product visible immediately — no slow intro.' },
      { title: 'Caption hook line', detail: 'First line works standalone in Search and For You.' },
      { title: 'Search-friendly phrasing', detail: 'Include how people search (place name, dish, event) without keyword stuffing.' },
      { title: '3–5 hashtags max', detail: 'Mix niche KC/local + topic tags; skip unrelated viral tags.' },
      { title: 'Audio check', detail: 'Voice clear; music not drowning speech.' },
      { title: 'Cover frame', detail: 'Pick a readable cover — face or hero product.' },
      { title: 'Disclosure if sponsored', detail: 'Verbal + on-screen if paid partnership.' },
      { title: 'Post time', detail: 'Prefer Kellie\'s best-performing slot when possible.' },
    ],
  },
];

export async function seedPlaybookQuickActions(): Promise<void> {
  for (const seed of PLAYBOOK_QUICK_ACTION_SEEDS) {
    const existing = await db.query.playbookQuickActions.findFirst({
      where: eq(playbookQuickActions.slug, seed.slug),
    });
    const values = {
      label: seed.label,
      prompt: seed.prompt,
      capability: seed.capability,
      sourceSlug: seed.sourceSlug ?? null,
      sortOrder: seed.sortOrder,
    };
    if (existing) {
      await db.update(playbookQuickActions).set(values).where(eq(playbookQuickActions.id, existing.id));
    } else {
      await db.insert(playbookQuickActions).values({ slug: seed.slug, ...values });
    }
  }
}

export async function seedPlaybookChecklists(): Promise<void> {
  for (const seed of CHECKLIST_SEEDS) {
    const existing = await db.query.playbookChecklists.findFirst({
      where: eq(playbookChecklists.slug, seed.slug),
    });
    const values = {
      title: seed.title,
      capability: seed.capability,
      description: seed.description,
      steps: seed.steps,
    };
    if (existing) {
      await db.update(playbookChecklists).set({ ...values, updatedAt: new Date() }).where(eq(playbookChecklists.id, existing.id));
    } else {
      await db.insert(playbookChecklists).values({ slug: seed.slug, ...values });
    }
  }
}

export async function listPlaybookQuickActionsFromDb() {
  return db
    .select()
    .from(playbookQuickActions)
    .orderBy(asc(playbookQuickActions.sortOrder));
}