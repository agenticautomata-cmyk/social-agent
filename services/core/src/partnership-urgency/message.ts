/**
 * Formats an urgent partnership alert for Telegram.
 *
 * Every alert answers the same questions in the same order, because Kellie reads these
 * on a phone: which business, what changed, what the money is, how solid the contact
 * is, by when, what to do, and where to do it.
 *
 * What must never appear: internal row ids, raw scraper text, filesystem paths, stack
 * traces, or model reasoning. A message Kellie cannot act on is worse than no message.
 */

import { contactEvidenceLabel, type ContactEvidenceState } from '../partnership-contracts/contact-evidence.js';
import { urgencyReasonLabel, type UrgencyReason } from './classify.js';

export type UrgentAlertContent = {
  reason: UrgencyReason;
  businessName: string;
  /** The opportunity in one phrase, e.g. "hosted stay around the Sept 5 showcase". */
  opportunity: string | null;
  whatChanged: string;
  /** Offered or requested compensation, in plain language. */
  compensationSummary: string | null;
  deadlineAt: string | null;
  deadlineTimezone: string | null;
  contactEvidenceState: ContactEvidenceState | null;
  recommendedAction: string;
  /** Absolute URL to the exact Benson record. Never a bare id. */
  deepLink: string;
};

/** Strips anything that would leak internals into a message Kellie reads. */
export function sanitizeForOperator(value: string | null | undefined): string {
  if (!value) return '';
  return (
    value
      // Filesystem paths and stack frames.
      .replace(/(?:\/[\w.-]+){2,}/g, '[path]')
      .replace(/\bat\s+\w+\s+\([^)]*\)/g, '')
      // Bare UUIDs — the deep link carries the identity instead.
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
  );
}

function formatDeadline(iso: string | null, timezone: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const zone = timezone ?? 'America/Chicago';
  const formatted = date.toLocaleString('en-US', {
    timeZone: zone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  // The timezone is stated because "by 5pm" is ambiguous to anyone reading later.
  const abbreviation =
    new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' })
      .formatToParts(date)
      .find((part) => part.type === 'timeZoneName')?.value ?? zone;
  return `${formatted} ${abbreviation}`;
}

export function formatUrgentAlert(content: UrgentAlertContent): string {
  const lines: string[] = [];

  lines.push(`\u{1F534} ${urgencyReasonLabel(content.reason)}`);
  lines.push('');
  lines.push(content.businessName);
  if (content.opportunity) lines.push(sanitizeForOperator(content.opportunity));
  lines.push('');
  lines.push(`What changed: ${sanitizeForOperator(content.whatChanged)}`);

  if (content.compensationSummary) {
    lines.push(`Compensation: ${sanitizeForOperator(content.compensationSummary)}`);
  }

  const deadline = formatDeadline(content.deadlineAt, content.deadlineTimezone);
  if (deadline) lines.push(`By: ${deadline}`);

  if (content.contactEvidenceState) {
    lines.push(`Contact: ${contactEvidenceLabel(content.contactEvidenceState)}`);
  }

  lines.push('');
  lines.push(`Do this: ${sanitizeForOperator(content.recommendedAction)}`);
  lines.push('');
  // A link, never a one-tap send. Approval stays a deliberate act on the page where
  // Kellie can see the exact recipient and body.
  lines.push(content.deepLink);

  return lines.join('\n');
}

/**
 * The stable identity of an urgent event, used to avoid alerting twice.
 *
 * Built from what makes the event the same event, never from a timestamp — a re-run of
 * the same check must produce the same key.
 */
export function urgentEventKey(input: {
  reason: UrgencyReason;
  businessKey: string;
  outreachEmailId?: string | null;
  inboundMessageId?: string | null;
  opportunityId?: string | null;
}): string {
  const anchor =
    input.inboundMessageId ?? input.outreachEmailId ?? input.opportunityId ?? 'no-anchor';
  return `${input.reason}:${input.businessKey}:${anchor}`;
}
