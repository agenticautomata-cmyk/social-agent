import { and, eq, or } from 'drizzle-orm';
import { db } from '../db.js';
import {
  discoveryEmailMessages,
  inventoryEvidence,
  newsletterSources,
  type NewInventoryEvidence,
} from '../schema.js';
import { rootDomain } from '../discovery-subscriptions/extract.js';
import { senderDomainFromEmail } from './classify.js';
import type { NewsletterCategory } from './types.js';

export type NewsletterSourceRow = typeof newsletterSources.$inferSelect;

export function newsletterSourceMatchesSender(
  source: Pick<NewsletterSourceRow, 'status' | 'senderEmail' | 'senderDomain'>,
  senderEmail: string | null | undefined,
): boolean {
  if (source.status !== 'enabled') return false;
  const email = senderEmail?.trim().toLowerCase() ?? '';
  if (email && source.senderEmail?.trim().toLowerCase() === email) return true;
  const domain = senderDomainFromEmail(senderEmail);
  if (!domain) return false;
  const root = rootDomain(domain) || domain;
  const stored = source.senderDomain.trim().toLowerCase();
  return stored === domain || stored === root;
}

export async function findEnabledNewsletterSourceForSender(
  senderEmail?: string | null,
): Promise<NewsletterSourceRow | null> {
  const email = senderEmail?.trim().toLowerCase() ?? '';
  const domain = senderDomainFromEmail(senderEmail);
  const root = domain ? rootDomain(domain) || domain : null;
  const domainClauses = [domain, root].filter((value, index, all): value is string => {
    return Boolean(value) && all.indexOf(value) === index;
  });

  if (!email && domainClauses.length === 0) return null;

  const rows = await db.query.newsletterSources.findMany({
    where: and(
      eq(newsletterSources.status, 'enabled'),
      or(
        ...(email ? [eq(newsletterSources.senderEmail, email)] : []),
        ...domainClauses.map((d) => eq(newsletterSources.senderDomain, d)),
      ),
    ),
    limit: 10,
  });

  return rows.find((row) => newsletterSourceMatchesSender(row, senderEmail)) ?? null;
}

export async function upsertNewsletterSource(input: {
  senderEmail: string | null;
  senderDomain: string;
  senderName: string | null;
  category: NewsletterCategory;
  discoverySubscriptionId?: string | null;
}): Promise<NewsletterSourceRow> {
  const domain = rootDomain(input.senderDomain) || input.senderDomain;
  const existing = await db.query.newsletterSources.findFirst({
    where: eq(newsletterSources.senderDomain, domain),
  });

  const now = new Date();
  if (existing) {
    const [updated] = await db
      .update(newsletterSources)
      .set({
        senderEmail: input.senderEmail ?? existing.senderEmail,
        senderName: input.senderName ?? existing.senderName,
        category: input.category,
        discoverySubscriptionId: input.discoverySubscriptionId ?? existing.discoverySubscriptionId,
        lastEmailReceivedAt: now,
        updatedAt: now,
        status: existing.status === 'ignored' ? 'ignored' : existing.status === 'suggested' ? 'enabled' : existing.status,
      })
      .where(eq(newsletterSources.id, existing.id))
      .returning();
    return updated!;
  }

  const [created] = await db
    .insert(newsletterSources)
    .values({
      senderEmail: input.senderEmail,
      senderDomain: domain,
      senderName: input.senderName,
      category: input.category,
      discoverySubscriptionId: input.discoverySubscriptionId ?? null,
      status: input.discoverySubscriptionId ? 'enabled' : 'suggested',
      lastEmailReceivedAt: now,
    })
    .returning();
  return created!;
}

