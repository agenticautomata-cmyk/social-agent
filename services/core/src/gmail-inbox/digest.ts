import OpenAI from 'openai';
import { randomUUID } from 'crypto';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { gmailDigestMessages, gmailSyncState } from '../schema.js';
import { env } from '../env.js';
import { getGmailConnectionStatus } from '../gmail-oauth/connections.js';
import { sendTelegramMessage } from '../telegram-notifications/send.js';
import type { GmailMessageSummary } from './messages.js';
import {
  fetchGmailMessageSummaries,
  listGmailMessageIds,
  PRIMARY_UNREAD_QUERY,
} from './messages.js';

export type GmailDigestResult = {
  ok: boolean;
  skipped?: string;
  newMessages: number;
  telegramSent: boolean;
  errors: string[];
};

function publicAppBase(): string {
  return (
    process.env.DASHBOARD_PUBLIC_URL?.replace(/\/$/, '') ??
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ??
    'https://benson.kckellie.com'
  );
}

async function summarizeInboxBatch(messages: GmailMessageSummary[]): Promise<string> {
  if (messages.length === 0) return '';

  const lines = messages.map(
    (m, i) =>
      `${i + 1}. From: ${m.fromName ?? m.fromEmail ?? 'unknown'} | Subject: ${m.subject ?? '(no subject)'} | Snippet: ${m.snippet ?? ''}`,
  );

  if (!env.OPENAI_API_KEY?.trim()) {
    return messages
      .slice(0, 8)
      .map((m) => `• ${m.fromName ?? m.fromEmail ?? 'Someone'} — ${m.subject ?? 'No subject'}`)
      .join('\n');
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.4,
    messages: [
      {
        role: 'system',
        content:
          'You summarize Kellie\'s sponsor Gmail inbox for a Telegram alert. Write 3-8 bullet lines, Benson voice (direct, warm, KC creator studio). Flag urgent sponsor replies. No markdown headers.',
      },
      {
        role: 'user',
        content: `Summarize these new Primary inbox messages:\n\n${lines.join('\n')}`,
      },
    ],
  });

  return response.choices[0]?.message?.content?.trim() ?? lines.join('\n');
}

export async function runGmailTelegramDigest(): Promise<GmailDigestResult> {
  if (!env.GMAIL_DIGEST_ENABLED) {
    return { ok: false, skipped: 'digest_disabled', newMessages: 0, telegramSent: false, errors: [] };
  }

  const status = await getGmailConnectionStatus();
  if (status.status !== 'connected') {
    return { ok: false, skipped: 'gmail_not_connected', newMessages: 0, telegramSent: false, errors: [] };
  }

  const messageIds = await listGmailMessageIds(PRIMARY_UNREAD_QUERY, 25);
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

  const summaries = await fetchGmailMessageSummaries(freshIds);
  const batchId = randomUUID();
  const summaryText = await summarizeInboxBatch(summaries);
  const inboxUrl = `${publicAppBase()}/email/inbox`;
  const telegramBody = `Benson · sponsor inbox (${summaries.length} new)\n\n${summaryText}\n\n→ ${inboxUrl}`;

  const telegram = await sendTelegramMessage(telegramBody);
  const now = new Date();

  for (const msg of summaries) {
    await db
      .insert(gmailDigestMessages)
      .values({
        gmailMessageId: msg.id,
        gmailThreadId: msg.threadId,
        fromEmail: msg.fromEmail,
        subject: msg.subject,
        snippet: msg.snippet,
        summarizedAt: now,
        telegramSentAt: telegram.sent ? now : null,
        digestBatchId: batchId,
      })
      .onConflictDoNothing();
  }

  await db
    .insert(gmailSyncState)
    .values({ id: 'default', lastDigestAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: gmailSyncState.id,
      set: { lastDigestAt: now, updatedAt: now },
    });

  return {
    ok: true,
    newMessages: summaries.length,
    telegramSent: telegram.sent,
    errors: telegram.sent ? [] : [telegram.reason ?? 'telegram_failed'],
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
