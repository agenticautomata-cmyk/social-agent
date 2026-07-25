import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { gmailDigestMessages, outreachInboundMessages } from '../schema.js';
import { findActiveSubscriptionForSender } from '../discovery-subscriptions/index.js';
import {
  classifyDiscoveryIntent,
  classifyInboundEmail,
  type EmailCategory,
} from './email-category.js';
import { headerValue, parseFromHeader } from './client.js';
import { processDiscoveryEmailMessage } from './discovery-process.js';
import { ingestEmailMessageAsOpportunity } from './email-ingest.js';
import { fetchDiscoveryMessage } from './message-parse.js';
import { isDiscoveryEmail, resolveInboundChannelFromHeaders } from './resolve-channel.js';

export type DigestPromoteResult = {
  ok: boolean;
  reason?: string;
  contentItemId?: string;
  duplicateOfContentItemId?: string;
  inventoryUrl?: string;
  alreadyPromoted?: boolean;
};

export type DigestFollowUpResult = {
  ok: boolean;
  reason?: string;
  inboundMessageId?: string;
  alreadyPromoted?: boolean;
};

const FOLLOW_UP_CATEGORIES = new Set<EmailCategory>([
  'sponsor',
  'collaboration',
  'booking',
  'media',
  'general_contact',
]);

function inventoryUrl(contentItemId: string): string {
  const base =
    process.env.DASHBOARD_PUBLIC_URL?.replace(/\/$/, '') ??
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ??
    'https://benson.kckellie.com';
  return `${base}/review/inventory?selected=${contentItemId}`;
}

async function loadDigestRow(gmailMessageId: string) {
  return db.query.gmailDigestMessages.findFirst({
    where: eq(gmailDigestMessages.gmailMessageId, gmailMessageId),
  });
}

export async function promoteDigestToOpportunity(gmailMessageId: string): Promise<DigestPromoteResult> {
  const digestRow = await loadDigestRow(gmailMessageId);
  if (digestRow?.promotedContentItemId) {
    return {
      ok: true,
      alreadyPromoted: true,
      contentItemId: digestRow.promotedContentItemId,
      inventoryUrl: inventoryUrl(digestRow.promotedContentItemId),
    };
  }

  const message = await fetchDiscoveryMessage(gmailMessageId);
  if (!message) return { ok: false, reason: 'message_not_found' };

  const resolution = resolveInboundChannelFromHeaders(message.headers);
  if (isDiscoveryEmail(resolution)) {
    const discovery = await processDiscoveryEmailMessage(gmailMessageId);
    if (discovery.contentItemId) {
      await db
        .update(gmailDigestMessages)
        .set({
          promotedContentItemId: discovery.contentItemId,
          promotedAt: new Date(),
          actionStatus: 'promoted_opportunity',
        })
        .where(eq(gmailDigestMessages.gmailMessageId, gmailMessageId));
      return {
        ok: true,
        contentItemId: discovery.contentItemId,
        inventoryUrl: inventoryUrl(discovery.contentItemId),
        reason: discovery.reason,
      };
    }
    if (discovery.skipped && discovery.reason === 'already_processed' && discovery.contentItemId) {
      return {
        ok: true,
        alreadyPromoted: true,
        contentItemId: discovery.contentItemId,
        inventoryUrl: inventoryUrl(discovery.contentItemId),
      };
    }
  }

  const subject = headerValue(message.headers, 'Subject') ?? message.snippet ?? 'Email opportunity';
  const parsedFrom = parseFromHeader(headerValue(message.headers, 'From') ?? '');
  const activeSubscription = await findActiveSubscriptionForSender(parsedFrom.email);

  const ingest = await ingestEmailMessageAsOpportunity({
    message,
    subject,
    sourceName: 'Email Digest',
    ingestKey: 'email_digest',
    externalIdPrefix: 'email-digest',
    originalRecipient: resolution?.matchedEmail ?? digestRow?.originalRecipient ?? null,
    activeSubscriptionId: activeSubscription?.id ?? null,
  });

  if (!ingest.contentItemId) {
    return {
      ok: ingest.ok,
      reason: ingest.reason ?? 'ingest_failed',
      duplicateOfContentItemId: ingest.duplicateOfContentItemId,
      contentItemId: ingest.duplicateOfContentItemId,
      inventoryUrl: ingest.duplicateOfContentItemId
        ? inventoryUrl(ingest.duplicateOfContentItemId)
        : undefined,
    };
  }

  await db
    .update(gmailDigestMessages)
    .set({
      promotedContentItemId: ingest.contentItemId,
      promotedAt: new Date(),
      actionStatus: 'promoted_opportunity',
    })
    .where(eq(gmailDigestMessages.gmailMessageId, gmailMessageId));

  return {
    ok: true,
    contentItemId: ingest.contentItemId,
    inventoryUrl: inventoryUrl(ingest.contentItemId),
    reason: ingest.skipped ? ingest.reason : undefined,
  };
}

