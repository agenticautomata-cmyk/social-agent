import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../db.js';
import {
  gmailSyncState,
  outreachEmails,
  outreachInboundMessages,
  sponsorContacts,
} from '../schema.js';
import { getGmailConnectionStatus } from '../gmail-oauth/connections.js';
import { notifyOutreachReply } from '../outreach-notifications/notify-kellie.js';
import { getChannelEmail } from '../creator-info/channels.js';
import { fetchGmailMessageSummaries, listGmailMessageIds } from './messages.js';
import {
  isReplyActionable,
  resolveInboundActionability,
  senderDomainFromEmail,
} from './inbound-actionability.js';

export type GmailInboxSyncResult = {
  ok: boolean;
  skipped?: string;
  scanned: number;
  newReplies: number;
  notified: number;
  errors: string[];
};

type SentPitchThread = {
  outreachEmailId: string;
  threadId: string;
  sponsorContactId: string;
  businessName: string;
};

async function loadSentPitchThreads(): Promise<Map<string, SentPitchThread>> {
  const rows = await db
    .select({
      id: outreachEmails.id,
      threadId: outreachEmails.gmailThreadId,
      sponsorContactId: outreachEmails.sponsorContactId,
      businessName: sponsorContacts.businessName,
    })
    .from(outreachEmails)
    .innerJoin(sponsorContacts, eq(sponsorContacts.id, outreachEmails.sponsorContactId))
    .where(
      and(
        inArray(outreachEmails.status, ['sent', 'simulated_sent']),
        isNull(outreachEmails.failureReason),
      ),
    );

  const map = new Map<string, SentPitchThread>();
  for (const row of rows) {
    if (!row.threadId) continue;
    map.set(row.threadId, {
      outreachEmailId: row.id,
      threadId: row.threadId,
      sponsorContactId: row.sponsorContactId,
      businessName: row.businessName,
    });
  }
  return map;
}

function isFromSelf(fromEmail: string | null, selfEmail: string | null): boolean {
  if (!fromEmail || !selfEmail) return false;
  return fromEmail.toLowerCase() === selfEmail.toLowerCase();
}

