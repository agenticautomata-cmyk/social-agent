/**
 * Production backfill / reclassification for Instagram visual Watchlist records.
 * Re-evaluates expired dates (America/Chicago), quarantines IG error chrome,
 * and merges duplicate leads that share occurrence identity (preserving distinct showtimes).
 */

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db.js';
import { curatorEventLeads, earlySignals } from '../schema.js';
import { isCalendarEligible } from './creator-value.js';
import { isPastEvent } from './dedupe.js';
import { isInstagramErrorChrome, isInstagramErrorChromeTitle } from './instagram-visual/ig-error-chrome.js';
import { sameWatchlistOccurrence, watchlistOccurrenceIdentityKeys } from './watchlist-intelligence.js';

export async function reclassifyExpiredCuratorLeadsForWatcher(watcherId: string): Promise<{
  expired: number;
  errorChromeQuarantined: number;
  duplicatesSuppressed: number;
  calendarEligibilityCleared: number;
}> {
  let expired = 0;
  let errorChromeQuarantined = 0;
  let duplicatesSuppressed = 0;
  let calendarEligibilityCleared = 0;

  const leads = await db
    .select()
    .from(curatorEventLeads)
    .where(and(eq(curatorEventLeads.watcherId, watcherId), isNull(curatorEventLeads.dismissedAt)));

  for (const lead of leads) {
    if (isInstagramErrorChromeTitle(lead.eventName) || isInstagramErrorChrome(lead.originalQuotedText)) {
      await db
        .update(curatorEventLeads)
        .set({
          dismissedAt: new Date(),
          dismissReason: 'instagram_error_chrome_quarantine',
          verificationStatus: 'EXPIRED',
          metadata: {
            ...((lead.metadata as Record<string, unknown>) ?? {}),
            calendarEligible: false,
            quarantined: 'instagram_error_chrome',
          },
          updatedAt: new Date(),
        })
        .where(eq(curatorEventLeads.id, lead.id));
      errorChromeQuarantined += 1;
      continue;
    }

    const past = isPastEvent(lead.eventDate);
    const meta = { ...((lead.metadata as Record<string, unknown>) ?? {}) };
    const eligible = isCalendarEligible({
      verificationStatus: past ? 'EXPIRED' : (lead.verificationStatus as 'SOCIAL_LEAD'),
      eventDate: lead.eventDate,
    });

    if (past && lead.verificationStatus !== 'EXPIRED') {
      await db
        .update(curatorEventLeads)
        .set({
          verificationStatus: 'EXPIRED',
          creatorRecommendation: 'ignore',
          metadata: { ...meta, calendarEligible: false, expiredByBackfill: true },
          updatedAt: new Date(),
        })
        .where(eq(curatorEventLeads.id, lead.id));
      expired += 1;
      calendarEligibilityCleared += 1;
      continue;
    }

    if (meta.calendarEligible === true && !eligible) {
      await db
        .update(curatorEventLeads)
        .set({
          metadata: { ...meta, calendarEligible: false },
          updatedAt: new Date(),
        })
        .where(eq(curatorEventLeads.id, lead.id));
      calendarEligibilityCleared += 1;
    }
  }

  // Suppress duplicate active leads (same title/date/venue/showtime) — keep earliest, attach provenance
  const active = await db
    .select()
    .from(curatorEventLeads)
    .where(and(eq(curatorEventLeads.watcherId, watcherId), isNull(curatorEventLeads.dismissedAt)));

  const kept: typeof active = [];
  for (const lead of active) {
    if (lead.verificationStatus === 'EXPIRED') {
      kept.push(lead);
      continue;
    }
    const twin = kept.find((k) =>
      sameWatchlistOccurrence(
        {
          title: lead.eventName,
          eventDate: lead.eventDate,
          venue: lead.venue,
          evidence: `${lead.eventTime ?? ''}|${lead.originalQuotedText ?? ''}`,
          type: 'curator_event_lead',
        },
        {
          title: k.eventName,
          eventDate: k.eventDate,
          venue: k.venue,
          evidence: `${k.eventTime ?? ''}|${k.originalQuotedText ?? ''}`,
          type: 'curator_event_lead',
        },
      ),
    );
    if (!twin) {
      kept.push(lead);
      continue;
    }
    // Distinct showtimes → keep both
    const tTime = (lead.eventTime ?? '').toLowerCase().replace(/\s+/g, '');
    const kTime = (twin.eventTime ?? '').toLowerCase().replace(/\s+/g, '');
    if (tTime && kTime && tTime !== kTime) {
      kept.push(lead);
      continue;
    }
    const twinMeta = { ...((twin.metadata as Record<string, unknown>) ?? {}) };
    const provenance = new Set<string>([
      ...((twinMeta.provenanceUrls as string[]) ?? []),
      twin.discoveredViaPostUrl,
      lead.discoveredViaPostUrl,
    ]);
    await db
      .update(curatorEventLeads)
      .set({
        metadata: {
          ...twinMeta,
          provenanceUrls: [...provenance],
          duplicatesSuppressed: Number(twinMeta.duplicatesSuppressed ?? 0) + 1,
        },
        updatedAt: new Date(),
      })
      .where(eq(curatorEventLeads.id, twin.id));
    await db
      .update(curatorEventLeads)
      .set({
        dismissedAt: new Date(),
        dismissReason: 'duplicate_occurrence_suppressed',
        metadata: {
          ...((lead.metadata as Record<string, unknown>) ?? {}),
          duplicateOf: twin.id,
          calendarEligible: false,
        },
        updatedAt: new Date(),
      })
      .where(eq(curatorEventLeads.id, lead.id));
    duplicatesSuppressed += 1;
  }

  // Quarantine error-chrome early signals for this watcher
  try {
    const signals = await db
      .select()
      .from(earlySignals)
      .where(and(eq(earlySignals.watcherId, watcherId), isNull(earlySignals.dismissedAt)))
      .limit(200);
    for (const f of signals) {
      if (isInstagramErrorChromeTitle(f.title) || isInstagramErrorChrome(f.summary) || isInstagramErrorChrome(f.rawText)) {
        await db
          .update(earlySignals)
          .set({
            signalState: 'dismissed',
            dismissedAt: new Date(),
            normalizedData: {
              ...((f.normalizedData as Record<string, unknown>) ?? {}),
              quarantined: 'instagram_error_chrome',
              dismissReason: 'instagram_error_chrome_quarantine',
            },
            updatedAt: new Date(),
          })
          .where(eq(earlySignals.id, f.id));
        errorChromeQuarantined += 1;
      }
    }
  } catch {
    // soft-fail — lead quarantine is the hard requirement
  }

  return { expired, errorChromeQuarantined, duplicatesSuppressed, calendarEligibilityCleared };
}

