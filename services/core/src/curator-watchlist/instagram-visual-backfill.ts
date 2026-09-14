import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db.js';
import { curatorEventLeads, curatorSocialPosts, earlySignals } from '../schema.js';
import { isCalendarEligible } from './creator-value.js';
import { isPastEvent } from './dedupe.js';
import { isInstagramErrorChrome, isInstagramErrorChromeTitle } from './instagram-visual/ig-error-chrome.js';
import { isResearchFailureProse } from './instagram-visual/event-quality-gate.js';
import { extractCaptionStructuredEvent } from './instagram-visual/caption-event-extract.js';
import { isKnownGarbageTitle, isOcrGibberishTitle } from './instagram-visual/ocr-quality.js';
import { classifyInstagramPostContent } from './instagram-visual/post-classification.js';
import { sameWatchlistOccurrence, watchlistOccurrenceIdentityKeys } from './watchlist-intelligence.js';
import { refreshCuratorReliability } from './reliability.js';
import { leadFingerprint, upsertEventLead } from './store.js';

export type QualityGateBackfillResult = {
  beforeActive: number;
  afterActive: number;
  garbageQuarantined: number;
  nonEventReclassified: number;
  researchProseCleared: number;
  captionEventsRecovered: number;
  samples: Array<{ id: string; eventName: string; action: string }>;
};

async function quarantineLead(
  lead: typeof curatorEventLeads.$inferSelect,
  reason: string,
  quarantined: string,
): Promise<void> {
  await db
    .update(curatorEventLeads)
    .set({
      dismissedAt: new Date(),
      dismissReason: reason,
      verificationStatus: 'EXPIRED',
      creatorRecommendation: 'ignore',
      metadata: {
        ...((lead.metadata as Record<string, unknown>) ?? {}),
        calendarEligible: false,
        quarantined,
        quarantineReason: reason,
        preservedOriginalQuotedText: lead.originalQuotedText,
        preservedTitle: lead.eventName,
      },
      updatedAt: new Date(),
    })
    .where(eq(curatorEventLeads.id, lead.id));

  if (lead.linkedEarlySignalId) {
    await db
      .update(earlySignals)
      .set({
        signalState: 'dismissed',
        dismissedAt: new Date(),
        normalizedData: {
          quarantined,
          dismissReason: reason,
        },
        updatedAt: new Date(),
      })
      .where(eq(earlySignals.id, lead.linkedEarlySignalId))
      .catch(() => undefined);
  }
}

/**
 * Auditable quality-gate cleanup for one watcher.
 * Quarantines OCR garbage, reclassifies non-events, strips research prose.
 * Does NOT blind-delete by title length.
 */
