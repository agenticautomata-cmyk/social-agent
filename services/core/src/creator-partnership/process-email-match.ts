import { headerValue, parseFromHeader } from '../gmail-inbox/client.js';
import { fetchDiscoveryMessage } from '../gmail-inbox/message-parse.js';
import { tryCreatePartnershipActivityFromEmail, loadPartnershipFingerprintCandidates } from './activities.js';
import { pickBestPartnershipMatch } from './email-match.js';
import { classifyEmailIntent, shouldAllowPlatformMatching } from './email-intent.js';
import { inferEmailActivity } from './infer-email-activity.js';
import { logCreatorEmailMatch } from './match-log.js';
import { tryCreatePlatformActivityFromEmail } from './platform-activities.js';
import type { PlatformActivityView } from './platform-activities.js';
import type { PartnershipActivityView } from './types.js';

export type ProcessEmailMatchInput = {
  gmailMessageId: string;
  gmailThreadId: string | null;
  senderEmail: string | null;
  senderDomain: string | null;
  subject: string;
  bodyText: string;
  snippet: string | null;
  receivedAt?: Date | null;
  emailCategory?: string | null;
  source?: string;
};

export type ProcessEmailMatchResult = {
  platform: {
    created: boolean;
    skipped?: boolean;
    activity: PlatformActivityView | null;
    reason?: string;
  };
  partnership: {
    created: boolean;
    skipped?: boolean;
    matched: boolean;
    confidence: number | null;
    activity: PartnershipActivityView | null;
    reason?: string;
  };
};

function resolveSenderDomain(input: ProcessEmailMatchInput): string | null {
  if (input.senderDomain) return input.senderDomain.toLowerCase();
  if (input.senderEmail?.includes('@')) {
    return input.senderEmail.split('@')[1]?.toLowerCase() ?? null;
  }
  return null;
}

function shouldAttemptPlatformActivity(
  inferred: ReturnType<typeof inferEmailActivity>,
  senderDomain: string | null,
  subject: string,
  bodyText: string,
): boolean {
  const intent = classifyEmailIntent({ subject, bodyText, senderDomain });
  if (shouldAllowPlatformMatching(intent)) return true;
  if (inferred.entityType === 'platform' && intent.intent === 'platform_creator') return true;
  return false;
}

export async function processCreatorEmailMatch(
  input: ProcessEmailMatchInput,
): Promise<ProcessEmailMatchResult> {
  const senderDomain = resolveSenderDomain(input);
  const source = input.source ?? 'unknown';

  logCreatorEmailMatch('email_received', {
    gmailMessageId: input.gmailMessageId,
    gmailThreadId: input.gmailThreadId,
    subject: input.subject?.slice(0, 200) ?? null,
    senderDomain,
    emailCategory: input.emailCategory ?? null,
    source,
  });

  const emailIntent = classifyEmailIntent({
    subject: input.subject,
    bodyText: input.bodyText,
    senderDomain,
  });

  logCreatorEmailMatch('email_intent_classification', {
    gmailMessageId: input.gmailMessageId,
    intent: emailIntent.intent,
    signals: emailIntent.signals,
  });

  const preliminaryInfer = inferEmailActivity({
    subject: input.subject,
    bodyText: input.bodyText,
    senderDomain,
    receivedAt: input.receivedAt ?? undefined,
  });

  logCreatorEmailMatch('sponsor_classification', {
    gmailMessageId: input.gmailMessageId,
    activityType: preliminaryInfer.activityType,
    entityType: preliminaryInfer.entityType,
    entityName: preliminaryInfer.entityName,
    emailCategory: input.emailCategory ?? null,
  });

  let platformResult: ProcessEmailMatchResult['platform'] = {
    created: false,
    activity: null,
    reason: 'not_platform_email',
  };

  if (shouldAttemptPlatformActivity(preliminaryInfer, senderDomain, input.subject, input.bodyText)) {
    const platform = await tryCreatePlatformActivityFromEmail({ ...input, senderDomain });
    platformResult = {
      created: platform.created,
      skipped: !platform.created && platform.reason === 'duplicate',
      activity: platform.activity,
      reason: platform.reason,
    };
    logCreatorEmailMatch('platform_activity_outcome', {
      gmailMessageId: input.gmailMessageId,
      created: platform.created,
      skipped: platformResult.skipped ?? false,
      reason: platform.reason ?? null,
      activityType: platform.activity?.activityType ?? null,
      platformName: platform.activity?.platformName ?? null,
      suggestedAction: platform.activity?.suggestedAction ?? null,
      followUpAt: platform.activity?.followUpAt ?? null,
    });
  }

  const candidates = await loadPartnershipFingerprintCandidates();
  const linkedPartnershipIds: string[] = [];
  const matchPreview = pickBestPartnershipMatch(
    {
      subject: input.subject,
      bodyText: input.bodyText,
      senderEmail: input.senderEmail,
      senderDomain,
      gmailThreadId: input.gmailThreadId,
      intent: emailIntent,
      linkedPartnershipIds,
    },
    candidates,
  );

  logCreatorEmailMatch('partnership_match_score', {
    gmailMessageId: input.gmailMessageId,
    matched: matchPreview != null,
    confidence: matchPreview?.confidence ?? null,
    matchedOn: matchPreview?.matchedOn ?? null,
    partnershipId: matchPreview?.partnershipId ?? null,
    emailIntent: emailIntent.intent,
  });

  const partnership = await tryCreatePartnershipActivityFromEmail({ ...input, senderDomain });

  logCreatorEmailMatch('partnership_activity_outcome', {
    gmailMessageId: input.gmailMessageId,
    created: partnership.created,
    skipped: !partnership.created && partnership.reason === 'duplicate',
    matched: matchPreview != null,
    reason: partnership.reason ?? null,
    activityId: partnership.activity?.id ?? null,
    suggestedStatus: partnership.activity?.suggestedStatus ?? null,
    suggestedAction: partnership.activity?.suggestedAction ?? null,
  });

  return {
    platform: platformResult,
    partnership: {
      created: partnership.created,
      skipped: !partnership.created && partnership.reason === 'duplicate',
      matched: matchPreview != null,
      confidence: matchPreview?.confidence ?? null,
      activity: partnership.activity,
      reason: partnership.reason,
    },
  };
}

export async function processCreatorEmailMatchFromGmailId(
  gmailMessageId: string,
  opts?: { emailCategory?: string | null; source?: string },
): Promise<ProcessEmailMatchResult | { ok: false; reason: string }> {
  const message = await fetchDiscoveryMessage(gmailMessageId);
  if (!message) return { ok: false, reason: 'message_not_found' };

  const subject = headerValue(message.headers, 'Subject') ?? message.snippet ?? '';
  const parsedFrom = parseFromHeader(headerValue(message.headers, 'From') ?? '');

  return processCreatorEmailMatch({
    gmailMessageId: message.id,
    gmailThreadId: message.threadId,
    senderEmail: parsedFrom.email,
    senderDomain: parsedFrom.email?.split('@')[1]?.toLowerCase() ?? null,
    subject,
    bodyText: message.bodyText,
    snippet: message.bodyText.slice(0, 240) || message.snippet,
    receivedAt: message.internalDate,
    emailCategory: opts?.emailCategory ?? null,
    source: opts?.source ?? 'gmail_fetch',
  });
}
