import { desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems, sources, sponsorContacts } from '../schema.js';
import { computeFollowUpDueAt } from './follow-up-dates.js';
import type { SponsorContactStatus } from './constants.js';
import { normalizeInventoryItem, type InventoryItem } from '../inventory/normalize.js';

export type SponsorContactRecord = {
  id: string;
  businessName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  tiktok: string | null;
  category: string | null;
  notes: string | null;
  sponsorFitScore: number | null;
  sourceOpportunityId: string | null;
  status: SponsorContactStatus;
  lastContactedAt: string | null;
  nextFollowUpAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SponsorContactUpdate = Partial<{
  businessName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  tiktok: string | null;
  category: string | null;
  notes: string | null;
  sponsorFitScore: number | null;
  status: SponsorContactStatus;
  lastContactedAt: string | null;
  nextFollowUpAt: string | null;
}>;

function rowToRecord(row: typeof sponsorContacts.$inferSelect): SponsorContactRecord {
  return {
    id: row.id,
    businessName: row.businessName,
    contactName: row.contactName,
    email: row.email,
    phone: row.phone,
    website: row.website,
    instagram: row.instagram,
    tiktok: row.tiktok,
    category: row.category,
    notes: row.notes,
    sponsorFitScore: row.sponsorFitScore != null ? Number(row.sponsorFitScore) : null,
    sourceOpportunityId: row.sourceOpportunityId,
    status: row.status,
    lastContactedAt: row.lastContactedAt?.toISOString() ?? null,
    nextFollowUpAt: row.nextFollowUpAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function computeSponsorFitScore(item: InventoryItem): number {
  let score = 0;
  if (item.flags.sponsorFriendly) score += 35;
  if (item.businessName) score += 25;
  if (item.flags.luxury) score += 15;
  if (item.flags.businessOpening) score += 15;
  if (item.flags.dining) score += 10;
  if (item.flags.estateSale) score += 10;
  if (item.flags.dateNight) score += 8;
  if (item.flags.reddit) score -= 20;
  score = Math.max(0, Math.min(100, score));
  return Math.round((score / 100) * 1000) / 1000;
}

export async function loadInventoryItemById(contentItemId: string): Promise<InventoryItem | null> {
  const rows = await db
    .select({
      item: contentItems,
      sourceName: sources.name,
      sourceType: sources.type,
    })
    .from(contentItems)
    .leftJoin(sources, eq(sources.id, contentItems.sourceId))
    .where(eq(contentItems.id, contentItemId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return normalizeInventoryItem(row.item, row.sourceName, row.sourceType);
}

export async function listSponsorContacts(): Promise<SponsorContactRecord[]> {
  const rows = await db
    .select()
    .from(sponsorContacts)
    .orderBy(desc(sponsorContacts.updatedAt));
  return rows.map(rowToRecord);
}

export async function getSponsorContact(id: string): Promise<SponsorContactRecord | null> {
  const rows = await db.select().from(sponsorContacts).where(eq(sponsorContacts.id, id)).limit(1);
  return rows[0] ? rowToRecord(rows[0]) : null;
}

export async function getSponsorContactBySourceOpportunity(
  contentItemId: string,
): Promise<SponsorContactRecord | null> {
  const rows = await db
    .select()
    .from(sponsorContacts)
    .where(eq(sponsorContacts.sourceOpportunityId, contentItemId))
    .limit(1);
  return rows[0] ? rowToRecord(rows[0]) : null;
}

export async function createSponsorContact(input: {
  businessName: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
  category?: string | null;
  notes?: string | null;
  sponsorFitScore?: number | null;
  sourceOpportunityId?: string | null;
  status?: SponsorContactStatus;
}): Promise<SponsorContactRecord> {
  const [row] = await db
    .insert(sponsorContacts)
    .values({
      businessName: input.businessName,
      contactName: input.contactName ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      website: input.website ?? null,
      instagram: input.instagram ?? null,
      tiktok: input.tiktok ?? null,
      category: input.category ?? null,
      notes: input.notes ?? null,
      sponsorFitScore:
        input.sponsorFitScore != null ? String(input.sponsorFitScore) : null,
      sourceOpportunityId: input.sourceOpportunityId ?? null,
      status: input.status ?? 'lead',
    })
    .returning();
  return rowToRecord(row!);
}

export async function createSponsorFromOpportunity(
  contentItemId: string,
): Promise<{ contact: SponsorContactRecord; created: boolean; opportunity: InventoryItem }> {
  const item = await loadInventoryItemById(contentItemId);
  if (!item) {
    throw new Error('Opportunity not found');
  }

  const existing = await db
    .select()
    .from(sponsorContacts)
    .where(eq(sponsorContacts.sourceOpportunityId, contentItemId))
    .limit(1);

  if (existing[0]) {
    return {
      contact: rowToRecord(existing[0]),
      created: false,
      opportunity: item,
    };
  }

  const contact = await createSponsorContact({
    businessName: item.businessName ?? item.title,
    website: item.sourceUrl,
    category: item.category,
    notes: item.whyItMatters,
    sponsorFitScore: computeSponsorFitScore(item),
    sourceOpportunityId: contentItemId,
    status: 'lead',
  });

  return { contact, created: true, opportunity: item };
}

export async function updateSponsorContact(
  id: string,
  update: SponsorContactUpdate,
): Promise<SponsorContactRecord | null> {
  const now = new Date();
  const patch: Partial<typeof sponsorContacts.$inferInsert> = { updatedAt: now };

  if (update.businessName !== undefined) patch.businessName = update.businessName;
  if (update.contactName !== undefined) patch.contactName = update.contactName;
  if (update.email !== undefined) patch.email = update.email;
  if (update.phone !== undefined) patch.phone = update.phone;
  if (update.website !== undefined) patch.website = update.website;
  if (update.instagram !== undefined) patch.instagram = update.instagram;
  if (update.tiktok !== undefined) patch.tiktok = update.tiktok;
  if (update.category !== undefined) patch.category = update.category;
  if (update.notes !== undefined) patch.notes = update.notes;
  if (update.sponsorFitScore !== undefined) {
    patch.sponsorFitScore =
      update.sponsorFitScore != null ? String(update.sponsorFitScore) : null;
  }
  if (update.status !== undefined) patch.status = update.status;
  if (update.lastContactedAt !== undefined) {
    patch.lastContactedAt = update.lastContactedAt ? new Date(update.lastContactedAt) : null;
  }
  if (update.nextFollowUpAt !== undefined) {
    patch.nextFollowUpAt = update.nextFollowUpAt ? new Date(update.nextFollowUpAt) : null;
  }

  const [row] = await db
    .update(sponsorContacts)
    .set(patch)
    .where(eq(sponsorContacts.id, id))
    .returning();

  return row ? rowToRecord(row) : null;
}

export async function markContactSent(contactId: string, at = new Date()): Promise<void> {
  const followUpAt = computeFollowUpDueAt(at);
  await db
    .update(sponsorContacts)
    .set({
      status: 'follow_up_needed',
      lastContactedAt: at,
      nextFollowUpAt: followUpAt,
      updatedAt: at,
    })
    .where(eq(sponsorContacts.id, contactId));
}
