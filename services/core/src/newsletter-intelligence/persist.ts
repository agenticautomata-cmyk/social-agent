import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems } from '../schema.js';
import { normalizeBusinessKey } from '../creator-interest/normalize.js';
import type { ExtractedNewsletterItem, NewsletterParseContext, VerificationStatus } from './types.js';
import { buildLocationLabel } from './quality-gates.js';
import { entityExternalId, occurrenceExternalId } from './extract.js';
import { pickCanonicalSourceUrl } from './resolve-links.js';
import type { ResolvedLink } from './resolve-links.js';
import { parseEventDate } from '../ask-benson/listing-extract.js';
import { buildNewsletterOccurrenceFingerprint, normalizeTitleTokens } from './dedupe.js';
import { classifyVerificationStatus } from './verification.js';

export async function findExistingOccurrenceByFingerprint(fingerprint: string): Promise<{ id: string } | null> {
  const rows = await db
    .select({ id: contentItems.id })
    .from(contentItems)
    .where(sql`${contentItems.metadata}->>'occurrenceFingerprint' = ${fingerprint}`)
    .limit(1);
  return rows[0] ?? null;
}

export async function findExistingUndatedOccurrenceForMessage(input: {
  gmailMessageId: string;
  title: string;
}): Promise<{ id: string } | null> {
  const rows = await db
    .select({ id: contentItems.id, topic: contentItems.topic })
    .from(contentItems)
    .where(
      and(
        sql`${contentItems.metadata}->>'ingest' = 'newsletter_intelligence'`,
        sql`${contentItems.metadata}->>'opportunityLayer' = 'occurrence'`,
        sql`${contentItems.metadata}->'newsletterAttribution'->>'gmailMessageId' = ${input.gmailMessageId}`,
        isNull(contentItems.eventStartsAt),
      ),
    )
    .limit(25);
  const want = normalizeTitleTokens(input.title);
  return rows.find((row) => normalizeTitleTokens(row.topic) === want) ?? null;
}

