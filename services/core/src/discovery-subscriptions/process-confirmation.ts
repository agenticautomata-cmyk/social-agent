import { classifyDiscoveryEmail } from './classify.js';
import { CONFIRMATION_WINDOW_DAYS, VERIFICATION_CODE_EXPIRY_HOURS } from './constants.js';
import {
  domainFromEmail,
  domainFromUrl,
  extractUrlsFromHtml,
  extractUrlsFromText,
  extractVerificationCode,
  pickConfirmationLink,
  sanitizeUrlForDisplay,
} from './extract.js';
import {
  assertPublicHost,
  isAllowedConfirmationDestination,
  safeConfirmSubscriptionLink,
  validateConfirmationUrl,
} from './safe-fetch.js';
import {
  createDiscoverySubscription,
  findMatchingSignup,
  hasCompletedVerificationForMessage,
  linkDiscoveryMessageToSubscription,
  recordVerificationAttempt,
  updateDiscoverySubscription,
  type DiscoverySubscriptionRecord,
} from './store.js';

export type ConfirmationProcessInput = {
  discoveryMessageId: string;
  gmailMessageId: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  senderEmail?: string | null;
  senderName?: string | null;
  receivedAt?: Date | null;
  urls?: string[];
};

export type ConfirmationProcessResult = {
  ok: boolean;
  subscriptionId?: string;
  status?: string;
  manualReviewReason?: string;
  autoVerified?: boolean;
  skippedReason?: string;
};

function isWithinConfirmationWindow(receivedAt: Date, signupAt: string): boolean {
  const signupMs = new Date(signupAt).getTime();
  const windowMs = CONFIRMATION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return receivedAt.getTime() - signupMs <= windowMs && receivedAt.getTime() >= signupMs - 60_000;
}

function isCodeExpired(receivedAt: Date): boolean {
  return receivedAt.getTime() > Date.now() - VERIFICATION_CODE_EXPIRY_HOURS * 60 * 60 * 1000;
}

async function manualReview(
  subscription: DiscoverySubscriptionRecord | null,
  input: ConfirmationProcessInput,
  reason: string,
  confirmationLink: string | null,
  verificationCode: string | null,
): Promise<ConfirmationProcessResult> {
  let sub = subscription;
  if (!sub) {
    sub = await createDiscoverySubscription({
      sourceName: input.senderName ?? input.senderEmail ?? 'Unknown source',
      signupDomain: domainFromEmail(input.senderEmail),
      expectedSenderDomain: domainFromEmail(input.senderEmail),
      status: 'manual_action_required',
      metadata: { unmatchedConfirmation: true },
    });
  }

  sub = await updateDiscoverySubscription(sub.id, {
    status: 'manual_action_required',
    confirmationMessageId: input.discoveryMessageId,
    confirmationLink,
    verificationCode,
    manualReviewReason: reason,
    verificationAttemptedAt: new Date(),
    verificationResult: 'manual_required',
    verificationFailureReason: reason,
  });

  await recordVerificationAttempt({
    subscriptionId: sub.id,
    gmailMessageId: input.gmailMessageId,
    method: 'blocked',
    result: 'manual_required',
    failureReason: reason,
    sanitizedLinkDomain: confirmationLink ? domainFromUrl(confirmationLink) : null,
  });

  await linkDiscoveryMessageToSubscription(
    input.discoveryMessageId,
    sub.id,
    'discovery_subscription_confirmation',
    'confirmation_manual',
  );

  return {
    ok: true,
    subscriptionId: sub.id,
    status: sub.status,
    manualReviewReason: reason,
    autoVerified: false,
  };
}

