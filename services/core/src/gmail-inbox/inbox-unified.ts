import { desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import {
  discoveryEmailMessages,
  gmailDigestMessages,
  outreachInboundMessages,
  outreachEmails,
  sponsorContacts,
} from '../schema.js';
import type { InboxFilterCategory } from './email-category.js';

export type UnifiedInboxMessage = {
  id: string;
  source: 'outreach_reply' | 'discovery_email' | 'gmail_digest';
  gmailMessageId: string;
  gmailThreadId: string | null;
  fromEmail: string | null;
  fromName: string | null;
  subject: string | null;
  snippet: string | null;
  receivedAt: string | null;
  emailCategory: string;
  discoveryIntent: string | null;
  channelId: string | null;
  originalRecipient: string | null;
  matchedHeader: string | null;
  isRead: boolean;
  businessName: string | null;
  outreachEmailId: string | null;
  processingStatus: string | null;
  actionStatus: string | null;
  promotedContentItemId: string | null;
};

function matchesFilter(row: UnifiedInboxMessage, filter?: InboxFilterCategory | null): boolean {
  if (!filter) return true;
  if (filter === 'subscription_confirmation') {
    return row.discoveryIntent === 'discovery_subscription_confirmation';
  }
  if (filter === 'discovery') {
    return row.emailCategory === 'discovery' && row.discoveryIntent !== 'discovery_subscription_confirmation';
  }
  return row.emailCategory === filter;
}

export async function listUnifiedInboxMessages(input?: {
  limit?: number;
  category?: InboxFilterCategory | null;
}): Promise<UnifiedInboxMessage[]> {
  const limit = input?.limit ?? 100;

  const [outreachRows, discoveryRows, digestRows] = await Promise.all([
    db
      .select({
        inbound: outreachInboundMessages,
        businessName: sponsorContacts.businessName,
      })
      .from(outreachInboundMessages)
      .leftJoin(outreachEmails, eq(outreachEmails.id, outreachInboundMessages.outreachEmailId))
      .leftJoin(sponsorContacts, eq(sponsorContacts.id, outreachEmails.sponsorContactId))
      .orderBy(desc(outreachInboundMessages.receivedAt))
      .limit(limit),
    db
      .select()
      .from(discoveryEmailMessages)
      .orderBy(desc(discoveryEmailMessages.receivedAt))
      .limit(limit),
    db
      .select()
      .from(gmailDigestMessages)
      .orderBy(desc(gmailDigestMessages.summarizedAt))
      .limit(limit),
  ]);

  const gmailIds = new Set<string>();
  const merged: UnifiedInboxMessage[] = [];

  for (const { inbound, businessName } of outreachRows) {
    gmailIds.add(inbound.gmailMessageId);
    merged.push({
      id: inbound.id,
      source: 'outreach_reply',
      gmailMessageId: inbound.gmailMessageId,
      gmailThreadId: inbound.gmailThreadId,
      fromEmail: inbound.fromEmail,
      fromName: inbound.fromName,
      subject: inbound.subject,
      snippet: inbound.snippet,
      receivedAt: inbound.receivedAt?.toISOString() ?? null,
      emailCategory: inbound.emailCategory ?? 'sponsor',
      discoveryIntent: null,
      channelId: inbound.channelId ?? 'sponsors',
      originalRecipient: inbound.originalRecipient,
      matchedHeader: inbound.matchedHeader,
      isRead: inbound.isRead,
      businessName: businessName ?? null,
      outreachEmailId: inbound.outreachEmailId,
      processingStatus: null,
      actionStatus: null,
      promotedContentItemId: null,
    });
  }

  for (const row of discoveryRows) {
    if (gmailIds.has(row.gmailMessageId)) continue;
    gmailIds.add(row.gmailMessageId);
    merged.push({
      id: row.id,
      source: 'discovery_email',
      gmailMessageId: row.gmailMessageId,
      gmailThreadId: row.gmailThreadId,
      fromEmail: row.senderEmail,
      fromName: row.senderName,
      subject: row.subject,
      snippet: row.bodyText?.slice(0, 240) ?? null,
      receivedAt: row.receivedAt?.toISOString() ?? null,
      emailCategory: row.emailCategory ?? 'discovery',
      discoveryIntent: row.discoveryIntent ?? row.messageKind,
      channelId: row.channelId ?? 'discoveries',
      originalRecipient: row.originalRecipient,
      matchedHeader: row.matchedHeader,
      isRead: true,
      businessName: null,
      outreachEmailId: null,
      processingStatus: row.processingStatus,
      actionStatus: null,
      promotedContentItemId: null,
    });
  }

  for (const row of digestRows) {
    if (gmailIds.has(row.gmailMessageId)) continue;
    merged.push({
      id: row.gmailMessageId,
      source: 'gmail_digest',
      gmailMessageId: row.gmailMessageId,
      gmailThreadId: row.gmailThreadId,
      fromEmail: row.fromEmail,
      fromName: row.fromName,
      subject: row.subject,
      snippet: row.snippet,
      receivedAt: row.receivedAt?.toISOString() ?? row.summarizedAt.toISOString(),
      emailCategory: row.emailCategory ?? 'general_contact',
      discoveryIntent: row.discoveryIntent,
      channelId: row.channelId,
      originalRecipient: row.originalRecipient,
      matchedHeader: row.matchedHeader,
      isRead: row.actionStatus === 'dismissed' || row.actionStatus === 'promoted_opportunity' || row.actionStatus === 'promoted_sponsor',
      businessName: null,
      outreachEmailId: null,
      processingStatus: row.actionStatus,
      actionStatus: row.actionStatus,
      promotedContentItemId: row.promotedContentItemId,
    });
  }

  merged.sort((a, b) => {
    const aTime = a.receivedAt ? Date.parse(a.receivedAt) : 0;
    const bTime = b.receivedAt ? Date.parse(b.receivedAt) : 0;
    return bTime - aTime;
  });

  return merged.filter((row) => matchesFilter(row, input?.category)).slice(0, limit);
}

export async function countUnreadByCategory(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {
    sponsor: 0,
    discovery: 0,
    collaboration: 0,
    booking: 0,
    media: 0,
    general_contact: 0,
    security: 0,
    subscription_confirmation: 0,
  };

  const unreadOutreach = await db
    .select({ emailCategory: outreachInboundMessages.emailCategory })
    .from(outreachInboundMessages)
    .where(eq(outreachInboundMessages.isRead, false));

  for (const row of unreadOutreach) {
    const key = row.emailCategory ?? 'sponsor';
    counts[key] = (counts[key] ?? 0) + 1;
  }

  const openDigest = await db
    .select({ emailCategory: gmailDigestMessages.emailCategory })
    .from(gmailDigestMessages)
    .where(eq(gmailDigestMessages.actionStatus, 'open'));

  for (const row of openDigest) {
    const key = row.emailCategory ?? 'general_contact';
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return counts;
}

export async function reclassifyRecentInboundEmail(limit = 200): Promise<{
  updatedDigest: number;
  updatedDiscovery: number;
}> {
  const digestRows = await db
    .select()
    .from(gmailDigestMessages)
    .orderBy(desc(gmailDigestMessages.summarizedAt))
    .limit(limit);

  let updatedDigest = 0;
  for (const row of digestRows) {
    if (row.emailCategory && row.emailCategory !== 'sponsor') continue;
    const discovery = await db.query.discoveryEmailMessages.findFirst({
      where: eq(discoveryEmailMessages.gmailMessageId, row.gmailMessageId),
    });
    if (discovery) {
      await db
        .update(gmailDigestMessages)
        .set({
          channelId: 'discoveries',
          emailCategory: 'discovery',
          discoveryIntent: discovery.discoveryIntent ?? discovery.messageKind,
          originalRecipient: discovery.originalRecipient ?? row.originalRecipient,
        })
        .where(eq(gmailDigestMessages.gmailMessageId, row.gmailMessageId));
      updatedDigest += 1;
    }
  }

  const discoveryRows = await db
    .select()
    .from(discoveryEmailMessages)
    .orderBy(desc(discoveryEmailMessages.receivedAt))
    .limit(limit);

  let updatedDiscovery = 0;
  for (const row of discoveryRows) {
    if (row.emailCategory === 'discovery' && row.discoveryIntent) continue;
    await db
      .update(discoveryEmailMessages)
      .set({
        channelId: 'discoveries',
        emailCategory: 'discovery',
        discoveryIntent:
          row.discoveryIntent ??
          (row.messageKind === 'discovery_subscription_confirmation'
            ? 'discovery_subscription_confirmation'
            : row.messageKind === 'verified_source_newsletter'
              ? 'discovery_opportunity'
              : 'discovery_other'),
      })
      .where(eq(discoveryEmailMessages.id, row.id));
    updatedDiscovery += 1;
  }

  return { updatedDigest, updatedDiscovery };
}