export async function recordNewsletterSourceStats(
  sourceId: string,
  delta: {
    emailsProcessed?: number;
    entitiesExtracted?: number;
    occurrencesExtracted?: number;
    verifiedItemCount?: number;
    duplicateMergeCount?: number;
    quarantinedCount?: number;
    errorCount?: number;
    parsed?: boolean;
  },
): Promise<void> {
  const row = await db.query.newsletterSources.findFirst({ where: eq(newsletterSources.id, sourceId) });
  if (!row) return;
  const now = new Date();
  await db
    .update(newsletterSources)
    .set({
      emailsProcessed: row.emailsProcessed + (delta.emailsProcessed ?? 0),
      entitiesExtracted: row.entitiesExtracted + (delta.entitiesExtracted ?? 0),
      occurrencesExtracted: row.occurrencesExtracted + (delta.occurrencesExtracted ?? 0),
      verifiedItemCount: row.verifiedItemCount + (delta.verifiedItemCount ?? 0),
      duplicateMergeCount: row.duplicateMergeCount + (delta.duplicateMergeCount ?? 0),
      quarantinedCount: row.quarantinedCount + (delta.quarantinedCount ?? 0),
      errorCount: row.errorCount + (delta.errorCount ?? 0),
      lastSuccessfulParseAt: delta.parsed ? now : row.lastSuccessfulParseAt,
      updatedAt: now,
    })
    .where(eq(newsletterSources.id, sourceId));
}

export async function attachInventoryEvidence(input: NewInventoryEvidence): Promise<void> {
  if (!input.contentItemId) return;
  if (input.gmailMessageId) {
    const existing = await db.query.inventoryEvidence.findFirst({
      where: and(
        eq(inventoryEvidence.contentItemId, input.contentItemId),
        eq(inventoryEvidence.gmailMessageId, input.gmailMessageId),
      ),
    });
    if (existing) return;
  }
  await db.insert(inventoryEvidence).values(input);
}

export async function listNewsletterSources(): Promise<NewsletterSourceRow[]> {
  return db.query.newsletterSources.findMany({
    orderBy: (t, { desc }) => [desc(t.lastEmailReceivedAt)],
  });
}

export async function getNewsletterSource(id: string): Promise<NewsletterSourceRow | null> {
  return (await db.query.newsletterSources.findFirst({ where: eq(newsletterSources.id, id) })) ?? null;
}

export async function setNewsletterSourceStatus(
  id: string,
  status: 'enabled' | 'paused' | 'ignored' | 'suggested',
): Promise<NewsletterSourceRow | null> {
  const [updated] = await db
    .update(newsletterSources)
    .set({ status, updatedAt: new Date() })
    .where(eq(newsletterSources.id, id))
    .returning();
  return updated ?? null;
}

export async function setNewsletterSourceCategory(
  id: string,
  category: NewsletterCategory,
): Promise<NewsletterSourceRow | null> {
  const [updated] = await db
    .update(newsletterSources)
    .set({ category, updatedAt: new Date() })
    .where(eq(newsletterSources.id, id))
    .returning();
  return updated ?? null;
}

export async function updateDiscoveryEmailParseStats(
  discoveryEmailMessageId: string,
  patch: {
    newsletterCategory?: NewsletterCategory;
    senderDomain?: string;
    contentFingerprint?: string;
    newsletterSourceId?: string;
    entitiesExtracted?: number;
    occurrencesExtracted?: number;
    quarantinedCount?: number;
    processingStatus?: string;
    processingError?: string | null;
    contentItemId?: string | null;
  },
): Promise<void> {
  await db
    .update(discoveryEmailMessages)
    .set({
      ...patch,
      updatedAt: new Date(),
    })
    .where(eq(discoveryEmailMessages.id, discoveryEmailMessageId));
}

export function computeSourceRates(source: NewsletterSourceRow): {
  duplicateRate: number;
  errorRate: number;
  noiseRate: number;
} {
  const processed = Math.max(source.emailsProcessed, 1);
  return {
    duplicateRate: Number((source.duplicateMergeCount / processed).toFixed(3)),
    errorRate: Number((source.errorCount / processed).toFixed(3)),
    noiseRate: Number((source.quarantinedCount / processed).toFixed(3)),
  };
}
