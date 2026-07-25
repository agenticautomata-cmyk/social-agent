import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { discoveryEmailMessages } from '../schema.js';
import {
  findActiveSubscriptionForSender,
  findBlockedSender,
  processSubscriptionConfirmationEmail,
} from '../discovery-subscriptions/index.js';
import { classifyDiscoveryIntent } from './email-category.js';
import { headerValue, parseFromHeader } from './client.js';
import { ingestEmailMessageAsOpportunity } from './email-ingest.js';
import { fetchDiscoveryMessage } from './message-parse.js';
import {
  isDiscoveryEmail,
  resolveInboundChannelFromHeaders,
  ROUTING_HEADER_NAMES,
} from './resolve-channel.js';

export type DiscoveryEmailProcessResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  discoveryMessageId?: string;
  contentItemId?: string;
  duplicateOfContentItemId?: string;
  subscriptionId?: string;
  confirmationProcessed?: boolean;
  autoVerified?: boolean;
};

async function processOpportunityDiscoveryEmail(input: {
  message: NonNullable<Awaited<ReturnType<typeof fetchDiscoveryMessage>>>;
  discoveryRowId: string;
  resolutionEmail: string | null | undefined;
  parsedFrom: ReturnType<typeof parseFromHeader>;
  subject: string;
  activeSubscriptionId?: string | null;
}): Promise<DiscoveryEmailProcessResult> {
  const { message, discoveryRowId, resolutionEmail, subject, activeSubscriptionId } = input;

  const ingest = await ingestEmailMessageAsOpportunity({
    message,
    subject,
    originalRecipient: resolutionEmail,
    activeSubscriptionId,
  });

  await db
    .update(discoveryEmailMessages)
    .set({
      processingStatus: ingest.skipped ? 'duplicate' : 'processed',
      contentItemId: ingest.contentItemId ?? ingest.duplicateOfContentItemId ?? null,
      duplicateOfContentItemId: ingest.duplicateOfContentItemId ?? null,
      messageKind: activeSubscriptionId ? 'verified_source_newsletter' : 'opportunity_signal',
      subscriptionId: activeSubscriptionId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(discoveryEmailMessages.id, discoveryRowId));

  return {
    ok: ingest.ok,
    skipped: ingest.skipped,
    reason: ingest.reason,
    discoveryMessageId: discoveryRowId,
    contentItemId: ingest.contentItemId ?? ingest.duplicateOfContentItemId,
    duplicateOfContentItemId: ingest.duplicateOfContentItemId,
    subscriptionId: activeSubscriptionId ?? undefined,
  };
}

export async function processDiscoveryEmailMessage(messageId: string): Promise<DiscoveryEmailProcessResult> {
  const existingMsg = await db.query.discoveryEmailMessages.findFirst({
    where: eq(discoveryEmailMessages.gmailMessageId, messageId),
  });
  if (existingMsg) {
    return {
      ok: true,
      skipped: true,
      reason: 'already_processed',
      discoveryMessageId: existingMsg.id,
      contentItemId: existingMsg.contentItemId ?? undefined,
      subscriptionId: existingMsg.subscriptionId ?? undefined,
    };
  }

  const message = await fetchDiscoveryMessage(messageId);
  if (!message) return { ok: false, reason: 'message_not_found' };

  const resolution = resolveInboundChannelFromHeaders(message.headers);
  if (!isDiscoveryEmail(resolution)) {
    return { ok: true, skipped: true, reason: 'not_discovery_email' };
  }

  if (await findBlockedSender(parseFromHeader(headerValue(message.headers, 'From') ?? '').email)) {
    return { ok: true, skipped: true, reason: 'blocked_sender' };
  }

  const fromRaw = headerValue(message.headers, 'From') ?? '';
  const parsedFrom = parseFromHeader(fromRaw);
  const subject = headerValue(message.headers, 'Subject') ?? message.snippet ?? 'Discovery email';
  const discoveryIntent = classifyDiscoveryIntent({
    subject,
    bodyText: message.bodyText,
    bodyHtml: message.bodyHtml,
  });

  const [discoveryRow] = await db
    .insert(discoveryEmailMessages)
    .values({
      gmailMessageId: message.id,
      gmailThreadId: message.threadId,
      originalRecipient: resolution?.matchedEmail ?? null,
      matchedHeader: resolution?.matchedHeader ?? null,
      senderEmail: parsedFrom.email,
      senderName: parsedFrom.name,
      subject,
      receivedAt: message.internalDate ?? new Date(),
      bodyText: message.bodyText,
      urls: message.urls,
      processingStatus: 'received',
      messageKind:
        discoveryIntent === 'discovery_subscription_confirmation'
          ? 'discovery_subscription_confirmation'
          : discoveryIntent === 'discovery_opportunity'
            ? 'opportunity_signal'
            : 'opportunity_signal',
      channelId: 'discoveries',
      emailCategory: 'discovery',
      discoveryIntent,
    })
    .returning();

  try {
    if (discoveryIntent === 'discovery_subscription_confirmation') {
      const confirmation = await processSubscriptionConfirmationEmail({
        discoveryMessageId: discoveryRow!.id,
        gmailMessageId: message.id,
        subject,
        bodyText: message.bodyText,
        bodyHtml: message.bodyHtml,
        senderEmail: parsedFrom.email,
        senderName: parsedFrom.name,
        receivedAt: message.internalDate,
        urls: message.urls,
      });

      return {
        ok: confirmation.ok,
        discoveryMessageId: discoveryRow!.id,
        subscriptionId: confirmation.subscriptionId,
        confirmationProcessed: true,
        autoVerified: confirmation.autoVerified,
        skipped: Boolean(confirmation.skippedReason),
        reason: confirmation.manualReviewReason ?? confirmation.skippedReason,
      };
    }

    if (
      discoveryIntent === 'discovery_subscription_welcome' ||
      discoveryIntent === 'discovery_marketing' ||
      discoveryIntent === 'discovery_other'
    ) {
      await db
        .update(discoveryEmailMessages)
        .set({
          processingStatus: 'skipped',
          updatedAt: new Date(),
        })
        .where(eq(discoveryEmailMessages.id, discoveryRow!.id));

      return {
        ok: true,
        skipped: true,
        reason: discoveryIntent,
        discoveryMessageId: discoveryRow!.id,
      };
    }

    const activeSubscription = await findActiveSubscriptionForSender(parsedFrom.email);

    return processOpportunityDiscoveryEmail({
      message,
      discoveryRowId: discoveryRow!.id,
      resolutionEmail: resolution?.matchedEmail,
      parsedFrom,
      subject,
      activeSubscriptionId: activeSubscription?.id ?? null,
    });
  } catch (err) {
    const messageText = err instanceof Error ? err.message : String(err);
    await db
      .update(discoveryEmailMessages)
      .set({
        processingStatus: 'failed',
        processingError: messageText,
        updatedAt: new Date(),
      })
      .where(eq(discoveryEmailMessages.id, discoveryRow!.id));
    return { ok: false, reason: messageText, discoveryMessageId: discoveryRow!.id };
  }
}

export { fetchDiscoveryMessage } from './message-parse.js';
export { ROUTING_HEADER_NAMES, resolveInboundChannelFromHeaders, isDiscoveryEmail };
