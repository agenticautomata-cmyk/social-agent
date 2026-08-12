import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { creatorPlatformActivities, creatorPlatformRelationships } from '../schema.js';
import { inferEmailActivity } from './infer-email-activity.js';
import { classifyEmailIntent, shouldAllowPlatformMatching } from './email-intent.js';
import type { PartnershipActivityType } from './types.js';

export type PlatformActivityView = {
  id: string;
  creatorPlatformRelationshipId: string;
  platformName: string;
  activityType: PartnershipActivityType;
  gmailMessageId: string;
  gmailThreadId: string | null;
  subject: string | null;
  snippet: string | null;
  suggestedAction: string | null;
  followUpAt: string | null;
  createdAt: string;
};

const PLATFORM_BY_DOMAIN: Record<string, { name: string; domain: string }> = {
  'shopmy.us': { name: 'ShopMy', domain: 'shopmy.us' },
};

function mapPlatformActivity(
  row: typeof creatorPlatformActivities.$inferSelect,
  platformName: string,
): PlatformActivityView {
  return {
    id: row.id,
    creatorPlatformRelationshipId: row.creatorPlatformRelationshipId,
    platformName,
    activityType: row.activityType as PartnershipActivityType,
    gmailMessageId: row.gmailMessageId,
    gmailThreadId: row.gmailThreadId,
    subject: row.subject,
    snippet: row.snippet,
    suggestedAction: row.suggestedAction,
    followUpAt: row.followUpAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function resolvePlatformFromDomain(senderDomain: string | null): { name: string; domain: string } | null {
  if (!senderDomain) return null;
  const normalized = senderDomain.toLowerCase().replace(/^www\./, '');
  for (const [domain, meta] of Object.entries(PLATFORM_BY_DOMAIN)) {
    if (normalized === domain || normalized.endsWith(`.${domain}`)) return meta;
  }
  return null;
}

export function isKnownPlatformDomain(senderDomain: string | null): boolean {
  return resolvePlatformFromDomain(senderDomain) != null;
}

export async function getOrCreatePlatformRelationship(
  platformName: string,
  domain: string | null,
): Promise<typeof creatorPlatformRelationships.$inferSelect> {
  const [existing] = await db
    .select()
    .from(creatorPlatformRelationships)
    .where(sql`lower(${creatorPlatformRelationships.platformName}) = ${platformName.toLowerCase()}`)
    .limit(1);
  if (existing) return existing;

  const [inserted] = await db
    .insert(creatorPlatformRelationships)
    .values({ platformName, domain, status: 'unknown' })
    .onConflictDoNothing()
    .returning();

  if (inserted) return inserted;

  const [retry] = await db
    .select()
    .from(creatorPlatformRelationships)
    .where(sql`lower(${creatorPlatformRelationships.platformName}) = ${platformName.toLowerCase()}`)
    .limit(1);
  if (!retry) throw new Error(`Failed to resolve platform relationship for ${platformName}`);
  return retry;
}

export async function findPlatformActivityByGmailMessage(gmailMessageId: string) {
  const [row] = await db
    .select({
      activity: creatorPlatformActivities,
      platformName: creatorPlatformRelationships.platformName,
    })
    .from(creatorPlatformActivities)
    .innerJoin(
      creatorPlatformRelationships,
      eq(creatorPlatformActivities.creatorPlatformRelationshipId, creatorPlatformRelationships.id),
    )
    .where(eq(creatorPlatformActivities.gmailMessageId, gmailMessageId))
    .limit(1);
  return row ?? null;
}

async function updateRelationshipFromActivity(
  relationshipId: string,
  inferred: ReturnType<typeof inferEmailActivity>,
  receivedAt: Date | null,
): Promise<void> {
  const now = new Date();
  const patch: Partial<typeof creatorPlatformRelationships.$inferInsert> = { updatedAt: now };

  switch (inferred.activityType) {
    case 'platform_application_received':
    case 'platform_submitted':
      patch.status = 'applied';
      patch.appliedAt = receivedAt ?? now;
      break;
    case 'platform_approved':
      patch.status = 'approved';
      patch.approvedAt = receivedAt ?? now;
      break;
    case 'platform_rejected':
      patch.status = 'rejected';
      patch.rejectedAt = receivedAt ?? now;
      break;
    case 'platform_setup_required':
      patch.status = 'setup_required';
      break;
    case 'platform_pending':
      patch.status = 'pending_review';
      break;
    default:
      break;
  }

  if (Object.keys(patch).length <= 1) return;

  await db
    .update(creatorPlatformRelationships)
    .set(patch)
    .where(eq(creatorPlatformRelationships.id, relationshipId));
}

export type CreatePlatformActivityInput = {
  gmailMessageId: string;
  gmailThreadId: string | null;
  senderEmail: string | null;
  senderDomain: string | null;
  subject: string;
  bodyText: string;
  snippet: string | null;
  receivedAt?: Date | null;
};

export type CreatePlatformActivityResult = {
  created: boolean;
  activity: PlatformActivityView | null;
  reason?: string;
};

export async function tryCreatePlatformActivityFromEmail(
  input: CreatePlatformActivityInput,
): Promise<CreatePlatformActivityResult> {
  const existing = await findPlatformActivityByGmailMessage(input.gmailMessageId);
  if (existing) {
    return {
      created: false,
      activity: mapPlatformActivity(existing.activity, existing.platformName),
      reason: 'duplicate',
    };
  }

  const inferred = inferEmailActivity({
    subject: input.subject,
    bodyText: input.bodyText,
    senderDomain: input.senderDomain,
    receivedAt: input.receivedAt ?? undefined,
  });

  const intent = classifyEmailIntent({
    subject: input.subject,
    bodyText: input.bodyText,
    senderDomain: input.senderDomain,
  });

  if (!shouldAllowPlatformMatching(intent)) {
    return { created: false, activity: null, reason: `blocked_intent:${intent.intent}` };
  }

  const domainMeta = resolvePlatformFromDomain(input.senderDomain);
  const isPlatform = inferred.entityType === 'platform' || domainMeta != null;

  if (!isPlatform) {
    return { created: false, activity: null, reason: 'not_platform_email' };
  }

  const platformName = inferred.entityName ?? domainMeta?.name ?? 'ShopMy';
  const domain = domainMeta?.domain ?? input.senderDomain;

  const relationship = await getOrCreatePlatformRelationship(platformName, domain);

  const [row] = await db
    .insert(creatorPlatformActivities)
    .values({
      creatorPlatformRelationshipId: relationship.id,
      activityType: inferred.activityType.startsWith('platform_')
        ? inferred.activityType
        : 'platform_notification',
      gmailMessageId: input.gmailMessageId,
      gmailThreadId: input.gmailThreadId,
      subject: input.subject,
      snippet: input.snippet,
      suggestedAction: inferred.suggestedAction,
      followUpAt: inferred.suggestedFollowUpAt,
    })
    .onConflictDoNothing()
    .returning();

  if (!row) {
    const retry = await findPlatformActivityByGmailMessage(input.gmailMessageId);
    return {
      created: false,
      activity: retry ? mapPlatformActivity(retry.activity, retry.platformName) : null,
      reason: 'duplicate',
    };
  }

  await updateRelationshipFromActivity(relationship.id, inferred, input.receivedAt ?? null);

  return {
    created: true,
    activity: mapPlatformActivity(row, relationship.platformName),
  };
}

export async function listPlatformActivities(platformName: string): Promise<PlatformActivityView[]> {
  const rows = await db
    .select({
      activity: creatorPlatformActivities,
      platformName: creatorPlatformRelationships.platformName,
    })
    .from(creatorPlatformActivities)
    .innerJoin(
      creatorPlatformRelationships,
      eq(creatorPlatformActivities.creatorPlatformRelationshipId, creatorPlatformRelationships.id),
    )
    .where(sql`lower(${creatorPlatformRelationships.platformName}) = ${platformName.toLowerCase()}`)
    .orderBy(desc(creatorPlatformActivities.createdAt))
    .limit(100);

  return rows.map((row) => mapPlatformActivity(row.activity, row.platformName));
}
