import OpenAI from 'openai';
import { randomUUID } from 'crypto';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { discoveryEmailMessages, discoverySubscriptions, gmailDigestMessages, gmailSyncState } from '../schema.js';
import { env } from '../env.js';
import { getGmailConnectionStatus } from '../gmail-oauth/connections.js';
import { sendTelegramMessage } from '../telegram-notifications/send.js';
import type { GmailMessageSummary } from './messages.js';
import {
  fetchGmailMessageSummaries,
  listGmailMessageIds,
} from './messages.js';
import { buildDigestUnreadQuery, digestMessageCap } from './digest-query.js';
import { tryAutoHarvestDigestMessage } from './digest-promote.js';
import { tryAutoPipelineSponsorInbox } from './sponsor-inbox-pipeline.js';
import { processCreatorEmailMatchFromGmailId } from '../creator-partnership/process-email-match.js';
import {
  classifyInboundEmail,
  formatTelegramDigestBody,
  subscriptionConfirmationTelegramStatus,
  type EmailCategory,
} from './email-category.js';
import {
  estimateMiniCost,
  maybeAlertBudgetExceeded,
  recordLlmUsage,
  shouldSkipBackgroundLlm,
} from '../llm-spend/index.js';

export type GmailDigestResult = {
  ok: boolean;
  skipped?: string;
  newMessages: number;
  telegramSent: boolean;
  errors: string[];
  batches?: number;
  autoHarvested?: number;
};

type ClassifiedSummary = GmailMessageSummary & {
  emailCategory: EmailCategory | 'subscription_confirmation';
  discoveryIntent: string | null;
  channelId: string | null;
  originalRecipient: string | null;
  matchedHeader: string | null;
};

function publicAppBase(): string {
  return (
    process.env.DASHBOARD_PUBLIC_URL?.replace(/\/$/, '') ??
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ??
    'https://benson.kckellie.com'
  );
}

async function summarizeBatch(
  category: EmailCategory | 'subscription_confirmation',
  messages: ClassifiedSummary[],
): Promise<string> {
  if (messages.length === 0) return '';

  const templateSummary = messages
    .slice(0, 8)
    .map((m) => `• ${m.fromName ?? m.fromEmail ?? 'Someone'} — ${m.subject ?? 'No subject'}`)
    .join('\n');

  const llmGate = await shouldSkipBackgroundLlm('digest');
  const useLlm =
    env.GMAIL_DIGEST_LLM_ENABLED &&
    !llmGate.skip &&
    messages.length >= env.GMAIL_DIGEST_LLM_MIN_BATCH;

  if (!useLlm || !env.OPENAI_API_KEY?.trim()) {
    return templateSummary;
  }

  const lines = messages.map(
    (m, i) =>
      `${i + 1}. From: ${m.fromName ?? m.fromEmail ?? 'unknown'} | Subject: ${m.subject ?? '(no subject)'} | Snippet: ${m.snippet ?? ''}`,
  );

  const categoryLabel =
    category === 'subscription_confirmation'
      ? 'subscription confirmation'
      : category.replace(/_/g, ' ');

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.4,
    messages: [
      {
        role: 'system',
        content:
          `You summarize Kellie's ${categoryLabel} Gmail messages for a Telegram alert. Write 3-8 bullet lines, Benson voice (direct, warm, KC creator studio). No markdown headers.`,
      },
      {
        role: 'user',
        content: `Summarize these messages:\n\n${lines.join('\n')}`,
      },
    ],
  });

  const promptTokens = response.usage?.prompt_tokens ?? 0;
  const completionTokens = response.usage?.completion_tokens ?? 0;
  await recordLlmUsage({
    source: 'gmail_digest',
    model: 'gpt-4o-mini',
    promptTokens,
    completionTokens,
    estimatedCost: estimateMiniCost(promptTokens, completionTokens),
    metadata: { category, messageCount: messages.length },
  });

  return response.choices[0]?.message?.content?.trim() ?? templateSummary;
}

function classifySummaries(summaries: GmailMessageSummary[]): ClassifiedSummary[] {
  return summaries.map((msg) => {
    const classified = classifyInboundEmail({
      headers: msg.headers,
      subject: msg.subject ?? '',
      bodyText: msg.snippet ?? '',
      fromEmail: msg.fromEmail,
    });
    return {
      ...msg,
      emailCategory:
        classified.inboxFilter === 'subscription_confirmation'
          ? 'subscription_confirmation'
          : classified.emailCategory,
      discoveryIntent: classified.discoveryIntent,
      channelId: classified.channelId,
      originalRecipient: classified.originalRecipient,
      matchedHeader: classified.matchedHeader,
    };
  });
}

async function verificationStatusForConfirmation(messages: ClassifiedSummary[]): Promise<string | null> {
  if (messages.length === 0) return null;
  const gmailIds = messages.map((m) => m.id);
  const rows = await db
    .select({
      gmailMessageId: discoveryEmailMessages.gmailMessageId,
      verificationResult: discoverySubscriptions.verificationResult,
      status: discoverySubscriptions.status,
      manualReviewReason: discoverySubscriptions.manualReviewReason,
    })
    .from(discoveryEmailMessages)
    .leftJoin(
      discoverySubscriptions,
      eq(discoverySubscriptions.confirmationMessageId, discoveryEmailMessages.id),
    )
    .where(inArray(discoveryEmailMessages.gmailMessageId, gmailIds));

  if (rows.length === 0) return 'needs manual confirmation';
  const line = subscriptionConfirmationTelegramStatus(rows[0] ?? {});
  return `Status: ${line}`;
}

