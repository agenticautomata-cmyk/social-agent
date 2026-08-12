import { processCreatorEmailMatch } from './process-email-match.js';

export type GmailPartnershipMatchResult = {
  matched: boolean;
  reason?: string;
  activityId?: string;
  platformActivityId?: string;
};

/** Safe, non-blocking email match — platform activity + optional partnership link. */
export async function tryMatchCreatorPartnershipEmail(input: {
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
}): Promise<GmailPartnershipMatchResult> {
  try {
    const senderDomain =
      input.senderDomain ??
      (input.senderEmail?.includes('@') ? input.senderEmail.split('@')[1]?.toLowerCase() ?? null : null);

    const result = await processCreatorEmailMatch({
      ...input,
      senderDomain,
      source: input.source ?? 'gmail_hook',
    });

    if (result.partnership.created && result.partnership.activity) {
      return {
        matched: true,
        activityId: result.partnership.activity.id,
        platformActivityId: result.platform.activity?.id,
        reason: result.partnership.reason,
      };
    }

    if (result.platform.created && result.platform.activity) {
      return {
        matched: false,
        platformActivityId: result.platform.activity.id,
        reason: 'platform_only',
      };
    }

    return {
      matched: false,
      reason: result.partnership.reason ?? result.platform.reason ?? 'no_match',
    };
  } catch (err) {
    console.warn('[creator-partnership] gmail match failed:', err);
    return { matched: false, reason: 'error' };
  }
}

export { processCreatorEmailMatch, processCreatorEmailMatchFromGmailId } from './process-email-match.js';
