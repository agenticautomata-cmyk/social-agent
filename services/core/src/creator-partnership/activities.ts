import { and, desc, eq, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { creatorPartnershipActivities, creatorPartnerships } from '../schema.js';
import { pickBestPartnershipMatch, requiresConfirmation } from './email-match.js';
import {
  classifyEmailIntent,
  shouldBlockPartnershipMatching,
  type EmailIntent,
} from './email-intent.js';
import { buildPartnershipFingerprints } from './fingerprints.js';
import { inferEmailActivity, sanitizeSuggestedStatus } from './infer-email-activity.js';
import type {
  PartnershipActivityView,
  PartnershipFingerprints,
  PartnershipPipelineStatus,
  PartnershipResearch,
} from './types.js';

function mapActivity(row: typeof creatorPartnershipActivities.$inferSelect): PartnershipActivityView {
  return {
    id: row.id,
    creatorPartnershipId: row.creatorPartnershipId,
    activityType: row.activityType as PartnershipActivityView['activityType'],
    entityType: row.entityType as PartnershipActivityView['entityType'],
    entityName: row.entityName,
    gmailMessageId: row.gmailMessageId,
    gmailThreadId: row.gmailThreadId,
    senderEmail: row.senderEmail,
    senderDomain: row.senderDomain,
    subject: row.subject,
    snippet: row.snippet,
    matchConfidence: row.matchConfidence != null ? Number(row.matchConfidence) : null,
    matchedOn: row.matchedOn,
    suggestedStatus: (row.suggestedStatus as PartnershipPipelineStatus | null) ?? null,
    suggestedAction: row.suggestedAction,
    suggestedFollowUpAt: row.suggestedFollowUpAt?.toISOString() ?? null,
    requiresConfirmation: row.requiresConfirmation,
    confirmationStatus: row.confirmationStatus as PartnershipActivityView['confirmationStatus'],
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    rejectedAt: row.rejectedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function persistPartnershipFingerprints(
  partnershipId: string,
  fingerprints: PartnershipFingerprints,
): Promise<void> {
  await db
    .update(creatorPartnerships)
    .set({ fingerprints, updatedAt: new Date() })
    .where(eq(creatorPartnerships.id, partnershipId));
}

export async function loadPartnershipFingerprintCandidates(): Promise<
  Array<{ partnershipId: string; fingerprints: PartnershipFingerprints }>
> {
  const rows = await db
    .select({
      id: creatorPartnerships.id,
      brandName: creatorPartnerships.brandName,
      retailerName: creatorPartnerships.retailerName,
      research: creatorPartnerships.research,
      fingerprints: creatorPartnerships.fingerprints,
    })
    .from(creatorPartnerships)
    .where(
      or(
        sql`NOT (${creatorPartnerships.metadata} ? 'programLibrary')`,
        sql`${creatorPartnerships.metadata}->>'programLibraryMode' = 'activated'`,
      ),
    )
    .orderBy(desc(creatorPartnerships.updatedAt))
    .limit(200);

  return rows.map((row) => {
    const research = (row.research ?? {}) as PartnershipResearch;
    const fingerprints =
      (row.fingerprints as PartnershipFingerprints | null)?.brandName != null
        ? (row.fingerprints as PartnershipFingerprints)
        : buildPartnershipFingerprints({
            brandName: row.brandName,
            retailerName: row.retailerName,
            research,
          });
    return { partnershipId: row.id, fingerprints };
  });
}

async function findLinkedPartnershipIds(gmailThreadId: string | null): Promise<string[]> {
  if (!gmailThreadId) return [];
  const rows = await db
    .select({ creatorPartnershipId: creatorPartnershipActivities.creatorPartnershipId })
    .from(creatorPartnershipActivities)
    .where(
      and(
        eq(creatorPartnershipActivities.gmailThreadId, gmailThreadId),
        eq(creatorPartnershipActivities.confirmationStatus, 'confirmed'),
      ),
    );
  return rows.map((r) => r.creatorPartnershipId).filter(Boolean) as string[];
}

async function shouldSkipMessage(gmailMessageId: string): Promise<boolean> {
  return shouldSuppressDuplicateActivity(await findExistingPartnershipActivityByGmailMessage(gmailMessageId));
}

/** One Gmail message → at most one partnership activity (idempotent reprocessing). */
export async function findExistingPartnershipActivityByGmailMessage(gmailMessageId: string) {
  const [existing] = await db
    .select({
      confirmationStatus: creatorPartnershipActivities.confirmationStatus,
      creatorPartnershipId: creatorPartnershipActivities.creatorPartnershipId,
    })
    .from(creatorPartnershipActivities)
    .where(eq(creatorPartnershipActivities.gmailMessageId, gmailMessageId))
    .limit(1);
  return existing ?? null;
}

/** Exported for regression tests — rejected/confirmed Gmail matches should not reappear. */
export function shouldSuppressDuplicateActivity(
  existing: { confirmationStatus: string } | null | undefined,
): boolean {
  if (!existing) return false;
  return existing.confirmationStatus === 'rejected' || existing.confirmationStatus === 'confirmed';
}

export type CreatePartnershipActivityInput = {
  gmailMessageId: string;
  gmailThreadId: string | null;
  senderEmail: string | null;
  senderDomain: string | null;
  subject: string;
  bodyText: string;
  snippet: string | null;
  receivedAt?: Date | null;
};

export type CreatePartnershipActivityResult = {
  created: boolean;
  activity: PartnershipActivityView | null;
  reason?: string;
};

export async function tryCreatePartnershipActivityFromEmail(
  input: CreatePartnershipActivityInput,
): Promise<CreatePartnershipActivityResult> {
  const linkedPartnershipIds = await findLinkedPartnershipIds(input.gmailThreadId);
  const intent = classifyEmailIntent({
    subject: input.subject,
    bodyText: input.bodyText,
    senderDomain: input.senderDomain,
  });

  if (shouldBlockPartnershipMatching(intent, linkedPartnershipIds)) {
    return {
      created: false,
      activity: null,
      reason: `blocked_intent:${intent.intent}`,
    };
  }

  const candidates = await loadPartnershipFingerprintCandidates();
  const match = pickBestPartnershipMatch(
    {
      subject: input.subject,
      bodyText: input.bodyText,
      senderEmail: input.senderEmail,
      senderDomain: input.senderDomain,
      gmailThreadId: input.gmailThreadId,
      linkedPartnershipIds,
      intent,
    },
    candidates,
  );

  if (!match) {
    return { created: false, activity: null, reason: 'no_confident_match' };
  }

  if (await shouldSkipMessage(input.gmailMessageId)) {
    return { created: false, activity: null, reason: 'already_processed' };
  }

  const matchedFingerprints = candidates.find((c) => c.partnershipId === match.partnershipId)?.fingerprints;

  const inferred = inferEmailActivity({
    subject: input.subject,
    bodyText: input.bodyText,
    senderDomain: input.senderDomain,
    receivedAt: input.receivedAt ?? undefined,
    knownBrandNames: matchedFingerprints?.brandName ? [matchedFingerprints.brandName] : [],
    knownProgramNames: matchedFingerprints?.programNames ?? [],
  });

  const suggestedStatus = sanitizeSuggestedStatus(inferred);

  const [row] = await db
    .insert(creatorPartnershipActivities)
    .values({
      creatorPartnershipId: match.partnershipId,
      activityType: inferred.activityType,
      entityType: inferred.entityType,
      entityName: inferred.entityName,
      gmailMessageId: input.gmailMessageId,
      gmailThreadId: input.gmailThreadId,
      senderEmail: input.senderEmail,
      senderDomain: input.senderDomain,
      subject: input.subject,
      snippet: input.snippet,
      matchConfidence: match.confidence.toFixed(4),
      matchedOn: match.matchedOn,
      suggestedStatus,
      suggestedAction: inferred.suggestedAction,
      suggestedFollowUpAt: inferred.suggestedFollowUpAt,
      requiresConfirmation: requiresConfirmation(match.confidence) || inferred.entityType === 'platform',
      confirmationStatus: 'pending',
      metadata: { matchReasons: match.reasons, emailIntent: intent.intent, emailIntentSignals: intent.signals },
    })
    .onConflictDoNothing()
    .returning();

  if (!row) {
    return { created: false, activity: null, reason: 'duplicate' };
  }

  return { created: true, activity: mapActivity(row) };
}

export async function listPartnershipActivities(partnershipId: string): Promise<PartnershipActivityView[]> {
  const rows = await db
    .select()
    .from(creatorPartnershipActivities)
    .where(eq(creatorPartnershipActivities.creatorPartnershipId, partnershipId))
    .orderBy(desc(creatorPartnershipActivities.createdAt))
    .limit(100);
  return rows.filter((row) => row.confirmationStatus !== 'rejected').map(mapActivity);
}

export async function correctFalsePositivePartnershipActivity(input: {
  activityId: string;
  emailIntent: EmailIntent;
  correctionReason: string;
}): Promise<PartnershipActivityView | null> {
  const [activity] = await db
    .select()
    .from(creatorPartnershipActivities)
    .where(eq(creatorPartnershipActivities.id, input.activityId))
    .limit(1);
  if (!activity) return null;

  const existingMeta = (activity.metadata ?? {}) as Record<string, unknown>;

  const [row] = await db
    .update(creatorPartnershipActivities)
    .set({
      confirmationStatus: 'rejected',
      rejectedAt: new Date(),
      metadata: {
        ...existingMeta,
        emailIntent: input.emailIntent,
        correction: {
          correctedAt: new Date().toISOString(),
          reason: input.correctionReason,
          originalMatch: {
            confidence: activity.matchConfidence,
            matchedOn: activity.matchedOn,
            matchReasons: existingMeta.matchReasons ?? null,
            activityType: activity.activityType,
            suggestedStatus: activity.suggestedStatus,
          },
        },
      },
    })
    .where(eq(creatorPartnershipActivities.id, input.activityId))
    .returning();

  return row ? mapActivity(row) : null;
}

export async function confirmPartnershipActivity(activityId: string): Promise<PartnershipActivityView | null> {
  const [row] = await db
    .update(creatorPartnershipActivities)
    .set({ confirmationStatus: 'confirmed', confirmedAt: new Date() })
    .where(eq(creatorPartnershipActivities.id, activityId))
    .returning();
  return row ? mapActivity(row) : null;
}

export async function rejectPartnershipActivity(activityId: string): Promise<PartnershipActivityView | null> {
  const [row] = await db
    .update(creatorPartnershipActivities)
    .set({ confirmationStatus: 'rejected', rejectedAt: new Date() })
    .where(eq(creatorPartnershipActivities.id, activityId))
    .returning();
  return row ? mapActivity(row) : null;
}

export async function applySuggestedPartnershipStatus(input: {
  activityId: string;
  partnershipId: string;
}): Promise<{ activity: PartnershipActivityView | null; applied: boolean; reason?: string }> {
  const [activity] = await db
    .select()
    .from(creatorPartnershipActivities)
    .where(eq(creatorPartnershipActivities.id, input.activityId))
    .limit(1);
  if (!activity || activity.creatorPartnershipId !== input.partnershipId) {
    return { activity: null, applied: false, reason: 'not_found' };
  }
  if (activity.confirmationStatus === 'rejected') {
    return { activity: mapActivity(activity), applied: false, reason: 'rejected' };
  }
  if (!activity.suggestedStatus) {
    return { activity: mapActivity(activity), applied: false, reason: 'no_suggested_status' };
  }

  await db
    .update(creatorPartnerships)
    .set({
      pipelineStatus: activity.suggestedStatus,
      followUpAt: activity.suggestedFollowUpAt ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(creatorPartnerships.id, input.partnershipId));

  const confirmed = await confirmPartnershipActivity(input.activityId);
  return { activity: confirmed, applied: true };
}

export async function getGmailOpenUrl(gmailMessageId: string): Promise<string> {
  return `https://mail.google.com/mail/u/0/#inbox/${gmailMessageId}`;
}