export async function runEventQualityGateBackfillForWatcher(
  watcherId: string,
): Promise<QualityGateBackfillResult> {
  const leads = await db
    .select()
    .from(curatorEventLeads)
    .where(and(eq(curatorEventLeads.watcherId, watcherId), isNull(curatorEventLeads.dismissedAt)));

  const beforeActive = leads.length;
  let garbageQuarantined = 0;
  let nonEventReclassified = 0;
  let researchProseCleared = 0;
  let captionEventsRecovered = 0;
  const samples: QualityGateBackfillResult['samples'] = [];

  for (const lead of leads) {
    const title = lead.eventName ?? '';
    const quoted = lead.originalQuotedText ?? '';
    const research = (lead.researchSummary ?? {}) as Record<string, unknown>;
    const summaryText = typeof research.summary === 'string' ? research.summary : '';

    if (isKnownGarbageTitle(title) || isOcrGibberishTitle(title, { caption: quoted })) {
      await quarantineLead(lead, 'ocr_gibberish_quality_gate', 'ocr_gibberish');
      garbageQuarantined += 1;
      samples.push({ id: lead.id, eventName: title.slice(0, 80), action: 'quarantine_ocr_gibberish' });
      continue;
    }

    const cls = classifyInstagramPostContent({
      caption: quoted || title,
      ocrTexts: [quoted],
    });
    // Only reclassify high-confidence non-events — never blind-delete unfamiliar titles
    if (
      cls.contentClass === 'human_interest_story' ||
      cls.contentClass === 'past_event_recap'
    ) {
      await db
        .update(curatorEventLeads)
        .set({
          dismissedAt: new Date(),
          dismissReason: `non_event:${cls.contentClass}`,
          verificationStatus: 'EXPIRED',
          creatorRecommendation: 'ignore',
          metadata: {
            ...((lead.metadata as Record<string, unknown>) ?? {}),
            calendarEligible: false,
            quarantined: 'non_event',
            contentClass: cls.contentClass,
            preservedTitle: title,
          },
          updatedAt: new Date(),
        })
        .where(eq(curatorEventLeads.id, lead.id));
      if (lead.linkedEarlySignalId) {
        await db
          .update(earlySignals)
          .set({
            signalState: 'dismissed',
            dismissedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(earlySignals.id, lead.linkedEarlySignalId))
          .catch(() => undefined);
      }
      nonEventReclassified += 1;
      samples.push({
        id: lead.id,
        eventName: title.slice(0, 80),
        action: `reclassify_${cls.contentClass}`,
      });
      continue;
    }

    if (isResearchFailureProse(summaryText)) {
      await db
        .update(curatorEventLeads)
        .set({
          researchSummary: {
            ...research,
            summary: null,
            toolOutcome: 'not_found',
            toolExplanation: summaryText.slice(0, 500),
            researchProseQuarantined: true,
          },
          metadata: {
            ...((lead.metadata as Record<string, unknown>) ?? {}),
            researchProseCleared: true,
          },
          updatedAt: new Date(),
        })
        .where(eq(curatorEventLeads.id, lead.id));
      researchProseCleared += 1;
      samples.push({ id: lead.id, eventName: title.slice(0, 80), action: 'clear_research_prose' });
    }
  }

  // Recover caption-structured future events from stored posts (bounded recent window may miss them)
  const posts = await db
    .select()
    .from(curatorSocialPosts)
    .where(eq(curatorSocialPosts.watcherId, watcherId))
    .limit(40);

  const handle =
    posts[0]?.profileHandle?.replace(/^@/, '') ??
    'instagram';

  for (const post of posts) {
    const caption = (post.caption ?? '').trim();
    if (caption.length < 20) continue;
    if (!/\b(?:next\s+up|coming\s+up|join\s+us)\b/i.test(caption)) continue;

    const extracted = extractCaptionStructuredEvent({
      caption,
      permalink: post.postUrl,
      publishedAt: post.publishedAt ? new Date(post.publishedAt).toISOString() : null,
      handle,
      now: new Date(),
    });
    if (!extracted?.title || !extracted.eventDate) continue;
    if (extracted.temporalClass === 'expired' || extracted.decisionStage === 'rejected') continue;
    if (isPastEvent(extracted.eventDate)) continue;

    // Skip if an active lead already covers this occurrence
    const existing = await db
      .select()
      .from(curatorEventLeads)
      .where(and(eq(curatorEventLeads.watcherId, watcherId), isNull(curatorEventLeads.dismissedAt)));
    const already = existing.some((l) =>
      sameWatchlistOccurrence(
        {
          title: extracted.title!,
          eventDate: extracted.eventDate,
          venue: extracted.venue,
          evidence: extracted.originalQuotedText,
          type: 'curator_event_lead',
        },
        {
          title: l.eventName,
          eventDate: l.eventDate,
          venue: l.venue,
          evidence: l.originalQuotedText,
          type: 'curator_event_lead',
        },
      ),
    );
    if (already) continue;

    const fp = leadFingerprint({
      eventName: extracted.title,
      eventDate: extracted.eventDate,
      venue: extracted.venue,
      postUrl: post.postUrl,
      eventTime: extracted.eventTime,
    });
    const occKeys = watchlistOccurrenceIdentityKeys({
      title: extracted.title,
      eventDate: extracted.eventDate,
      venue: extracted.venue,
      evidence: extracted.originalQuotedText,
      type: 'curator_event_lead',
    });

    const { lead, outcome } = await upsertEventLead({
      watcherId,
      postId: post.id,
      slideId: null,
      eventName: extracted.title.slice(0, 500),
      eventDate: extracted.eventDate,
      eventTime: extracted.eventTime,
      venue: extracted.venue,
      neighborhood: extracted.neighborhood,
      price: extracted.price,
      ageRestriction: extracted.ageRestriction,
      registrationNotes: null,
      dayHeading: null,
      discoveredViaHandle: handle,
      discoveredViaPostUrl: post.postUrl,
      discoveredViaSlideNumber: null,
      originalQuotedText: extracted.originalQuotedText,
      verificationStatus: 'SOCIAL_LEAD',
      officialOrganizerUrl: null,
      officialVenueUrl: null,
      ticketUrl: null,
      officialSocialUrl: null,
      researchSummary: {
        summary: null,
        toolOutcome: 'insufficient_evidence',
        recoveredBy: 'caption_quality_gate_backfill',
      },
      verificationNotes: null,
      verifiedAt: null,
      creatorRecommendation: 'track_only',
      creatorValueScore: '0.5',
      creatorValueExplanation: { recoveredFromCaption: true },
      occurrenceFingerprint: fp,
      metadata: {
        calendarEligible: false,
        yearTrust: extracted.yearTrust,
        yearInferenceExplanation: extracted.yearInferenceExplanation,
        decisionStage: extracted.decisionStage,
        locationTrust: extracted.locationTrust,
        recoveredFromCaptionBackfill: true,
        occurrenceIdentityKeys: occKeys,
        provenanceUrls: [post.postUrl],
      },
    });

    if (outcome === 'created') {
      captionEventsRecovered += 1;
      samples.push({
        id: lead.id,
        eventName: extracted.title.slice(0, 80),
        action: 'recover_caption_event',
      });
    }
  }

  await refreshCuratorReliability(watcherId).catch(() => undefined);

  const afterRows = await db
    .select({ id: curatorEventLeads.id })
    .from(curatorEventLeads)
    .where(and(eq(curatorEventLeads.watcherId, watcherId), isNull(curatorEventLeads.dismissedAt)));

  return {
    beforeActive,
    afterActive: afterRows.length,
    garbageQuarantined,
    nonEventReclassified,
    researchProseCleared,
    captionEventsRecovered,
    samples: samples.slice(0, 40),
  };
}

/** System-wide reusable cleanup across Instagram curator watchers. */
export async function runEventQualityGateBackfillGlobal(limit = 80): Promise<{
  watchers: number;
  garbageQuarantined: number;
  nonEventReclassified: number;
  researchProseCleared: number;
  captionEventsRecovered: number;
  beforeActive: number;
  afterActive: number;
}> {
  const { sourceWatchers } = await import('../schema.js');
  const rows = await db
    .select({ id: sourceWatchers.id })
    .from(sourceWatchers)
    .where(eq(sourceWatchers.platform, 'instagram'))
    .limit(limit);

  let garbageQuarantined = 0;
  let nonEventReclassified = 0;
  let researchProseCleared = 0;
  let captionEventsRecovered = 0;
  let beforeActive = 0;
  let afterActive = 0;
  for (const row of rows) {
    const r = await runEventQualityGateBackfillForWatcher(row.id);
    garbageQuarantined += r.garbageQuarantined;
    nonEventReclassified += r.nonEventReclassified;
    researchProseCleared += r.researchProseCleared;
    captionEventsRecovered += r.captionEventsRecovered;
    beforeActive += r.beforeActive;
    afterActive += r.afterActive;
  }
  return {
    watchers: rows.length,
    garbageQuarantined,
    nonEventReclassified,
    researchProseCleared,
    captionEventsRecovered,
    beforeActive,
    afterActive,
  };
}

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

    if (isKnownGarbageTitle(lead.eventName) || isOcrGibberishTitle(lead.eventName)) {
      await quarantineLead(lead, 'ocr_gibberish_quality_gate', 'ocr_gibberish');
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
    const twin = kept.find((k) => {
      if (
        sameWatchlistOccurrence(
          {
            title: lead.eventName,
            eventDate: lead.eventDate,
            venue: lead.venue,
            evidence: lead.originalQuotedText,
            type: 'curator_event_lead',
          },
          {
            title: k.eventName,
            eventDate: k.eventDate,
            venue: k.venue,
            evidence: k.originalQuotedText,
            type: 'curator_event_lead',
          },
        )
      ) {
        const aTime = (lead.eventTime ?? '').trim().toLowerCase();
        const bTime = (k.eventTime ?? '').trim().toLowerCase();
        if (aTime && bTime && aTime !== bTime) return false;
        return true;
      }
      return false;
    });
    if (!twin) {
      kept.push(lead);
      continue;
    }
    const twinMeta = { ...((twin.metadata as Record<string, unknown>) ?? {}) };
    const prevUrls = Array.isArray(twinMeta.provenanceUrls)
      ? twinMeta.provenanceUrls.map(String)
      : [twin.discoveredViaPostUrl].filter(Boolean);
    const provenance = new Set([...prevUrls, lead.discoveredViaPostUrl]);
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
    /* soft-fail */
  }

  return { expired, errorChromeQuarantined, duplicatesSuppressed, calendarEligibilityCleared };
}

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
