import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems, type NewContentItem } from '../schema.js';
import { computeLifecycleStatus } from '../creator-agent/lifecycle.js';
import { freshnessBucket, isIngestDryRun } from '../scanner/ingest-persist.js';
import { sanitizeScrapedText, sanitizeScrapedTitle } from '../text-sanitize/sanitize-scraped-text.js';
import {
  buildUserOpportunityExternalId,
  extractEventbriteEventId,
  findMatchingUserOpportunity,
  mergeOpportunityScript,
  mergeOpportunityTopic,
  normalizeCanonicalEventUrl,
  preferCanonicalSourceUrl,
  type MatchedUserOpportunity,
} from './url-intake-dedupe.js';
import { isTicketVendorTitle, isTicketVendorUrl } from './event-occurrence.js';

function sanitizeRowText(row: NewContentItem): NewContentItem {
  return {
    ...row,
    topic: row.topic ? sanitizeScrapedTitle(row.topic) : row.topic,
    hook: row.hook ? sanitizeScrapedTitle(row.hook) : row.hook,
    script: row.script ? sanitizeScrapedText(row.script) : row.script,
    locationName: row.locationName ? sanitizeScrapedTitle(row.locationName) : row.locationName,
  };
}

export type UserOpportunityPersistResult = {
  outcome: 'created' | 'updated';
  contentItemId: string;
  matchedExisting: boolean;
};

export async function persistUserConfirmedOpportunity(input: {
  sourceId: string;
  row: NewContentItem;
  canonicalUrl?: string | null;
  eventbriteEventId?: string | null;
  userConfirmed: boolean;
  existingMatch?: MatchedUserOpportunity | null;
}): Promise<UserOpportunityPersistResult> {
  const checkedAt = new Date();
  const row = sanitizeRowText(input.row);
  const eventbriteEventId =
    input.eventbriteEventId ??
    extractEventbriteEventId(input.canonicalUrl ?? row.sourceUrl ?? '') ??
    extractEventbriteEventId(row.metadata && typeof row.metadata === 'object'
      ? String((row.metadata as Record<string, unknown>).canonicalEventUrl ?? '')
      : null);

  const canonicalUrl = normalizeCanonicalEventUrl(input.canonicalUrl ?? row.sourceUrl ?? null);
  const externalId =
    row.sourceExternalId ??
    buildUserOpportunityExternalId({
      eventbriteEventId,
      canonicalUrl,
      title: row.topic,
      eventDateIso: row.eventStartsAt?.toISOString() ?? null,
      venue: row.locationName,
    });

  const existing =
    input.existingMatch ??
    (await findMatchingUserOpportunity({
      sourceId: input.sourceId,
      eventbriteEventId,
      canonicalUrl,
      title: row.topic,
      eventDate: row.eventStartsAt ?? null,
      venue: row.locationName,
    }));

  const metadata: Record<string, unknown> = {
    ...(row.metadata ?? {}),
    ...(eventbriteEventId ? { eventbriteEventId } : {}),
    ...(canonicalUrl ? { canonicalEventUrl: canonicalUrl } : {}),
    ...(input.userConfirmed
      ? {
          userConfirmed: true,
          userSubmission: {
            ...(((row.metadata ?? {}) as Record<string, unknown>).userSubmission as Record<string, unknown> | undefined),
            submittedByUser: true,
            submissionSource: 'ask_benson',
            submittedAt: new Date().toISOString(),
            userConfirmed: true,
          },
        }
      : {}),
  };

  if (existing) {
    if (isIngestDryRun()) {
      return { outcome: 'updated', contentItemId: existing.id, matchedExisting: true };
    }

    const existingMeta = (existing.metadata ?? {}) as Record<string, unknown>;
    const mergedMeta = {
      ...existingMeta,
      ...metadata,
      userConfirmed: input.userConfirmed ? true : existingMeta.userConfirmed,
      enrichmentPending: metadata.enrichmentPending ?? existingMeta.enrichmentPending,
      enrichmentErrors: metadata.enrichmentErrors ?? existingMeta.enrichmentErrors,
    };

    const eventStartsAt = row.eventStartsAt ?? existing.eventStartsAt;
    const eventEndsAt = row.eventEndsAt ?? existing.eventEndsAt;
    const officialOccurrence = Boolean(
      metadata.officialEventOccurrence || existingMeta.officialEventOccurrence,
    );
    const incomingTopic = row.topic ?? '';
    const topic = (
      officialOccurrence
        ? !isTicketVendorTitle(incomingTopic) && incomingTopic
          ? incomingTopic
          : !isTicketVendorTitle(existing.topic)
            ? existing.topic
            : incomingTopic || existing.topic
        : mergeOpportunityTopic(existing.topic, row.topic)
    ).slice(0, 500);
    const officialSourceUrl = officialOccurrence
      ? !isTicketVendorUrl(row.sourceUrl) && row.sourceUrl
        ? row.sourceUrl
        : !isTicketVendorUrl(existing.sourceUrl) && existing.sourceUrl
          ? existing.sourceUrl
          : row.sourceUrl
      : preferCanonicalSourceUrl(existing.sourceUrl, row.sourceUrl);
    await db
      .update(contentItems)
      .set({
        topic,
        hook: row.hook ?? undefined,
        script: mergeOpportunityScript(existing.script, row.script),
        sourceUrl: officialSourceUrl,
        sourceExternalId: existing.sourceExternalId ?? externalId,
        eventStartsAt,
        eventEndsAt,
        locationName: row.locationName ?? existing.locationName,
        relevanceScore: row.relevanceScore ?? undefined,
        urgencyScore: row.urgencyScore ?? undefined,
        lifecycleStatus: computeLifecycleStatus({
          title: topic,
          eventStartsAt,
          eventEndsAt,
          discoveredAt: existing.discoveredAt ?? checkedAt,
          metadata: mergedMeta,
        }),
        lastSeenAt: checkedAt,
        sourceLastCheckedAt: checkedAt,
        stale: false,
        freshnessBucket: freshnessBucket(checkedAt),
        updatedAt: checkedAt,
        metadata: mergedMeta,
      })
      .where(eq(contentItems.id, existing.id));

    return { outcome: 'updated', contentItemId: existing.id, matchedExisting: true };
  }

  if (isIngestDryRun()) {
    return { outcome: 'created', contentItemId: 'dry-run', matchedExisting: false };
  }

  const now = checkedAt;
  await db.insert(contentItems).values({
    ...row,
    sourceExternalId: externalId,
    sourceUrl: canonicalUrl ?? row.sourceUrl,
    metadata,
    lifecycleStatus: input.userConfirmed ? 'active' : row.lifecycleStatus ?? 'active',
    firstSeenAt: now,
    lastSeenAt: now,
    sourceLastCheckedAt: now,
    stale: false,
    freshnessBucket: freshnessBucket(now),
    discoveredAt: row.discoveredAt ?? now,
  });

  const saved = await db.query.contentItems.findFirst({
    where: eq(contentItems.sourceExternalId, externalId),
  });
  if (!saved) throw new Error('Failed to persist user-confirmed opportunity');

  return { outcome: 'created', contentItemId: saved.id, matchedExisting: false };
}
