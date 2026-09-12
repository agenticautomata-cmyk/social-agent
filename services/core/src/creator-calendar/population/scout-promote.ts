/**
 * Promote verified Watchlist scout listings into content_items so Calendar
 * projection can create suggested rows. No outreach / pitch / Telegram.
 */
import { and, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { db } from '../../db.js';
import { campaigns, contentItems, scoutItems, sources } from '../../schema.js';
import { isDiscoverHubUrl } from '../../creator-interest/discover-identity.js';
import { persistIngestedContentItem } from '../../scanner/ingest-persist.js';
import { computeLifecycleStatus } from '../../creator-agent/lifecycle.js';
import { getLocalCalendarDay, getCreatorTimezone } from '../../datetime.js';
import { chicagoWallTimeToUtc } from './eligibility.js';
import {
  admissionCandidateFromScoutPromote,
  evaluateCalendarAdmission,
  isCalendarAccepted,
} from '../admission/index.js';

export const WATCHLIST_VERIFIED_INGEST = 'watchlist_verified';
export const WATCHLIST_PROMOTE_WINDOW_DAYS = 21;

const WATCHLIST_SOURCE_NAME = 'Watchlist Verified';

type ScoutRow = typeof scoutItems.$inferSelect;

export type ScoutPromoteCandidate = {
  scoutItemId: string;
  title: string;
  eventUrl: string;
  startAt: Date;
  endAt: Date | null;
  venue: string | null;
  city: string | null;
  address: string | null;
  verificationState: string;
  meetupRelevance: string | null;
  platform: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseClockHms(timeLocal: string | null): string | null {
  if (!timeLocal?.trim()) return null;
  const raw = timeLocal.trim().toLowerCase().replace(/\./g, '');
  const m = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) {
    if (/^\d{2}:\d{2}(:\d{2})?$/.test(raw)) {
      const parts = raw.split(':');
      return `${parts[0]}:${parts[1]}:${parts[2] ?? '00'}`;
    }
    return null;
  }
  let hour = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ap = (m[3] ?? '').toLowerCase();
  if (ap === 'pm' && hour < 12) hour += 12;
  if (ap === 'am' && hour === 12) hour = 0;
  if (hour > 23 || min > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`;
}

/** Collection/hub roots are not promoteable event detail pages. */
export function isCollectionRootEventUrl(raw: string | null | undefined): boolean {
  const url = (raw ?? '').trim();
  if (!url) return true;
  if (isDiscoverHubUrl(url)) return true;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, '') || '/';
    if (path === '/') return true;
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    // Eventbrite city/directory roots — not /e/ detail pages.
    if (host.includes('eventbrite.') && !/\/e\//i.test(path)) return true;
    // Meetup group roots without /events/<id>.
    if (host.includes('meetup.') && !/\/events\/\d+/i.test(path)) return true;
    // DoStuff/Do816 listing index pages.
    if ((host.includes('dostuff') || host.includes('do816')) && path.split('/').filter(Boolean).length <= 1) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

export function scoutListingStartAt(relevance: Record<string, unknown>): Date | null {
  const startDateTime = str(relevance.startDateTime);
  if (startDateTime) {
    const parsed = new Date(startDateTime);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const startDate = str(relevance.startDate);
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return null;
  const clock =
    parseClockHms(str(relevance.startTimeLocal)) ??
    parseClockHms(str(relevance.startTime)) ??
    '12:00:00';
  return chicagoWallTimeToUtc(startDate, clock);
}

export function scoutListingEndAt(relevance: Record<string, unknown>): Date | null {
  const endDateTime = str(relevance.endDateTime);
  if (endDateTime) {
    const parsed = new Date(endDateTime);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const endDate = str(relevance.endDate);
  if (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return null;
  const clock =
    parseClockHms(str(relevance.endTimeLocal)) ??
    parseClockHms(str(relevance.endTime)) ??
    '12:00:00';
  return chicagoWallTimeToUtc(endDate, clock);
}

export function isWithinPromoteWindow(startAt: Date, now = new Date(), days = WATCHLIST_PROMOTE_WINDOW_DAYS): boolean {
  const tz = getCreatorTimezone();
  const today = getLocalCalendarDay(now, tz);
  const startDay = getLocalCalendarDay(startAt, tz);
  if (startDay < today) return false;
  const horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const horizonDay = getLocalCalendarDay(horizon, tz);
  return startDay <= horizonDay;
}

/**
 * Pure gate: only verified upcoming scout listings with canonical event URLs.
 * Skips Meetup not_relevant / quarantine and collection roots.
 */
export function evaluateScoutPromoteEligibility(
  item: Pick<ScoutRow, 'id' | 'itemUrl' | 'captionText' | 'verificationStatus' | 'relevanceExplanation' | 'itemType'>,
  now = new Date(),
): { ok: true; candidate: ScoutPromoteCandidate } | { ok: false; reason: string } {
  const relevance = asRecord(item.relevanceExplanation);
  const verificationState =
    str(relevance.verificationState) ??
    (item.verificationStatus === 'extracted' ? 'verified' : item.verificationStatus);
  const verified =
    verificationState === 'verified' ||
    (item.verificationStatus === 'extracted' && verificationState !== 'unresolved_date');
  if (!verified) {
    return { ok: false, reason: 'not_verified' };
  }
  if (relevance.needsReview === true && str(relevance.source) === 'meetup_directory') {
    return { ok: false, reason: 'meetup_quarantine' };
  }
  const meetupRelevance = str(relevance.relevance);
  if (meetupRelevance === 'not_relevant') {
    return { ok: false, reason: 'meetup_not_relevant' };
  }
  if (relevance.reviewOnly === false) {
    // keep reviewOnly outreach skips intact — promote to calendar is allowed while reviewOnly
  }
  const title = str(item.captionText) ?? str(relevance.title);
  if (!title || title.length < 4) return { ok: false, reason: 'weak_title' };

  const eventUrl =
    str(relevance.eventUrl) ??
    str(relevance.ticketOrRsvpUrl) ??
    str(item.itemUrl);
  if (!eventUrl || isCollectionRootEventUrl(eventUrl)) {
    return { ok: false, reason: 'collection_root_or_missing_url' };
  }

  const startAt = scoutListingStartAt(relevance);
  if (!startAt) return { ok: false, reason: 'no_start' };
  if (!isWithinPromoteWindow(startAt, now)) return { ok: false, reason: 'outside_window' };

  const venue = str(relevance.venue);
  const city = str(relevance.city) ?? str(relevance.locationName);
  const address = str(relevance.address);
  const admission = evaluateCalendarAdmission(
    admissionCandidateFromScoutPromote({
      title,
      eventUrl,
      startAt,
      endAt: scoutListingEndAt(relevance),
      venue,
      city,
      address,
      platform: str(relevance.platform) ?? str(relevance.source),
    }),
    now,
  );
  if (!isCalendarAccepted(admission)) {
    return { ok: false, reason: `admission:${admission.primaryReason}` };
  }

  return {
    ok: true,
    candidate: {
      scoutItemId: item.id,
      title,
      eventUrl,
      startAt,
      endAt: scoutListingEndAt(relevance),
      venue,
      city,
      address,
      verificationState: verificationState ?? 'verified',
      meetupRelevance,
      platform: str(relevance.platform) ?? str(relevance.source),
    },
  };
}

async function defaultCampaignId(): Promise<string> {
  const [campaign] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.active, true))
    .orderBy(desc(campaigns.createdAt))
    .limit(1);
  if (!campaign) throw new Error('No active campaign found');
  return campaign.id;
}

async function getOrCreateWatchlistVerifiedSource(campaignId: string): Promise<string> {
  const existing = await db.query.sources.findFirst({
    where: and(
      eq(sources.campaignId, campaignId),
      eq(sources.type, 'scrape'),
      eq(sources.name, WATCHLIST_SOURCE_NAME),
    ),
  });
  if (existing) return existing.id;
  const [created] = await db
    .insert(sources)
    .values({
      campaignId,
      type: 'scrape',
      name: WATCHLIST_SOURCE_NAME,
      config: { ingest: WATCHLIST_VERIFIED_INGEST },
      active: true,
    })
    .returning({ id: sources.id });
  return created!.id;
}

export type PromoteWatchlistScoutResult = {
  considered: number;
  promoted: number;
  updated: number;
  skipped: number;
  contentItemIds: string[];
};

/**
 * Promote verified upcoming scout listings for a watcher into content_items
 * (ingest=watchlist_verified). Idempotent via sourceExternalId + linkedContentItemId.
 */
export async function promoteVerifiedScoutListingsToCalendar(
  watcherId: string,
  now = new Date(),
): Promise<PromoteWatchlistScoutResult> {
  const rows = await db
    .select()
    .from(scoutItems)
    .where(
      and(
        eq(scoutItems.watcherId, watcherId),
        or(
          eq(scoutItems.verificationStatus, 'extracted'),
          eq(scoutItems.verificationStatus, 'partial'),
        ),
      ),
    );

  const campaignId = await defaultCampaignId();
  const sourceId = await getOrCreateWatchlistVerifiedSource(campaignId);
  const result: PromoteWatchlistScoutResult = {
    considered: rows.length,
    promoted: 0,
    updated: 0,
    skipped: 0,
    contentItemIds: [],
  };

  for (const row of rows) {
    const gate = evaluateScoutPromoteEligibility(row, now);
    if (!gate.ok) {
      result.skipped += 1;
      continue;
    }
    const { candidate } = gate;
    if (row.linkedContentItemId) {
      result.updated += 1;
      result.contentItemIds.push(row.linkedContentItemId);
      continue;
    }

    const externalId = `watchlist-scout-${row.id}`;
    const locationName =
      [candidate.venue, candidate.city].filter(Boolean).join(', ') ||
      candidate.address ||
      null;
    if (!locationName) {
      result.skipped += 1;
      continue;
    }    const lifecycle = computeLifecycleStatus(
      {
        title: candidate.title,
        eventStartsAt: candidate.startAt,
        eventEndsAt: candidate.endAt,
        discoveredAt: now,
      },
      now,
    );

    const outcome = await persistIngestedContentItem(
      sourceId,
      externalId,
      () => ({
        campaignId,
        type: 'industry_insight',
        language: 'en',
        state: 'planned',
        topic: candidate.title.slice(0, 500),
        hook: candidate.title.slice(0, 500),
        script: `${candidate.title} at ${locationName}`.slice(0, 4000),
        sourceId,
        sourceExternalId: externalId,
        sourceUrl: candidate.eventUrl,
        discoveredAt: now,
        eventStartsAt: candidate.startAt,
        eventEndsAt: candidate.endAt,
        locationName,
        formattedAddress: candidate.address,
        creatorValueStatus: 'creator_candidate',
        lifecycleStatus: lifecycle === 'expired' ? 'expired' : 'upcoming',
        metadata: {
          ingest: WATCHLIST_VERIFIED_INGEST,
          opportunityCategory: 'community_event',
          verificationStatus: 'VERIFIED',
          verificationState: 'VERIFIED',
          calendarEligible: true,
          scoutItemId: candidate.scoutItemId,
          watcherId,
          watchlistPlatform: candidate.platform,
          reviewOnly: true,
          autoPitch: false,
          autoAlert: false,
          extracted: {
            eventDate: getLocalCalendarDay(candidate.startAt),
            startTime: null,
            venue: candidate.venue,
          },
          ticketUrl: candidate.eventUrl,
        },
        rawPayload: {
          scoutItemId: candidate.scoutItemId,
          watcherId,
          provenance: WATCHLIST_VERIFIED_INGEST,
        },
      }),
      { sourceUrl: candidate.eventUrl },
    );

    const saved = await db.query.contentItems.findFirst({
      where: eq(contentItems.sourceExternalId, externalId),
    });
    if (!saved) {
      result.skipped += 1;
      continue;
    }

    await db
      .update(scoutItems)
      .set({ linkedContentItemId: saved.id, updatedAt: now })
      .where(and(eq(scoutItems.id, row.id), isNull(scoutItems.linkedContentItemId)));

    if (outcome === 'created') result.promoted += 1;
    else result.updated += 1;
    result.contentItemIds.push(saved.id);
  }

  return result;
}

/** Fire-and-forget safe wrapper used by Watchlist check runners. */
export async function maybePromoteVerifiedScoutListingsAfterCheck(
  watcherId: string,
  verifiedYield: number,
): Promise<void> {
  if (verifiedYield <= 0) return;
  try {
    await promoteVerifiedScoutListingsToCalendar(watcherId);
  } catch (err) {
    console.error('[creator-calendar] watchlist scout promote failed', {
      watcherId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Operator helper: promote across watchers with recent verified yield (unused by default). */
export async function promoteVerifiedScoutListingsForUpcomingWindow(
  now = new Date(),
): Promise<PromoteWatchlistScoutResult> {
  const horizon = new Date(now.getTime() + WATCHLIST_PROMOTE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(scoutItems)
    .where(
      and(
        eq(scoutItems.verificationStatus, 'extracted'),
        gte(scoutItems.updatedAt, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)),
        lte(scoutItems.updatedAt, horizon),
      ),
    );

  const byWatcher = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byWatcher.get(row.watcherId) ?? [];
    list.push(row);
    byWatcher.set(row.watcherId, list);
  }

  const aggregate: PromoteWatchlistScoutResult = {
    considered: 0,
    promoted: 0,
    updated: 0,
    skipped: 0,
    contentItemIds: [],
  };
  for (const watcherId of byWatcher.keys()) {
    const part = await promoteVerifiedScoutListingsToCalendar(watcherId, now);
    aggregate.considered += part.considered;
    aggregate.promoted += part.promoted;
    aggregate.updated += part.updated;
    aggregate.skipped += part.skipped;
    aggregate.contentItemIds.push(...part.contentItemIds);
  }
  return aggregate;
}
