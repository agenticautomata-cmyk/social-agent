export const WEBSITE_CONTENT_TYPES = [
  'food',
  'thrift',
  'events',
  'kc',
  'sponsor',
  'lifestyle',
  'travel',
  'shopping',
  'personal',
  'screenshot',
] as const;

export type WebsiteContentType = (typeof WEBSITE_CONTENT_TYPES)[number];

export const WEBSITE_PLACEMENTS = [
  'homepage_featured',
  'gallery',
  'latest_content',
  'sponsor_highlight',
  'media_kit',
  'about',
] as const;

export type WebsitePlacement = (typeof WEBSITE_PLACEMENTS)[number];

export const WEBSITE_DRAFT_STATUSES = ['draft', 'approved', 'published', 'rejected'] as const;
export type WebsiteDraftStatus = (typeof WEBSITE_DRAFT_STATUSES)[number];

export const WEBSITE_SECTION_IDS = [
  'homepage_hero',
  'featured_content',
  'latest_posts',
  'kc_finds',
  'sponsor_highlights',
  'media_kit_cta',
  'contact_cta',
] as const;

export type WebsiteSectionId = (typeof WEBSITE_SECTION_IDS)[number];

/** Maps AI placement suggestion → default website section */
export const PLACEMENT_TO_SECTION: Record<WebsitePlacement, WebsiteSectionId> = {
  homepage_featured: 'homepage_hero',
  gallery: 'kc_finds',
  latest_content: 'latest_posts',
  sponsor_highlight: 'sponsor_highlights',
  media_kit: 'media_kit_cta',
  about: 'featured_content',
};

export const PLACEMENT_TO_SECTION_ALT: Partial<Record<WebsiteContentType, WebsiteSectionId>> = {
  kc: 'kc_finds',
  sponsor: 'sponsor_highlights',
  food: 'latest_posts',
  thrift: 'kc_finds',
  events: 'featured_content',
  travel: 'featured_content',
  shopping: 'kc_finds',
  lifestyle: 'featured_content',
  personal: 'featured_content',
  screenshot: 'latest_posts',
};

export const WEBSITE_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const;
export const WEBSITE_VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm'] as const;

export const DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