/** Global repair pass used by deploy/backfill (all Instagram curator watchers). */
export async function reclassifyExpiredCuratorLeadsGlobal(limit = 50): Promise<{
  watchers: number;
  expired: number;
  errorChromeQuarantined: number;
  duplicatesSuppressed: number;
}> {
  const { sourceWatchers } = await import('../schema.js');
  const rows = await db
    .select({ id: sourceWatchers.id })
    .from(sourceWatchers)
    .where(eq(sourceWatchers.platform, 'instagram'))
    .limit(limit);

  let expired = 0;
  let errorChromeQuarantined = 0;
  let duplicatesSuppressed = 0;
  for (const row of rows) {
    const r = await reclassifyExpiredCuratorLeadsForWatcher(row.id);
    expired += r.expired;
    errorChromeQuarantined += r.errorChromeQuarantined;
    duplicatesSuppressed += r.duplicatesSuppressed;
  }
  return { watchers: rows.length, expired, errorChromeQuarantined, duplicatesSuppressed };
}

/** Pure helper for tests — expired Sep 6 checked on Sep 13. */
export function shouldExpireLeadOnCheck(input: {
  eventDate: string | null;
  now: Date;
}): boolean {
  return isPastEvent(input.eventDate, input.now);
}

export function occurrenceKeysForLead(input: {
  eventName: string;
  eventDate: string | null;
  venue: string | null;
  evidence?: string | null;
}): string[] {
  return watchlistOccurrenceIdentityKeys({
    title: input.eventName,
    eventDate: input.eventDate,
    venue: input.venue,
    evidence: input.evidence,
    type: 'curator_event_lead',
  });
}
