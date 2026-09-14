import { sendTelegramMessage } from '../../telegram-notifications/send.js';
import type { EditorialOpportunityCandidate } from './types.js';

export function buildEditorialOpportunityTelegram(input: {
  candidate: EditorialOpportunityCandidate;
  contentItemId: string;
  appBase?: string;
}): string {
  const base = input.appBase ?? process.env.PUBLIC_DASHBOARD_URL?.replace(/\/$/, '') ?? 'https://benson.kckellie.com';
  const c = input.candidate;
  return [
    'Benson · new editorial opportunity',
    '',
    c.businessName,
    c.summary,
    '',
    `Why: ${c.whyItMatters}`,
    `Urgency: ${c.urgency}`,
    '',
    `Review: ${base}/opportunities`,
    `Item: ${base}/content/${input.contentItemId}`,
    '',
    'No outreach sent. Human review required.',
  ].join('\n');
}

/**
 * Notify once for a genuinely new logical opportunity.
 * Caller must only invoke when created=true (not merge/reprocess).
 */
export async function notifyEditorialOpportunityOnce(input: {
  candidate: EditorialOpportunityCandidate;
  contentItemId: string;
  created: boolean;
  alreadyNotified?: boolean;
}): Promise<{ sent: boolean; skipped: boolean; reason?: string }> {
  if (!input.created || input.alreadyNotified) {
    return { sent: false, skipped: true, reason: 'duplicate_or_reprocess' };
  }
  const body = buildEditorialOpportunityTelegram({
    candidate: input.candidate,
    contentItemId: input.contentItemId,
  });
  return sendTelegramMessage(body, { requireOutreachEnabled: false });
}