export async function promoteDigestToFollowUp(gmailMessageId: string): Promise<DigestFollowUpResult> {
  const digestRow = await loadDigestRow(gmailMessageId);
  if (digestRow?.actionStatus === 'promoted_sponsor') {
    const existing = await db.query.outreachInboundMessages.findFirst({
      where: eq(outreachInboundMessages.gmailMessageId, gmailMessageId),
    });
    return {
      ok: true,
      alreadyPromoted: true,
      inboundMessageId: existing?.id,
    };
  }

  const message = await fetchDiscoveryMessage(gmailMessageId);
  if (!message) return { ok: false, reason: 'message_not_found' };

  const classified = classifyInboundEmail({
    headers: message.headers,
    subject: headerValue(message.headers, 'Subject') ?? '',
    bodyText: message.bodyText,
    fromEmail: parseFromHeader(headerValue(message.headers, 'From') ?? '').email,
  });

  if (!FOLLOW_UP_CATEGORIES.has(classified.emailCategory)) {
    return { ok: false, reason: 'not_follow_up_category' };
  }

  const existing = await db.query.outreachInboundMessages.findFirst({
    where: eq(outreachInboundMessages.gmailMessageId, gmailMessageId),
  });
  if (existing) {
    await db
      .update(gmailDigestMessages)
      .set({ actionStatus: 'promoted_sponsor', promotedAt: new Date() })
      .where(eq(gmailDigestMessages.gmailMessageId, gmailMessageId));
    return { ok: true, alreadyPromoted: true, inboundMessageId: existing.id };
  }

  const parsedFrom = parseFromHeader(headerValue(message.headers, 'From') ?? '');
  const [inserted] = await db
    .insert(outreachInboundMessages)
    .values({
      gmailMessageId: message.id,
      gmailThreadId: message.threadId,
      outreachEmailId: null,
      fromEmail: parsedFrom.email,
      fromName: parsedFrom.name,
      subject: headerValue(message.headers, 'Subject') ?? message.snippet,
      snippet: message.bodyText.slice(0, 240) || message.snippet,
      receivedAt: message.internalDate,
      matchKind: 'digest_promoted',
      channelId: classified.channelId ?? 'sponsors',
      emailCategory: classified.emailCategory,
      originalRecipient: classified.originalRecipient,
      matchedHeader: classified.matchedHeader,
      isRead: false,
      notifiedAt: new Date(),
    })
    .returning({ id: outreachInboundMessages.id });

  await db
    .update(gmailDigestMessages)
    .set({
      actionStatus: 'promoted_sponsor',
      promotedAt: new Date(),
    })
    .where(eq(gmailDigestMessages.gmailMessageId, gmailMessageId));

  return { ok: true, inboundMessageId: inserted!.id };
}

export async function dismissDigestMessage(gmailMessageId: string): Promise<{ ok: boolean }> {
  await db
    .update(gmailDigestMessages)
    .set({
      actionStatus: 'dismissed',
      dismissedAt: new Date(),
    })
    .where(eq(gmailDigestMessages.gmailMessageId, gmailMessageId));
  return { ok: true };
}

/** Auto-harvest opportunity-shaped digest mail using the full message body. */
export async function tryAutoHarvestDigestMessage(gmailMessageId: string): Promise<DigestPromoteResult | null> {
  const digestRow = await loadDigestRow(gmailMessageId);
  if (!digestRow || digestRow.actionStatus !== 'open') return null;
  if (digestRow.promotedContentItemId) return null;

  const message = await fetchDiscoveryMessage(gmailMessageId);
  if (!message) return null;

  const subject = headerValue(message.headers, 'Subject') ?? message.snippet ?? '';
  const resolution = resolveInboundChannelFromHeaders(message.headers);
  const intent = classifyDiscoveryIntent({
    subject,
    bodyText: message.bodyText,
    bodyHtml: message.bodyHtml,
  });

  const shouldIngest =
    intent === 'discovery_opportunity' ||
    (isDiscoveryEmail(resolution) &&
      intent !== 'discovery_subscription_welcome' &&
      intent !== 'discovery_subscription_confirmation');

  if (!shouldIngest) return null;

  return promoteDigestToOpportunity(gmailMessageId);
}
