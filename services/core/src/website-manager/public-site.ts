import { asc, eq, isNull } from 'drizzle-orm';
import { db } from '../db.js';
import { websiteMediaItems, websitePublishedItems, websiteSections } from '../schema.js';
import { getWebsiteSettings } from './settings.js';
import { buildWebsiteMediaFileUrl } from './storage.js';
import { isMediaPubliclyVisible } from './media.js';

export type PublicWebsiteItem = {
  id: string;
  sectionId: string;
  caption: string | null;
  altText: string | null;
  headline: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  sortOrder: number;
  publishedAt: string;
  media: {
    kind: 'image' | 'video';
    url: string | null;
    thumbnailUrl: string | null;
    mimeType: string | null;
  } | null;
};

export type PublicWebsiteSection = {
  id: string;
  label: string;
  description: string | null;
  sectionType: string;
  sortOrder: number;
  items: PublicWebsiteItem[];
};

export type PublicWebsitePayload = {
  generatedAt: string;
  settings: Awaited<ReturnType<typeof getWebsiteSettings>>;
  sections: PublicWebsiteSection[];
};

export async function buildPublicWebsitePayload(): Promise<PublicWebsitePayload> {
  const [settings, sections, publishedRows] = await Promise.all([
    getWebsiteSettings(),
    db
      .select()
      .from(websiteSections)
      .where(eq(websiteSections.enabled, true))
      .orderBy(asc(websiteSections.sortOrder)),
    db
      .select({
        published: websitePublishedItems,
        media: websiteMediaItems,
      })
      .from(websitePublishedItems)
      .leftJoin(websiteMediaItems, eq(websitePublishedItems.mediaItemId, websiteMediaItems.id))
      .where(isNull(websitePublishedItems.unpublishedAt))
      .orderBy(asc(websitePublishedItems.sectionId), asc(websitePublishedItems.sortOrder)),
  ]);

  const sectionMap = new Map<string, PublicWebsiteSection>();
  for (const section of sections) {
    sectionMap.set(section.id, {
      id: section.id,
      label: section.label,
      description: section.description,
      sectionType: section.sectionType,
      sortOrder: section.sortOrder,
      items: [],
    });
  }

  for (const { published: row, media: m } of publishedRows) {
    const bucket = sectionMap.get(row.sectionId);
    if (!bucket) continue;
    bucket.items.push({
      id: row.id,
      sectionId: row.sectionId,
      caption: row.caption,
      altText: row.altText,
      headline: row.headline,
      ctaLabel: row.ctaLabel,
      ctaHref: row.ctaHref,
      sortOrder: row.sortOrder,
      publishedAt: row.publishedAt.toISOString(),
      media: m
        ? {
            kind: m.mediaKind as 'image' | 'video',
            url:
              m.mediaKind === 'video'
                ? null
                : buildWebsiteMediaFileUrl(m.storageFilename, true),
            thumbnailUrl: m.thumbnailFilename
              ? buildWebsiteMediaFileUrl(m.thumbnailFilename, true)
              : m.mediaKind === 'image'
                ? buildWebsiteMediaFileUrl(m.storageFilename, true)
                : null,
            mimeType: m.mimeType,
          }
        : null,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    settings,
    sections: [...sectionMap.values()].filter(
      (s) => s.items.length > 0 || s.sectionType === 'cta',
    ),
  };
}

export async function canServePublicMedia(storageFilename: string): Promise<boolean> {
  return isMediaPubliclyVisible(storageFilename);
}