export async function processSubscriptionConfirmationEmail(
  input: ConfirmationProcessInput,
): Promise<ConfirmationProcessResult> {
  const classification = classifyDiscoveryEmail(input);
  const receivedAt = input.receivedAt ?? new Date();

  const urls = [
    ...(input.urls ?? []),
    ...extractUrlsFromText(input.bodyText),
    ...(input.bodyHtml ? extractUrlsFromHtml(input.bodyHtml) : []),
  ];
  const confirmationLink = pickConfirmationLink(urls);
  const verificationCode = extractVerificationCode(`${input.bodyText}\n${input.bodyHtml ?? ''}`);

  if (classification.blockedReason || classification.requiresManualReview) {
    return manualReview(
      null,
      input,
      classification.blockedReason ?? 'blocked_confirmation_type',
      confirmationLink,
      verificationCode,
    );
  }

  let subscription = await findMatchingSignup({
    senderEmail: input.senderEmail,
    confirmationLink,
    sourceNameHint: input.senderName ?? undefined,
    receivedAt,
  });

  if (!subscription) {
    return manualReview(
      null,
      input,
      'unmatched_confirmation_email',
      confirmationLink,
      verificationCode,
    );
  }

  if (!isWithinConfirmationWindow(receivedAt, subscription.signupAt)) {
    return manualReview(subscription, input, 'confirmation_window_expired', confirmationLink, verificationCode);
  }

  if (subscription.status === 'verified' || subscription.status === 'active') {
    await linkDiscoveryMessageToSubscription(
      input.discoveryMessageId,
      subscription.id,
      'discovery_subscription_confirmation',
      'confirmation_processed',
    );
    await recordVerificationAttempt({
      subscriptionId: subscription.id,
      gmailMessageId: input.gmailMessageId,
      method: 'auto_link',
      result: 'skipped',
      failureReason: 'already_verified',
    });
    return {
      ok: true,
      subscriptionId: subscription.id,
      status: subscription.status,
      skippedReason: 'already_verified',
      autoVerified: false,
    };
  }

  if (await hasCompletedVerificationForMessage(subscription.id, input.gmailMessageId)) {
    return {
      ok: true,
      subscriptionId: subscription.id,
      status: subscription.status,
      skippedReason: 'duplicate_confirmation',
      autoVerified: false,
    };
  }

  subscription = await updateDiscoverySubscription(subscription.id, {
    status: 'confirmation_received',
    confirmationMessageId: input.discoveryMessageId,
    confirmationLink,
    verificationCode,
  });

  if (verificationCode && !confirmationLink) {
    return manualReview(
      subscription,
      input,
      'verification_code_requires_manual_entry',
      confirmationLink,
      verificationCode,
    );
  }

  if (!confirmationLink) {
    return manualReview(subscription, input, 'no_confirmation_link_found', null, verificationCode);
  }

  const urlBlock = validateConfirmationUrl(confirmationLink);
  if (urlBlock) {
    return manualReview(subscription, input, urlBlock, confirmationLink, verificationCode);
  }

  const dnsBlock = await assertPublicHost(new URL(confirmationLink).hostname);
  if (dnsBlock) {
    return manualReview(subscription, input, dnsBlock, confirmationLink, verificationCode);
  }

  if (
    !isAllowedConfirmationDestination({
      linkUrl: confirmationLink,
      signupDomain: subscription.signupDomain,
      expectedSenderDomain: subscription.expectedSenderDomain,
      senderDomain: domainFromEmail(input.senderEmail),
    })
  ) {
    return manualReview(subscription, input, 'domain_mismatch', confirmationLink, verificationCode);
  }

  if (verificationCode && isCodeExpired(receivedAt)) {
    return manualReview(subscription, input, 'verification_code_expired', confirmationLink, verificationCode);
  }

  const fetchResult = await safeConfirmSubscriptionLink(confirmationLink);

  if (!fetchResult.ok) {
    await recordVerificationAttempt({
      subscriptionId: subscription.id,
      gmailMessageId: input.gmailMessageId,
      method: 'auto_link',
      result: fetchResult.blocked ? 'blocked' : 'failed',
      failureReason: fetchResult.blocked ?? 'confirmation_not_detected',
      finalUrl: fetchResult.finalUrl ? sanitizeUrlForDisplay(fetchResult.finalUrl) : null,
      redirectCount: fetchResult.redirectCount ?? null,
      httpStatus: fetchResult.httpStatus ?? null,
      sanitizedLinkDomain: domainFromUrl(confirmationLink),
    });

    return manualReview(
      subscription,
      input,
      fetchResult.blocked ?? 'automatic_verification_failed',
      confirmationLink,
      verificationCode,
    );
  }

  subscription = await updateDiscoverySubscription(subscription.id, {
    status: 'verified',
    verificationAttemptedAt: new Date(),
    verificationResult: 'success',
    verificationFailureReason: null,
    manualReviewReason: null,
  });

  await recordVerificationAttempt({
    subscriptionId: subscription.id,
    gmailMessageId: input.gmailMessageId,
    method: 'auto_link',
    result: 'success',
    finalUrl: fetchResult.finalUrl ? sanitizeUrlForDisplay(fetchResult.finalUrl) : null,
    redirectCount: fetchResult.redirectCount ?? null,
    httpStatus: fetchResult.httpStatus ?? null,
    sanitizedLinkDomain: domainFromUrl(confirmationLink),
  });

  await linkDiscoveryMessageToSubscription(
    input.discoveryMessageId,
    subscription.id,
    'discovery_subscription_confirmation',
    'confirmation_processed',
  );

  return {
    ok: true,
    subscriptionId: subscription.id,
    status: 'verified',
    autoVerified: true,
  };
}

export async function markSubscriptionVerifiedManually(id: string): Promise<DiscoverySubscriptionRecord> {
  return updateDiscoverySubscription(id, {
    status: 'active',
    verificationResult: 'manual_success',
    verificationAttemptedAt: new Date(),
    manualReviewReason: null,
    verificationFailureReason: null,
  });
}

export async function dismissSubscriptionReview(id: string): Promise<DiscoverySubscriptionRecord> {
  return updateDiscoverySubscription(id, {
    status: 'verification_failed',
    verificationResult: 'dismissed',
    manualReviewReason: null,
  });
}

export async function blockSubscriptionSender(id: string): Promise<DiscoverySubscriptionRecord> {
  return updateDiscoverySubscription(id, {
    blockedSender: true,
    status: 'unsubscribed',
    verificationResult: 'sender_blocked',
  });
}