export async function runGmailTelegramDigest(): Promise<GmailDigestResult> {
  if (!env.GMAIL_DIGEST_ENABLED) {
    return { ok: false, skipped: 'digest_disabled', newMessages: 0, telegramSent: false, errors: [] };
  }

  const status = await getGmailConnectionStatus();
  if (status.status !== 'connected') {
    return { ok: false, skipped: 'gmail_not_connected', newMessages: 0, telegramSent: false, errors: [] };
  }

  const messageIds = await listGmailMessageIds(buildDigestUnreadQuery(), digestMessageCap());
  if (messageIds.length === 0) {
    await db
      .insert(gmailSyncState)
      .values({ id: 'default', lastDigestAt: new Date(), updatedAt: new Date() })
      .onConflictDoUpdate({
        target: gmailSyncState.id,
        set: { lastDigestAt: new Date(), updatedAt: new Date() },
      });
    return { ok: true, newMessages: 0, telegramSent: false, errors: [] };
  }

  const already = await db
    .select({ id: gmailDigestMessages.gmailMessageId })
    .from(gmailDigestMessages)
    .where(inArray(gmailDigestMessages.gmailMessageId, messageIds));
  const seen = new Set(already.map((r) => r.id));
  const freshIds = messageIds.filter((id) => !seen.has(id));
  if (freshIds.length === 0) {
    return { ok: true, newMessages: 0, telegramSent: false, errors: [] };
  }

  const summaries = classifySummaries(await fetchGmailMessageSummaries(freshIds));
  const batchId = randomUUID();
  const inboxUrl = `${publicAppBase()}/email/inbox`;
  const now = new Date();

  const groups = new Map<EmailCategory | 'subscription_confirmation', ClassifiedSummary[]>();
  for (const msg of summaries) {
    const key = msg.emailCategory;
    const list = groups.get(key) ?? [];
    list.push(msg);
    groups.set(key, list);
  }

  let telegramSent = false;
  const errors: string[] = [];
  let batches = 0;
  let autoHarvested = 0;

  for (const [category, messages] of groups) {
    const summaryText = await summarizeBatch(category, messages);
    const verificationStatusLine =
      category === 'subscription_confirmation'
        ? await verificationStatusForConfirmation(messages)
        : null;
    const telegramBody = formatTelegramDigestBody({
      category,
      messages,
      summaryText,
      inboxUrl,
      verificationStatusLine,
    });
    const telegram = await sendTelegramMessage(telegramBody);
    if (telegram.sent) {
      telegramSent = true;
      batches += 1;
    } else {
      errors.push(telegram.reason ?? `telegram_failed_${category}`);
    }

    for (const msg of messages) {
      await db
        .insert(gmailDigestMessages)
        .values({
          gmailMessageId: msg.id,
          gmailThreadId: msg.threadId,
          fromEmail: msg.fromEmail,
          fromName: msg.fromName,
          subject: msg.subject,
          snippet: msg.snippet,
          summarizedAt: now,
          telegramSentAt: telegram.sent ? now : null,
          digestBatchId: batchId,
          channelId: msg.channelId,
          emailCategory: category === 'subscription_confirmation' ? 'discovery' : category,
          discoveryIntent: msg.discoveryIntent,
          originalRecipient: msg.originalRecipient,
          matchedHeader: msg.matchedHeader,
          receivedAt: msg.internalDate,
        })
        .onConflictDoUpdate({
          target: gmailDigestMessages.gmailMessageId,
          set: {
            channelId: msg.channelId,
            emailCategory: category === 'subscription_confirmation' ? 'discovery' : category,
            discoveryIntent: msg.discoveryIntent,
            originalRecipient: msg.originalRecipient,
            matchedHeader: msg.matchedHeader,
            fromName: msg.fromName,
            receivedAt: msg.internalDate,
            ...(telegram.sent ? { telegramSentAt: now } : {}),
            digestBatchId: batchId,
          },
        });
    }
  }

  for (const msg of summaries) {
    try {
      const harvested = await tryAutoHarvestDigestMessage(msg.id);
      if (harvested?.contentItemId) autoHarvested += 1;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : `auto_harvest_${msg.id}`);
    }
    try {
      await tryAutoPipelineSponsorInbox(msg.id, msg.emailCategory);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : `auto_pipeline_${msg.id}`);
    }
    if (msg.channelId === 'sponsors') {
      try {
        await processCreatorEmailMatchFromGmailId(msg.id, {
          emailCategory: msg.emailCategory,
          source: 'gmail-inbox-digest',
        });
      } catch (err) {
        errors.push(err instanceof Error ? err.message : `creator_email_match_${msg.id}`);
      }
    }
  }

  await db
    .insert(gmailSyncState)
    .values({ id: 'default', lastDigestAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: gmailSyncState.id,
      set: { lastDigestAt: now, updatedAt: now },
    });

  await maybeAlertBudgetExceeded();

  return {
    ok: true,
    newMessages: summaries.length,
    telegramSent,
    errors,
    batches,
    autoHarvested,
  };
}

export async function getGmailInboxSyncStatus(): Promise<{
  lastInboxSyncAt: string | null;
  lastDigestAt: string | null;
  digestEnabled: boolean;
}> {
  const rows = await db.select().from(gmailSyncState).where(eq(gmailSyncState.id, 'default')).limit(1);
  const row = rows[0];
  return {
    lastInboxSyncAt: row?.lastInboxSyncAt?.toISOString() ?? null,
    lastDigestAt: row?.lastDigestAt?.toISOString() ?? null,
    digestEnabled: env.GMAIL_DIGEST_ENABLED,
  };
}
