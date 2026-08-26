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
import { fetchDiscoveryMessage } from './message-parse.js';
import { processNewsletterEmailRouted } from '../newsletter-intelligence/pipeline-router.js';
import { findEnabledNewsletterSourceForSender } from '../newsletter-intelligence/sources.js';
import { resolveDiscoveryNewsletterRoute } from './discovery-newsletter-route.js';
import { processNewsletterEmail } from '../newsletter-intelligence/pipeline.js';
import type { NewsletterParseResult } from '../newsletter-intelligence/types.js';
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

function applyNewsletterParseToDiscoveryRow(
  discoveryRowId: string,
  result: NewsletterParseResult,
  extra: {
    messageKind: string;
    subscriptionId?: string | null;
  },
) {
  return db
    .update(discoveryEmailMessages)
    .set({
      processingStatus: result.processingStatus,
      processingError: result.reason && result.processingStatus !== 'processed' ? result.reason : null,
      contentItemId: result.contentItemIds[0] ?? null,
      duplicateOfContentItemId: result.processingStatus === 'duplicate' ? result.contentItemIds[0] ?? null : null,
      messageKind: extra.messageKind,
      subscriptionId: extra.subscriptionId ?? null,
      occurrencesExtracted: result.datedOccurrencesCreated + result.datedOccurrenceDuplicates,
      updatedAt: new Date(),
    })
    .where(eq(discoveryEmailMessages.id, discoveryRowId));
}

function discoveryResultFromNewsletterParse(
  discoveryRowId: string,
  result: NewsletterParseResult,
  subscriptionId?: string | null,
): DiscoveryEmailProcessResult {
  return {
    ok: result.ok,
    skipped: result.processingStatus !== 'processed',
    reason: result.reason,
    discoveryMessageId: discoveryRowId,
    contentItemId: result.contentItemIds[0],
    duplicateOfContentItemId: result.processingStatus === 'duplicate' ? result.contentItemIds[0] : undefined,
    subscriptionId: subscriptionId ?? undefined,
  };
}

async function processOpportunityDiscoveryEmail(input: {
  message: NonNullable<Awaited<ReturnType<typeof fetchDiscoveryMessage>>>;
  discoveryRowId: string;
  resolutionEmail: string | null | undefined;
  parsedFrom: ReturnType<typeof parseFromHeader>;
  subject: string;
  activeSubscriptionId?: string | null;
  enabledNewsletterSource?: boolean;
}): Promise<DiscoveryEmailProcessResult> {
  const {
    message,
    discoveryRowId,
    resolutionEmail,
    parsedFrom,
    subject,
    activeSubscriptionId,
    enabledNewsletterSource = false,
  } = input;

  if (activeSubscriptionId || enabledNewsletterSource) {
    const routed = await processNewsletterEmailRouted({
      message,
      subject,
      senderEmail: parsedFrom.email,
      senderName: parsedFrom.name,
      discoveryEmailMessageId: discoveryRowId,
      discoverySubscriptionId: activeSubscriptionId,
      originalRecipient: resolutionEmail,
      emailSentAt: message.internalDate,
      fromEnabledNewsletterSource: enabledNewsletterSource,
    });

    if (routed.mode === 'comparison') {
      const result = routed.legacy;
      await applyNewsletterParseToDiscoveryRow(discoveryRowId, result, {
        messageKind: 'verified_source_newsletter',
        subscriptionId: activeSubscriptionId,
      });
      return discoveryResultFromNewsletterParse(discoveryRowId, result, activeSubscriptionId);
    }

    if (routed.mode === 'token_efficient') {
      const te = routed.result;
      const datedAccepted = te.acceptedItems.filter((item) => Boolean(item.startDate)).length;
      const processingStatus =
        te.primaryOutcome === 'provider_blocked'
          ? 'failed'
          : datedAccepted > 0
            ? 'processed'
            : te.primaryOutcome === 'rejected_pre_llm'
              ? 'skipped'
              : 'skipped';
      const processingError =
        te.primaryOutcome === 'provider_blocked'
          ? 'provider_quota_exhausted'
          : processingStatus === 'processed'
            ? null
            : te.skipReason ?? 'no_dated_occurrence';
      await db
        .update(discoveryEmailMessages)
        .set({
          processingStatus,
          processingError,
          messageKind: 'verified_source_newsletter',
          subscriptionId: activeSubscriptionId,
          updatedAt: new Date(),
        })
        .where(eq(discoveryEmailMessages.id, discoveryRowId));
      return {
        ok: te.primaryOutcome !== 'provider_blocked',
        skipped: processingStatus !== 'processed',
        reason: processingError ?? te.primaryOutcome,
        discoveryMessageId: discoveryRowId,
        subscriptionId: activeSubscriptionId,
      };
    }

    const result = routed.result;
    await applyNewsletterParseToDiscoveryRow(discoveryRowId, result, {
      messageKind: 'verified_source_newsletter',
      subscriptionId: activeSubscriptionId,
    });
    return discoveryResultFromNewsletterParse(discoveryRowId, result, activeSubscriptionId);
  }

  const result = await processNewsletterEmail({
    message,
    subject,
    senderEmail: parsedFrom.email,
    senderName: parsedFrom.name,
    discoveryEmailMessageId: discoveryRowId,
    discoverySubscriptionId: null,
    originalRecipient: resolutionEmail,
    fromEnabledNewsletterSource: false,
  });

  await applyNewsletterParseToDiscoveryRow(discoveryRowId, result, {
    messageKind: 'opportunity_signal',
    subscriptionId: null,
  });
  return discoveryResultFromNewsletterParse(discoveryRowId, result, null);
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
    const enabledSource = await findEnabledNewsletterSourceForSender(parsedFrom.email);
    const activeSubscription = await findActiveSubscriptionForSender(parsedFrom.email);
    const route = resolveDiscoveryNewsletterRoute({
      discoveryIntent,
      enabledNewsletterSource: Boolean(enabledSource),
      hasActiveSubscription: Boolean(activeSubscription),
    });

    let confirmationResult: {
      ok: boolean;
      subscriptionId?: string;
      autoVerified?: boolean;
      skippedReason?: string | null;
      manualReviewReason?: string | null;
    } | null = null;

    if (route.runConfirmation) {
      confirmationResult = await processSubscriptionConfirmationEmail({
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
      if (!route.runNewsletterIntelligence) {
        return {
          ok: confirmationResult.ok,
          discoveryMessageId: discoveryRow!.id,
          subscriptionId: confirmationResult.subscriptionId,
          confirmationProcessed: true,
          autoVerified: confirmationResult.autoVerified,
          skipped: Boolean(confirmationResult.skippedReason),
          reason: confirmationResult.manualReviewReason ?? confirmationResult.skippedReason ?? undefined,
        };
      }
    }

    if (route.action === 'skip_intent') {
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

    const processed = await processOpportunityDiscoveryEmail({
      message,
      discoveryRowId: discoveryRow!.id,
      resolutionEmail: resolution?.matchedEmail,
      parsedFrom,
      subject,
      activeSubscriptionId: activeSubscription?.id ?? null,
      enabledNewsletterSource: Boolean(enabledSource),
    });

    if (confirmationResult) {
      return {
        ...processed,
        confirmationProcessed: true,
        autoVerified: confirmationResult.autoVerified,
        subscriptionId: processed.subscriptionId ?? confirmationResult.subscriptionId,
      };
    }

    return processed;
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
