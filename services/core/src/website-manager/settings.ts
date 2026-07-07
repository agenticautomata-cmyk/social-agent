import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { websiteSettings } from '../schema.js';
import { DEFAULT_MAX_UPLOAD_BYTES } from './constants.js';

const MIN_UPLOAD_BYTES = 1 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

function normalizeMaxUploadBytes(value: number | null | undefined): number {
  const bytes = Number(value ?? DEFAULT_MAX_UPLOAD_BYTES);
  if (!Number.isFinite(bytes) || bytes < MIN_UPLOAD_BYTES) return DEFAULT_MAX_UPLOAD_BYTES;
  if (bytes > MAX_UPLOAD_BYTES) return MAX_UPLOAD_BYTES;
  return Math.round(bytes);
}

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

function rowToRecord(row: typeof websiteSettings.$inferSelect): WebsiteSettingsRecord {
  return {
    id: row.id,
    siteTitle: row.siteTitle,
    siteTagline: row.siteTagline,
    heroHeadline: row.heroHeadline,
    heroSubheadline: row.heroSubheadline,
    contactEmail: row.contactEmail,
    bookingHref: row.bookingHref,
    mediaKitHref: row.mediaKitHref,
    maxUploadBytes: normalizeMaxUploadBytes(row.maxUploadBytes),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getWebsiteSettings(): Promise<WebsiteSettingsRecord> {
  const row = await db.query.websiteSettings.findFirst({
    where: eq(websiteSettings.id, 'default'),
  });
  if (!row) {
    const [created] = await db
      .insert(websiteSettings)
      .values({ id: 'default' })
      .returning();
    return rowToRecord(created!);
  }
  return rowToRecord(row);
}

export async function updateWebsiteSettings(
  patch: Partial<Omit<WebsiteSettingsRecord, 'id' | 'updatedAt'>>,
): Promise<WebsiteSettingsRecord> {
  const now = new Date();
  const updates: Partial<typeof websiteSettings.$inferInsert> = { updatedAt: now };

  if (patch.siteTitle !== undefined) updates.siteTitle = patch.siteTitle;
  if (patch.siteTagline !== undefined) updates.siteTagline = patch.siteTagline;
  if (patch.heroHeadline !== undefined) updates.heroHeadline = patch.heroHeadline;
  if (patch.heroSubheadline !== undefined) updates.heroSubheadline = patch.heroSubheadline;
  if (patch.contactEmail !== undefined) updates.contactEmail = patch.contactEmail;
  if (patch.bookingHref !== undefined) updates.bookingHref = patch.bookingHref;
  if (patch.mediaKitHref !== undefined) updates.mediaKitHref = patch.mediaKitHref;
  if (patch.maxUploadBytes !== undefined) updates.maxUploadBytes = patch.maxUploadBytes;

  const [row] = await db
    .update(websiteSettings)
    .set(updates)
    .where(eq(websiteSettings.id, 'default'))
    .returning();
  return rowToRecord(row!);
}
