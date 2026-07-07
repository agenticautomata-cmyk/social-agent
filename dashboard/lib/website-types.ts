export type WebsiteDraftStatus = 'draft' | 'approved' | 'published' | 'rejected';

export type WebsiteMediaRecord = {
  id: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  mediaKind: 'image' | 'video';
  fileUrl: string;
  thumbnailUrl: string | null;
  uploadedBy: string;
  uploadedAt: string;
  aiCategory: string | null;
  aiCaption: string | null;
  aiAltText: string | null;
  aiContentType: string | null;
  aiSuggestedPlacement: string | null;
  aiMetadata: Record<string, unknown>;
};

export type WebsiteDraftRecord = {
  id: string;
  title: string;
  sectionId: string;
  sectionLabel: string | null;
  mediaItemId: string | null;
  caption: string | null;
  altText: string | null;
  headline: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  sortOrder: number;
  status: WebsiteDraftStatus;
  bensonReasoning: string | null;
  createdBy: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  media: {
    id: string;
    originalFilename: string;
    mimeType: string;
    mediaKind: string;
    fileUrl: string;
    thumbnailUrl: string | null;
    aiCategory: string | null;
    aiContentType: string | null;
    aiSuggestedPlacement: string | null;
  } | null;
};

export type WebsiteSectionRecord = {
  id: string;
  label: string;
  description: string | null;
  sortOrder: number;
  enabled: boolean;
  maxItems: number;
  sectionType: string;
};

export type WebsiteSettingsRecord = {
  id: string;
  siteTitle: string;
  siteTagline: string | null;
  heroHeadline: string | null;
  heroSubheadline: string | null;
  contactEmail: string | null;
  bookingHref: string | null;
  mediaKitHref: string | null;
  maxUploadBytes: number;
  updatedAt: string;
};

export function formatWebsiteFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function bytesToMegabytes(bytes: number): number {
  return Math.round(bytes / (1024 * 1024));
}

export function megabytesToBytes(mb: number): number {
  return Math.round(mb * 1024 * 1024);
}

export function draftStatusLabel(status: WebsiteDraftStatus): string {
  switch (status) {
    case 'draft':
      return 'Awaiting review';
    case 'approved':
      return 'Approved — ready to publish';
    case 'published':
      return 'Live on site';
    case 'rejected':
      return 'Rejected';
  }
}

export function draftStatusClass(status: WebsiteDraftStatus): string {
  switch (status) {
    case 'draft':
      return 'bg-amber-100 text-amber-900';
    case 'approved':
      return 'bg-emerald-100 text-emerald-900';
    case 'published':
      return 'bg-sky-100 text-sky-900';
    case 'rejected':
      return 'bg-rose-100 text-rose-900';
  }
}

export const WEBSITE_CATEGORY_OPTIONS = [
  'social',
  'food',
  'kc',
  'events',
  'sponsor',
  'lifestyle',
  'travel',
  'shopping',
  'personal',
] as const;

export const WEBSITE_CONTENT_TYPE_OPTIONS = [
  'screenshot',
  'food',
  'thrift',
  'events',
  'kc',
  'sponsor',
  'lifestyle',
  'travel',
  'shopping',
  'personal',
] as const;

export const WEBSITE_PLACEMENT_OPTIONS = [
  'homepage_featured',
  'latest_posts',
  'kc_finds',
  'sponsor_highlights',
  'media_kit',
  'gallery',
] as const;

export type DraftEditFields = {
  title: string;
  sectionId: string;
  caption: string;
  altText: string;
  headline: string;
  ctaLabel: string;
  ctaHref: string;
  category: string;
  contentType: string;
  suggestedPlacement: string;
};

export function draftEditFromRecord(draft: WebsiteDraftRecord): DraftEditFields {
  return {
    title: draft.title,
    sectionId: draft.sectionId,
    caption: draft.caption ?? '',
    altText: draft.altText ?? '',
    headline: draft.headline ?? '',
    ctaLabel: draft.ctaLabel ?? '',
    ctaHref: draft.ctaHref ?? '',
    category: draft.media?.aiCategory ?? 'social',
    contentType: draft.media?.aiContentType ?? 'lifestyle',
    suggestedPlacement: placementToUiLabel(draft.media?.aiSuggestedPlacement),
  };
}

/** Map internal placement values to UI-friendly labels. */
export function placementToUiLabel(placement: string | null | undefined): string {
  const aliases: Record<string, string> = {
    latest_content: 'latest_posts',
    sponsor_highlight: 'sponsor_highlights',
    gallery: 'kc_finds',
    about: 'homepage_featured',
  };
  if (!placement) return 'latest_posts';
  return aliases[placement] ?? placement;
}

export function draftHasRequiredFields(edit: DraftEditFields): boolean {
  return Boolean(edit.title.trim() && edit.caption.trim() && edit.altText.trim());
}