export async function syncGmailOutreachReplies(): Promise<GmailInboxSyncResult> {
  const status = await getGmailConnectionStatus();
  if (status.status !== 'connected') {
    return { ok: false, skipped: 'gmail_not_connected', scanned: 0, newReplies: 0, notified: 0, errors: [] };
  }

  const selfEmail = status.connection?.email ?? null;
  const pitchThreads = await loadSentPitchThreads();
  if (pitchThreads.size === 0) {
    await db
      .insert(gmailSyncState)
      .values({ id: 'default', lastInboxSyncAt: new Date(), updatedAt: new Date() })
      .onConflictDoUpdate({
        target: gmailSyncState.id,
        set: { lastInboxSyncAt: new Date(), updatedAt: new Date() },
      });
    return { ok: true, scanned: 0, newReplies: 0, notified: 0, errors: [] };
  }

  const threadIds = [...pitchThreads.keys()].slice(0, 20);
  const query = `in:inbox newer_than:30d (${threadIds.map((id) => `thread:${id}`).join(' OR ')})`;
  const messageIds = await listGmailMessageIds(query, 100);
  const summaries = await fetchGmailMessageSummaries(messageIds);

  let newReplies = 0;
  let notified = 0;
  const errors: string[] = [];

  for (const msg of summaries) {
    if (isFromSelf(msg.fromEmail, selfEmail)) continue;
    const pitch = pitchThreads.get(msg.threadId);
    if (!pitch) continue;

    try {
      const existing = await db
        .select({ id: outreachInboundMessages.id })
        .from(outreachInboundMessages)
        .where(eq(outreachInboundMessages.gmailMessageId, msg.id))
        .limit(1);

      if (existing.length > 0) continue;

      const actionability = resolveInboundActionability({
        subject: msg.subject ?? '',
        bodyText: msg.snippet ?? msg.subject ?? '',
        senderDomain: senderDomainFromEmail(msg.fromEmail),
        matchKind: 'outreach_reply',
        outreachEmailId: pitch.outreachEmailId,
        verifiedOutreachThread: true,
      });

      const [inserted] = await db
        .insert(outreachInboundMessages)
        .values({
          gmailMessageId: msg.id,
          gmailThreadId: msg.threadId,
          outreachEmailId: pitch.outreachEmailId,
          fromEmail: msg.fromEmail,
          fromName: msg.fromName,
          subject: msg.subject,
          snippet: msg.snippet,
          receivedAt: msg.internalDate,
          matchKind: 'outreach_reply',
          channelId: 'sponsors',
          emailCategory: 'sponsor',
          originalRecipient: getChannelEmail('sponsors'),
          matchedHeader: 'thread_match',
          emailIntent: actionability.emailIntent,
          actionability: actionability.actionability,
        })
        .returning({ id: outreachInboundMessages.id });

      newReplies += 1;

      const contactRows = await db
        .select({ status: sponsorContacts.status })
        .from(sponsorContacts)
        .where(eq(sponsorContacts.id, pitch.sponsorContactId))
        .limit(1);
      const contactStatus = contactRows[0]?.status;
      if (contactStatus && contactStatus !== 'converted' && contactStatus !== 'not_interested') {
        const { clearOutreachFollowUp } = await import('../sponsor-outreach/follow-up.js');
        await clearOutreachFollowUp({
          outreachEmailId: pitch.outreachEmailId,
          sponsorContactId: pitch.sponsorContactId,
        });
      }

      await notifyOutreachReply({
        businessName: pitch.businessName,
        threadId: msg.threadId,
        subject: msg.subject,
      });

      await db
        .update(outreachInboundMessages)
        .set({ notifiedAt: new Date() })
        .where(eq(outreachInboundMessages.id, inserted!.id));

      notified += 1;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  await db
    .insert(gmailSyncState)
    .values({ id: 'default', lastInboxSyncAt: new Date(), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: gmailSyncState.id,
      set: { lastInboxSyncAt: new Date(), updatedAt: new Date() },
    });

  return { ok: true, scanned: summaries.length, newReplies, notified, errors };
}

export type InboundMessageRecord = {
  id: string;
  gmailMessageId: string;
  gmailThreadId: string;
  outreachEmailId: string | null;
  fromEmail: string | null;
  fromName: string | null;
  subject: string | null;
  snippet: string | null;
  receivedAt: string | null;
  matchKind: string;
  channelId: string | null;
  emailCategory: string;
  originalRecipient: string | null;
  matchedHeader: string | null;
  emailIntent: string | null;
  actionability: string;
  isRead: boolean;
  businessName: string | null;
  createdAt: string;
};

export async function listOutreachInboundMessages(limit = 100): Promise<InboundMessageRecord[]> {
  const rows = await db
    .select({
      inbound: outreachInboundMessages,
      businessName: sponsorContacts.businessName,
    })
    .from(outreachInboundMessages)
    .leftJoin(outreachEmails, eq(outreachEmails.id, outreachInboundMessages.outreachEmailId))
    .leftJoin(sponsorContacts, eq(sponsorContacts.id, outreachEmails.sponsorContactId))
    .orderBy(desc(outreachInboundMessages.receivedAt), desc(outreachInboundMessages.createdAt))
    .limit(limit);

  return rows.map(({ inbound, businessName }) => ({
    id: inbound.id,
    gmailMessageId: inbound.gmailMessageId,
    gmailThreadId: inbound.gmailThreadId,
    outreachEmailId: inbound.outreachEmailId,
    fromEmail: inbound.fromEmail,
    fromName: inbound.fromName,
    subject: inbound.subject,
    snippet: inbound.snippet,
    receivedAt: inbound.receivedAt?.toISOString() ?? null,
    matchKind: inbound.matchKind,
    channelId: inbound.channelId ?? 'sponsors',
    emailCategory: inbound.emailCategory ?? 'sponsor',
    originalRecipient: inbound.originalRecipient,
    matchedHeader: inbound.matchedHeader,
    emailIntent: inbound.emailIntent ?? null,
    actionability: inbound.actionability ?? 'none',
    isRead: inbound.isRead,
    businessName: businessName ?? null,
    createdAt: inbound.createdAt.toISOString(),
  }));
}

export async function markInboundMessageRead(id: string): Promise<boolean> {
  const result = await db
    .update(outreachInboundMessages)
    .set({ isRead: true })
    .where(eq(outreachInboundMessages.id, id))
    .returning({ id: outreachInboundMessages.id });
  return result.length > 0;
}

export async function countUnreadInboundMessages(): Promise<number> {
  const rows = await db
    .select({ id: outreachInboundMessages.id })
    .from(outreachInboundMessages)
    .where(
      and(
        eq(outreachInboundMessages.isRead, false),
        eq(outreachInboundMessages.actionability, 'reply_required'),
      ),
    );
  return rows.length;
}
