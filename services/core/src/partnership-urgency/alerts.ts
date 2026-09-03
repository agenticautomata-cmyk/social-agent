/**
 * Storage for urgent partnership alerts.
 *
 * Two behaviours matter here and are enforced by the table rather than by hope:
 * `event_key` is unique, so the same event cannot alert twice however many times a
 * worker re-runs; and resolving an alert moves it out of urgent, so a reply Kellie has
 * already answered stops shouting.
 */

import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { db } from '../db.js';
import { partnershipUrgentAlerts } from '../schema.js';
import type { UrgencyReason } from './classify.js';
import { formatUrgentAlert, type UrgentAlertContent } from './message.js';

export type UrgentAlertState = 'urgent' | 'notified' | 'resolved' | 'suppressed';

export type RecordedAlert = {
  id: string;
  eventKey: string;
  state: UrgentAlertState;
  /** True when this call created the alert, so only then should Telegram fire. */
  isNew: boolean;
  message: string;
};

/**
 * Records an urgent alert, or returns the existing one untouched.
 *
 * Returning `isNew: false` for an event already on file is what prevents duplicate
 * Telegram messages when a worker re-processes the same inbox.
 */
export async function recordUrgentAlert(input: {
  eventKey: string;
  content: UrgentAlertContent;
  businessKey: string;
  opportunityId?: string | null;
  outreachEmailId?: string | null;
  inboundMessageId?: string | null;
}): Promise<RecordedAlert> {
  const existing = await db
    .select({
      id: partnershipUrgentAlerts.id,
      state: partnershipUrgentAlerts.state,
    })
    .from(partnershipUrgentAlerts)
    .where(eq(partnershipUrgentAlerts.eventKey, input.eventKey))
    .limit(1);

  const message = formatUrgentAlert(input.content);

  if (existing[0]) {
    return {
      id: existing[0].id,
      eventKey: input.eventKey,
      state: existing[0].state as UrgentAlertState,
      isNew: false,
      message,
    };
  }

  const inserted = await db
    .insert(partnershipUrgentAlerts)
    .values({
      eventKey: input.eventKey,
      urgencyReason: input.content.reason,
      businessName: input.content.businessName,
      opportunityId: input.opportunityId ?? null,
      outreachEmailId: input.outreachEmailId ?? null,
      inboundMessageId: input.inboundMessageId ?? null,
      whatChanged: input.content.whatChanged,
      compensationSummary: input.content.compensationSummary,
      deadlineAt: input.content.deadlineAt ? new Date(input.content.deadlineAt) : null,
      deadlineTimezone: input.content.deadlineTimezone,
      contactConfidenceLabel: input.content.contactEvidenceState,
      recommendedAction: input.content.recommendedAction,
      deepLink: input.content.deepLink,
      state: 'urgent',
    })
    .returning({ id: partnershipUrgentAlerts.id });

  return {
    id: inserted[0]!.id,
    eventKey: input.eventKey,
    state: 'urgent',
    isNew: true,
    message,
  };
}

/** Marks an alert as delivered, so a retry does not re-send it. */
export async function markUrgentAlertNotified(
  id: string,
  outcome: { error?: string | null } = {},
): Promise<void> {
  await db
    .update(partnershipUrgentAlerts)
    .set({
      state: outcome.error ? 'urgent' : 'notified',
      telegramSentAt: outcome.error ? null : new Date(),
      telegramError: outcome.error ?? null,
      updatedAt: new Date(),
    })
    .where(eq(partnershipUrgentAlerts.id, id));
}

/**
 * Resolves alerts, which is how they leave urgent.
 *
 * Called when the underlying thing is dealt with — a reply answered, a failed send
 * retried successfully, a deadline passed.
 */
export async function resolveUrgentAlerts(input: {
  eventKeys?: string[];
  outreachEmailId?: string | null;
  inboundMessageId?: string | null;
  reason: string;
}): Promise<number> {
  const conditions = [
    inArray(partnershipUrgentAlerts.state, ['urgent', 'notified']),
  ];
  if (input.eventKeys?.length) {
    conditions.push(inArray(partnershipUrgentAlerts.eventKey, input.eventKeys));
  }
  if (input.outreachEmailId) {
    conditions.push(eq(partnershipUrgentAlerts.outreachEmailId, input.outreachEmailId));
  }
  if (input.inboundMessageId) {
    conditions.push(eq(partnershipUrgentAlerts.inboundMessageId, input.inboundMessageId));
  }
  // Without a target this would resolve everything, so refuse rather than guess.
  if (conditions.length === 1) return 0;

  const updated = await db
    .update(partnershipUrgentAlerts)
    .set({
      state: 'resolved',
      resolvedAt: new Date(),
      resolutionReason: input.reason,
      updatedAt: new Date(),
    })
    .where(and(...conditions))
    .returning({ id: partnershipUrgentAlerts.id });

  return updated.length;
}

/** Expires alerts whose deadline has passed, so stale urgency does not accumulate. */
export async function expirePastDeadlineAlerts(): Promise<number> {
  const updated = await db
    .update(partnershipUrgentAlerts)
    .set({
      state: 'resolved',
      resolvedAt: new Date(),
      resolutionReason: 'The deadline passed without action.',
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(partnershipUrgentAlerts.state, ['urgent', 'notified']),
        sql`${partnershipUrgentAlerts.deadlineAt} IS NOT NULL`,
        sql`${partnershipUrgentAlerts.deadlineAt} < now()`,
      ),
    )
    .returning({ id: partnershipUrgentAlerts.id });

  return updated.length;
}

export type UrgentAlertRow = {
  id: string;
  eventKey: string;
  reason: UrgencyReason;
  businessName: string;
  whatChanged: string;
  compensationSummary: string | null;
  deadlineAt: string | null;
  contactConfidenceLabel: string | null;
  recommendedAction: string;
  deepLink: string;
  state: UrgentAlertState;
  createdAt: string;
};

/** Everything currently urgent, newest first. */
export async function listUrgentAlerts(): Promise<UrgentAlertRow[]> {
  const rows = await db
    .select()
    .from(partnershipUrgentAlerts)
    .where(
      and(
        inArray(partnershipUrgentAlerts.state, ['urgent', 'notified']),
        isNull(partnershipUrgentAlerts.resolvedAt),
      ),
    )
    .orderBy(desc(partnershipUrgentAlerts.createdAt));

  return rows.map((row) => ({
    id: row.id,
    eventKey: row.eventKey,
    reason: row.urgencyReason as UrgencyReason,
    businessName: row.businessName,
    whatChanged: row.whatChanged,
    compensationSummary: row.compensationSummary,
    deadlineAt: row.deadlineAt ? row.deadlineAt.toISOString() : null,
    contactConfidenceLabel: row.contactConfidenceLabel,
    recommendedAction: row.recommendedAction,
    deepLink: row.deepLink,
    state: row.state as UrgentAlertState,
    createdAt: row.createdAt.toISOString(),
  }));
}