export async function findExistingEntityByKey(businessKey: string): Promise<{ id: string } | null> {
  const rows = await db
    .select({ id: contentItems.id })
    .from(contentItems)
    .where(
      and(
        sql`${contentItems.metadata}->>'opportunityLayer' = 'entity'`,
        sql`${contentItems.metadata}->>'businessKey' = ${businessKey}`,
        sql`${contentItems.metadata}->>'ingest' = 'newsletter_intelligence'`,
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export function parseChicagoDateTime(date: string | null, time: string | null): Date | null {
  if (!date?.trim()) return null;
  const iso = time?.trim() ? `${date.trim()}T${time.trim()}` : date.trim();
  return parseEventDate(iso);
}

export function eventBoundsFromNewsletterItem(item: {
  startDate: string | null;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
}): { eventStartsAt: Date | null; eventEndsAt: Date | null } {
  return {
    eventStartsAt: parseChicagoDateTime(item.startDate, item.startTime),
    eventEndsAt: parseChicagoDateTime(item.endDate, item.endTime),
  };
}

function inferVerificationStatus(
  ctx: NewsletterParseContext,
  item: ExtractedNewsletterItem,
  canonicalUrl: string | null,
): VerificationStatus {
  try {
    return classifyVerificationStatus({
      senderDomain: ctx.senderDomain,
      senderEmail: ctx.senderEmail,
      officialUrl: canonicalUrl,
      item,
    });
  } catch {
    return 'newsletter_only';
  }
}

export function buildOccurrenceFingerprint(item: ExtractedNewsletterItem, canonicalUrl: string | null): string {
  return buildNewsletterOccurrenceFingerprint(item, canonicalUrl);
}

export type PersistNewsletterItemResult = {
  contentItemId: string;
  created: boolean;
  duplicateMerged: boolean;
  verificationStatus: VerificationStatus;
};

export async function persistNewsletterInventoryItem(input: {
  ctx: NewsletterParseContext;
  item: ExtractedNewsletterItem;
  sourceId: string;
  campaignId: string;
  resolvedLinks: Map<string, ResolvedLink>;
  linkedEntityContentItemId?: string | null;
  dryRun?: boolean;
}): Promise<PersistNewsletterItemResult | null> {
  const { ctx, item, sourceId, campaignId, resolvedLinks, dryRun } = input;
  const locationLabel = buildLocationLabel(item);
  const canonicalUrl = pickCanonicalSourceUrl({
    sourceUrl: item.sourceUrl,
    ticketLink: item.ticketLink,
    reservationLink: item.reservationLink,
    officialWebsite: item.officialWebsite,
    resolved: resolvedLinks,
  });
  const verificationStatus = inferVerificationStatus(ctx, item, canonicalUrl);
  const businessKey = normalizeBusinessKey(item.entityName);
  const layer = item.layer;
  const { eventStartsAt, eventEndsAt } = eventBoundsFromNewsletterItem(item);

  let externalId: string;
  let occurrenceFingerprint: string | null = null;
  let existing: { id: string } | null = null;

  if (layer === 'entity') {
    externalId = entityExternalId(item.entityName, item.city);
    existing = await findExistingEntityByKey(businessKey);
  } else {
    occurrenceFingerprint = buildOccurrenceFingerprint(item, canonicalUrl);
    externalId = occurrenceExternalId(occurrenceFingerprint);
    existing = await findExistingOccurrenceByFingerprint(occurrenceFingerprint);
    if (!existing && eventStartsAt) {
      existing = await findExistingUndatedOccurrenceForMessage({
        gmailMessageId: ctx.gmailMessageId,
        title: item.title,
      });
    }
  }

  if (dryRun) {
    return {
      contentItemId: existing?.id ?? 'dry-run',
      created: !existing,
      duplicateMerged: Boolean(existing),
      verificationStatus,
    };
  }

  const now = new Date();
  const metadata = {
    ingest: 'newsletter_intelligence',
    opportunityLayer: layer,
    opportunityType: item.occurrenceType ?? item.entityType,
    entityType: item.entityType,
    occurrenceType: item.occurrenceType,
    businessKey,
    inventoryStatus: layer === 'entity' ? 'suggested' : eventStartsAt ? 'suggested' : 'unreviewed',
    verificationStatus,
    occurrenceFingerprint,
    linkedEntityContentItemId: input.linkedEntityContentItemId ?? null,
    newsletterAttribution: {
      foundIn: ctx.newsletterSourceName ?? ctx.senderName ?? ctx.senderDomain,
      senderEmail: ctx.senderEmail,
      senderDomain: ctx.senderDomain,
      gmailMessageId: ctx.gmailMessageId,
      subject: ctx.subject,
      receivedAt: ctx.receivedAt.toISOString(),
      newsletterCategory: ctx.newsletterCategory,
    },
    newsletterFields: {
      price: item.price,
      isFree: item.isFree,
      ageRestriction: item.ageRestriction,
      rsvpRequired: item.rsvpRequired,
      reservationLink: item.reservationLink,
      ticketLink: item.ticketLink,
      officialWebsite: item.officialWebsite,
      officialSocialLink: item.officialSocialLink,
      phone: item.phone,
      organizer: item.organizer,
      neighborhood: item.neighborhood,
      startTimeText: item.startTime,
      endTimeText: item.endTime,
      timezone: item.timezone,
      sourceDateText: item.startDate,
    },
    lastVerifiedAt: now.toISOString(),
  };

  if (existing) {
    await db
      .update(contentItems)
      .set({
        lastSeenAt: now,
        sourceLastCheckedAt: now,
        stale: false,
        ...(eventStartsAt
          ? {
              eventStartsAt,
              creatorValueStatus: 'creator_candidate' as const,
              lifecycleStatus:
                eventStartsAt.getTime() < Date.now() - 14 * 86400000
                  ? ('expired' as const)
                  : ('active' as const),
            }
          : {}),
        ...(eventEndsAt ? { eventEndsAt } : {}),
        metadata: sql`${contentItems.metadata} || ${JSON.stringify({
          evidenceCount: undefined,
          lastNewsletterSeenAt: now.toISOString(),
          occurrenceFingerprint,
          inventoryStatus: eventStartsAt ? 'suggested' : 'unreviewed',
          newsletterFields: {
            price: item.price,
            isFree: item.isFree,
            ageRestriction: item.ageRestriction,
            rsvpRequired: item.rsvpRequired,
            reservationLink: item.reservationLink,
            ticketLink: item.ticketLink,
            officialWebsite: item.officialWebsite,
            officialSocialLink: item.officialSocialLink,
            phone: item.phone,
            organizer: item.organizer,
            neighborhood: item.neighborhood,
            startTimeText: item.startTime,
            endTimeText: item.endTime,
            timezone: item.timezone,
            sourceDateText: item.startDate,
          },
        })}::jsonb`,
        updatedAt: now,
      })
      .where(eq(contentItems.id, existing.id));

    return {
      contentItemId: existing.id,
      created: false,
      duplicateMerged: true,
      verificationStatus,
    };
  }

  const [inserted] = await db
    .insert(contentItems)
    .values({
      campaignId,
      type: layer === 'entity' ? 'industry_insight' : 'industry_insight',
      language: 'en',
      state: 'planned',
      topic: item.title,
      hook: item.description?.slice(0, 500) ?? null,
      script: null,
      sourceId,
      sourceExternalId: externalId,
      sourceUrl: canonicalUrl,
      discoveredAt: ctx.receivedAt,
      eventStartsAt,
      eventEndsAt,
      locationName: locationLabel ?? item.venue,
      formattedAddress: item.streetAddress,
      metadata,
      firstSeenAt: now,
      lastSeenAt: now,
      sourceLastCheckedAt: now,
      stale: false,
      freshnessBucket: 'fresh',
      // DB enum has no "unreviewed" — match live-persist-approved mapping.
      creatorValueStatus: eventStartsAt ? 'creator_candidate' : 'hidden_raw_signal',
      lifecycleStatus: eventStartsAt && eventStartsAt.getTime() < Date.now() - 14 * 86400000 ? 'expired' : 'active',
    })
    .returning({ id: contentItems.id });

  return {
    contentItemId: inserted!.id,
    created: true,
    duplicateMerged: false,
    verificationStatus,
  };
}
