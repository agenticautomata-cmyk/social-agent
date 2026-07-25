import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { db } from '../db.js';
import {
  discoveryEmailMessages,
  discoverySubscriptions,
  discoveryVerificationAttempts,
} from '../schema.js';
import type { DiscoverySubscriptionStatus } from './constants.js';
import { CONFIRMATION_WINDOW_DAYS } from './constants.js';
import { domainFromEmail, domainFromUrl, rootDomain } from './extract.js';

export type DiscoverySubscriptionRecord = {
  id: string;
  sourceName: string;
  signupDomain: string | null;
  signupUrl: string | null;
  emailAddress: string;
  signupAt: string;
  expectedSenderDomain: string | null;
  status: DiscoverySubscriptionStatus;
  confirmationMessageId: string | null;
  confirmationLink: string | null;
  verificationCode: string | null;
  verificationAttemptedAt: string | null;
  verificationResult: string | null;
  verificationFailureReason: string | null;
  manualReviewReason: string | null;
  blockedSender: boolean;
  lastEmailReceivedAt: string | null;
  lastUsefulOpportunityAt: string | null;
  lastOpportunityContentItemId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

function rowToRecord(row: typeof discoverySubscriptions.$inferSelect): DiscoverySubscriptionRecord {
  return {
    id: row.id,
    sourceName: row.sourceName,
    signupDomain: row.signupDomain,
    signupUrl: row.signupUrl,
    emailAddress: row.emailAddress,
    signupAt: row.signupAt.toISOString(),
    expectedSenderDomain: row.expectedSenderDomain,
    status: row.status as DiscoverySubscriptionStatus,
    confirmationMessageId: row.confirmationMessageId,
    confirmationLink: row.confirmationLink,
    verificationCode: row.verificationCode,
    verificationAttemptedAt: row.verificationAttemptedAt?.toISOString() ?? null,
    verificationResult: row.verificationResult,
    verificationFailureReason: row.verificationFailureReason,
    manualReviewReason: row.manualReviewReason,
    blockedSender: row.blockedSender,
    lastEmailReceivedAt: row.lastEmailReceivedAt?.toISOString() ?? null,
    lastUsefulOpportunityAt: row.lastUsefulOpportunityAt?.toISOString() ?? null,
    lastOpportunityContentItemId: row.lastOpportunityContentItemId,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listDiscoverySubscriptions(input?: {
  status?: DiscoverySubscriptionStatus[];
  manualOnly?: boolean;
}): Promise<DiscoverySubscriptionRecord[]> {
  const rows = await db.query.discoverySubscriptions.findMany({
    orderBy: [desc(discoverySubscriptions.updatedAt)],
    limit: 200,
  });

  let filtered = rows.map(rowToRecord);
  if (input?.status?.length) {
    filtered = filtered.filter((r) => input.status!.includes(r.status));
  }
  if (input?.manualOnly) {
    filtered = filtered.filter((r) => r.status === 'manual_action_required');
  }
  return filtered;
}

export async function getDiscoverySubscription(id: string): Promise<DiscoverySubscriptionRecord | null> {
  const row = await db.query.discoverySubscriptions.findFirst({
    where: eq(discoverySubscriptions.id, id),
  });
  return row ? rowToRecord(row) : null;
}

export async function createDiscoverySubscription(input: {
  sourceName: string;
  signupDomain?: string | null;
  signupUrl?: string | null;
  emailAddress?: string;
  expectedSenderDomain?: string | null;
  status?: DiscoverySubscriptionStatus;
  metadata?: Record<string, unknown>;
}): Promise<DiscoverySubscriptionRecord> {
  const now = new Date();
  const [row] = await db
    .insert(discoverySubscriptions)
    .values({
      sourceName: input.sourceName,
      signupDomain: input.signupDomain ?? (input.signupUrl ? domainFromUrl(input.signupUrl) : null),
      signupUrl: input.signupUrl ?? null,
      emailAddress: input.emailAddress ?? 'discoveries@kckellie.com',
      expectedSenderDomain:
        input.expectedSenderDomain ??
        (input.signupUrl ? domainFromUrl(input.signupUrl) : input.signupDomain ?? null),
      status: input.status ?? 'awaiting_confirmation',
      metadata: input.metadata ?? {},
      signupAt: now,
      updatedAt: now,
    })
    .returning();
  return rowToRecord(row!);
}

export async function findMatchingSignup(input: {
  senderEmail?: string | null;
  confirmationLink?: string | null;
  sourceNameHint?: string | null;
  receivedAt?: Date;
}): Promise<DiscoverySubscriptionRecord | null> {
  const senderDomain = domainFromEmail(input.senderEmail);
  const linkDomain = domainFromUrl(input.confirmationLink ?? undefined);
  const windowStart = new Date(
    (input.receivedAt ?? new Date()).getTime() - CONFIRMATION_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  const candidates = await db.query.discoverySubscriptions.findMany({
    where: and(
      inArray(discoverySubscriptions.status, [
        'signup_submitted',
        'awaiting_confirmation',
        'confirmation_received',
      ]),
    ),
    orderBy: [desc(discoverySubscriptions.signupAt)],
    limit: 50,
  });

  const filtered = candidates.filter((row) => row.signupAt >= windowStart && !row.blockedSender);

  for (const row of filtered) {
    const signupRoot = row.signupDomain ? rootDomain(row.signupDomain) : null;
    const expectedRoot = row.expectedSenderDomain ? rootDomain(row.expectedSenderDomain) : null;
    const senderRoot = senderDomain ? rootDomain(senderDomain) : null;
    const linkRoot = linkDomain ? rootDomain(linkDomain) : null;

    if (expectedRoot && senderRoot && expectedRoot === senderRoot) return rowToRecord(row);
    if (signupRoot && senderRoot && signupRoot === senderRoot) return rowToRecord(row);
    if (signupRoot && linkRoot && signupRoot === linkRoot) return rowToRecord(row);
    if (
      input.sourceNameHint &&
      row.sourceName.toLowerCase().includes(input.sourceNameHint.toLowerCase())
    ) {
      return rowToRecord(row);
    }
  }

  return null;
}

export async function updateDiscoverySubscription(
  id: string,
  patch: Partial<{
    status: DiscoverySubscriptionStatus;
    confirmationMessageId: string | null;
    confirmationLink: string | null;
    verificationCode: string | null;
    verificationAttemptedAt: Date | null;
    verificationResult: string | null;
    verificationFailureReason: string | null;
    manualReviewReason: string | null;
    blockedSender: boolean;
    lastEmailReceivedAt: Date | null;
    lastUsefulOpportunityAt: Date | null;
    lastOpportunityContentItemId: string | null;
    metadata: Record<string, unknown>;
  }>,
): Promise<DiscoverySubscriptionRecord> {
  const [row] = await db
    .update(discoverySubscriptions)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(discoverySubscriptions.id, id))
    .returning();
  if (!row) throw new Error('Subscription not found');
  return rowToRecord(row);
}

export async function recordVerificationAttempt(input: {
  subscriptionId: string;
  gmailMessageId?: string | null;
  method: 'auto_link' | 'manual_link' | 'code_entry' | 'blocked';
  result: 'success' | 'failed' | 'blocked' | 'skipped' | 'manual_required';
  failureReason?: string | null;
  finalUrl?: string | null;
  redirectCount?: number | null;
  httpStatus?: number | null;
  sanitizedLinkDomain?: string | null;
}): Promise<void> {
  await db.insert(discoveryVerificationAttempts).values({
    subscriptionId: input.subscriptionId,
    gmailMessageId: input.gmailMessageId ?? null,
    method: input.method,
    result: input.result,
    failureReason: input.failureReason ?? null,
    finalUrl: input.finalUrl ?? null,
    redirectCount: input.redirectCount ?? null,
    httpStatus: input.httpStatus ?? null,
    sanitizedLinkDomain: input.sanitizedLinkDomain ?? null,
  });
}

export async function findActiveSubscriptionForSender(
  senderEmail?: string | null,
): Promise<DiscoverySubscriptionRecord | null> {
  const senderDomain = domainFromEmail(senderEmail);
  if (!senderDomain) return null;

  const rows = await db.query.discoverySubscriptions.findMany({
    where: and(
      inArray(discoverySubscriptions.status, ['verified', 'active']),
      eq(discoverySubscriptions.blockedSender, false),
    ),
    orderBy: [desc(discoverySubscriptions.updatedAt)],
    limit: 100,
  });

  const senderRoot = rootDomain(senderDomain);
  for (const row of rows) {
    const expected = row.expectedSenderDomain ? rootDomain(row.expectedSenderDomain) : null;
    const signup = row.signupDomain ? rootDomain(row.signupDomain) : null;
    if (expected === senderRoot || signup === senderRoot) return rowToRecord(row);
  }
  return null;
}

export async function hasCompletedVerificationForMessage(
  subscriptionId: string,
  gmailMessageId: string,
): Promise<boolean> {
  const row = await db.query.discoveryVerificationAttempts.findFirst({
    where: and(
      eq(discoveryVerificationAttempts.subscriptionId, subscriptionId),
      eq(discoveryVerificationAttempts.gmailMessageId, gmailMessageId),
      eq(discoveryVerificationAttempts.result, 'success'),
    ),
  });
  return Boolean(row);
}

export async function linkDiscoveryMessageToSubscription(
  messageId: string,
  subscriptionId: string,
  messageKind: string,
  processingStatus: string,
): Promise<void> {
  await db
    .update(discoveryEmailMessages)
    .set({
      subscriptionId,
      messageKind,
      processingStatus,
      updatedAt: new Date(),
    })
    .where(eq(discoveryEmailMessages.id, messageId));
}

export async function markSubscriptionNewsletterReceived(
  subscriptionId: string,
  receivedAt: Date,
  contentItemId?: string | null,
): Promise<void> {
  await updateDiscoverySubscription(subscriptionId, {
    lastEmailReceivedAt: receivedAt,
    ...(contentItemId
      ? { lastUsefulOpportunityAt: receivedAt, lastOpportunityContentItemId: contentItemId }
      : {}),
  });
}

export async function findBlockedSender(email?: string | null): Promise<boolean> {
  const domain = domainFromEmail(email);
  if (!domain) return false;
  const row = await db.query.discoverySubscriptions.findFirst({
    where: and(
      eq(discoverySubscriptions.blockedSender, true),
      or(
        eq(discoverySubscriptions.expectedSenderDomain, domain),
        eq(discoverySubscriptions.signupDomain, domain),
      ),
    ),
  });
  return Boolean(row);
}
