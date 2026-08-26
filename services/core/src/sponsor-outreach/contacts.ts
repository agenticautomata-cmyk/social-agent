import { desc, eq, isNull, or } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems, sources, sponsorContacts } from '../schema.js';
import { computeFollowUpDueAt } from './follow-up-dates.js';
import type { SponsorContactStatus } from './constants.js';
import { canonicalGroupKey } from './canonicalize.js';
import { normalizeInventoryItem, type InventoryItem } from '../inventory/normalize.js';
import {
  evaluateSponsorBusinessIdentity,
  selectSponsorIdentityForWrite,
  SponsorBusinessIdentityRejectedError,
  isActionableSponsorStatus,
} from './entity-identity.js';

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
  contactVerificationStatus: string;
  /** Non-null once this row has been identified as a duplicate — points at the primary contact for the business. */
  mergedIntoId: string | null;
  /** Shared across every row in a duplicate group, including the primary (points at the primary's own id). */
  canonicalBusinessId: string | null;
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
    contactVerificationStatus: row.contactVerificationStatus,
    mergedIntoId: row.mergedIntoId,
    canonicalBusinessId: row.canonicalBusinessId,
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

/**
 * By default excludes rows marked as duplicates (mergedIntoId set) so CRM/pitch views show
 * one active card per real-world business — see canonicalize.ts and dedupe-sponsor-contacts.ts.
 */
export async function listSponsorContacts(
  opts: { includeMerged?: boolean } = {},
): Promise<SponsorContactRecord[]> {
  const rows = await db
    .select()
    .from(sponsorContacts)
    .where(opts.includeMerged ? undefined : isNull(sponsorContacts.mergedIntoId))
    .orderBy(desc(sponsorContacts.updatedAt));
  return rows.map(rowToRecord);
}

export async function getSponsorContact(id: string): Promise<SponsorContactRecord | null> {
  const rows = await db.select().from(sponsorContacts).where(eq(sponsorContacts.id, id)).limit(1);
  return rows[0] ? rowToRecord(rows[0]) : null;
}

/** Every contact row that shares a canonical business identity with `contactId` (including itself). */
export async function getBusinessGroupContacts(contactId: string): Promise<SponsorContactRecord[]> {
  const self = await getSponsorContact(contactId);
  if (!self) return [];
  const groupId = self.canonicalBusinessId ?? self.id;
  const rows = await db
    .select()
    .from(sponsorContacts)
    .where(or(eq(sponsorContacts.canonicalBusinessId, groupId), eq(sponsorContacts.id, groupId)));
  return rows.map(rowToRecord);
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
  operatorProvided?: boolean;
  sourceUrl?: string | null;
  senderEmail?: string | null;
  senderName?: string | null;
  subject?: string | null;
  pageTitle?: string | null;
  linkedPartnershipBrand?: string | null;
}): Promise<SponsorContactRecord> {
  const identity = evaluateSponsorBusinessIdentity({
    businessName: input.businessName,
    contactName: input.contactName,
    email: input.email,
    website: input.website,
    senderEmail: input.senderEmail ?? input.email,
    senderName: input.senderName,
    subject: input.subject,
    pageTitle: input.pageTitle,
    operatorProvided: input.operatorProvided,
    sourceUrl: input.sourceUrl ?? input.website,
    linkedPartnershipBrand: input.linkedPartnershipBrand,
  });
  if (!identity.ok) {
    throw new SponsorBusinessIdentityRejectedError(identity.reason, identity.businessName);
  }

  const [row] = await db
    .insert(sponsorContacts)
    .values({
      businessName: identity.businessName,
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

  // Avoid creating yet another duplicate row for a business we already have a live/active
  // contact for (e.g. a chain with many location/offer pages) — reuse the existing primary
  // contact instead so Pitches shows one active card per business going forward.
  const identity = evaluateSponsorBusinessIdentity({
    businessName: item.businessName,
    pageTitle: item.title,
    sourceUrl: item.sourceUrl,
    website: item.sourceUrl,
  });
  if (!identity.ok) {
    throw new SponsorBusinessIdentityRejectedError(identity.reason, identity.businessName ?? item.businessName ?? item.title);
  }

  const businessName = identity.businessName;
  const groupKey = canonicalGroupKey({ businessName, website: item.sourceUrl ?? null });
  const activeContacts = await listSponsorContacts();
  const duplicateOfExisting = activeContacts.find(
    (c) => canonicalGroupKey({ businessName: c.businessName, website: c.website }) === groupKey,
  );
  if (duplicateOfExisting) {
    return {
      contact: duplicateOfExisting,
      created: false,
      opportunity: item,
    };
  }

  const contact = await createSponsorContact({
    businessName,
    website: item.sourceUrl,
    category: item.category,
    notes: item.whyItMatters,
    sponsorFitScore: computeSponsorFitScore(item),
    sourceOpportunityId: contentItemId,
    status: 'lead',
    sourceUrl: item.sourceUrl,
    pageTitle: item.title,
  });

  return { contact, created: true, opportunity: item };
}

export async function updateSponsorContact(
  id: string,
  update: SponsorContactUpdate,
): Promise<SponsorContactRecord | null> {
  const current = await getSponsorContact(id);
  if (!current) return null;

  const now = new Date();
  const patch: Partial<typeof sponsorContacts.$inferInsert> = { updatedAt: now };

  if (update.businessName !== undefined) {
    const selected = selectSponsorIdentityForWrite({
      businessName: update.businessName,
      existingBusinessName: current.businessName,
      website: update.website !== undefined ? update.website : current.website,
      email: update.email !== undefined ? update.email : current.email,
      sourceUrl: update.website !== undefined ? update.website : current.website,
    });
    if (selected.writeBusinessName && selected.businessName) {
      patch.businessName = selected.businessName;
    }
  }
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
  if (update.status !== undefined) {
    const identity = evaluateSponsorBusinessIdentity({
      businessName: (patch.businessName as string | undefined) ?? current.businessName,
      operatorProvided: true,
      website: (patch.website as string | null | undefined) ?? current.website,
      email: (patch.email as string | null | undefined) ?? current.email,
    });
    if (isActionableSponsorStatus(update.status) && !identity.ok) {
      // Do not promote junk identities into outreach-ready states.
    } else {
      patch.status = update.status;
    }
  }
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
