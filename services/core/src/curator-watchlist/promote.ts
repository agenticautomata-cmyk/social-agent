import { and, desc, eq, inArray, not } from 'drizzle-orm';
import { db } from '../db.js';
import { curatorEventLeads, earlySignals } from '../schema.js';
import { createHash } from 'node:crypto';
import { buildAttributionLine } from './slide-ocr.js';
import { findSignalByContentHash, insertSignal, updateSignal } from '../early-signals/store.js';
import { buildContentRecommendation } from '../early-signals/scoring.js';
import { resolveOpenableInstagramSource } from './instagram-url.js';
import { mapCuratorVerificationForSignal } from '../early-signals/trusted-creator-surface.js';
import { sameWatchlistOccurrence, watchlistOccurrenceIdentityKeys } from './watchlist-intelligence.js';

export async function promoteCuratorLead(leadId: string): Promise<{
  earlySignalId: string | null;
}> {
  const [lead] = await db
    .select()
    .from(curatorEventLeads)
    .where(eq(curatorEventLeads.id, leadId))
    .limit(1);
  if (!lead || lead.dismissedAt) return { earlySignalId: null };

  const attribution = buildAttributionLine(lead.discoveredViaHandle);
  const source = resolveOpenableInstagramSource({
    postUrl: lead.discoveredViaPostUrl,
    handle: lead.discoveredViaHandle,
  });
  const summary = [
    lead.eventName,
    lead.eventDate ? `Date: ${lead.eventDate}` : null,
    lead.eventTime ? `Time: ${lead.eventTime}` : null,
    lead.venue ? `Venue: ${lead.venue}` : null,
    lead.neighborhood ? `Area: ${lead.neighborhood}` : null,
    (lead.researchSummary as { summary?: string })?.summary?.slice(0, 400) ?? null,
    `Source: trusted creator / secondary (${attribution})`,
    source.postUrlAvailable ? null : source.note,
    'Unverified until official confirmation.',
  ]
    .filter(Boolean)
    .join('\n');

  const contentHash = createHash('sha256')
    .update(`curator-lead:${lead.occurrenceFingerprint}`)
    .digest('hex');

  const existing = await findSignalByContentHash(contentHash);
  if (existing) {
    if (existing.signalState === 'skipped' || existing.signalState === 'dismissed') {
      return { earlySignalId: existing.id };
    }
    if (!lead.linkedEarlySignalId) {
      await db
        .update(curatorEventLeads)
        .set({ linkedEarlySignalId: existing.id, updatedAt: new Date() })
        .where(eq(curatorEventLeads.id, leadId));
    }
    return { earlySignalId: existing.id };
  }

  const occCandidates = await db
    .select()
    .from(earlySignals)
    .where(
      and(
        eq(earlySignals.sourceCategory, 'curator_watchlist'),
        inArray(earlySignals.signalType, ['curator_event_lead', 'event']),
        not(inArray(earlySignals.signalState, ['skipped', 'dismissed', 'merged'])),
      ),
    )
    .orderBy(desc(earlySignals.createdAt))
    .limit(200);
  const occMatch = occCandidates.find((row) =>
    sameWatchlistOccurrence(
      {
        title: lead.eventName,
        eventDate: lead.eventDate,
        venue: lead.venue,
        evidence: lead.originalQuotedText,
        type: 'curator_event_lead',
      },
      {
        title: row.title,
        eventDate: row.eventDate ? row.eventDate.toISOString().slice(0, 10) : null,
        venue: row.businessName,
        evidence: row.rawText,
        type: row.signalType,
      },
    ),
  );
  if (occMatch) {
    const nd = (occMatch.normalizedData ?? {}) as Record<string, unknown>;
    const prevUrls = Array.isArray(nd.provenanceUrls)
      ? nd.provenanceUrls.map(String)
      : [occMatch.sourceUrl, lead.discoveredViaPostUrl].filter((url): url is string => Boolean(url));
    await updateSignal(occMatch.id, {
      normalizedData: {
        ...nd,
        provenanceUrls: [...new Set([...prevUrls, lead.discoveredViaPostUrl])],
        occurrenceIdentityKeys: [
          ...new Set([
            ...(Array.isArray(nd.occurrenceIdentityKeys) ? nd.occurrenceIdentityKeys.map(String) : []),
            ...watchlistOccurrenceIdentityKeys({
              title: lead.eventName,
              eventDate: lead.eventDate,
              venue: lead.venue,
              evidence: lead.originalQuotedText,
              type: 'curator_event_lead',
            }),
          ]),
        ],
      },
    });
    if (!lead.linkedEarlySignalId) {
      await db
        .update(curatorEventLeads)
        .set({ linkedEarlySignalId: occMatch.id, updatedAt: new Date() })
        .where(eq(curatorEventLeads.id, leadId));
    }
    return { earlySignalId: occMatch.id };
  }

  const confirmedFacts = [
    lead.eventName,
    lead.eventDate ? `Date claimed: ${lead.eventDate}` : null,
    lead.eventTime ? `Time claimed: ${lead.eventTime}` : null,
    lead.venue ? `Venue claimed: ${lead.venue}` : null,
  ].filter(Boolean) as string[];

  const needsVerification = [
    'Official organizer confirmation',
    'Official date/time',
    source.postUrlAvailable ? null : 'Capture original Instagram post URL',
  ].filter(Boolean) as string[];

  const researchSummaryText =
    typeof (lead.researchSummary as { summary?: string } | null)?.summary === 'string'
      ? (lead.researchSummary as { summary: string }).summary
      : summary;
  const mapped = mapCuratorVerificationForSignal({
    verificationStatus: lead.verificationStatus,
    officialOrganizerUrl: lead.officialOrganizerUrl,
    officialVenueUrl: lead.officialVenueUrl,
    researchSummaryText,
  });

  const created = await insertSignal({
    signalType: 'curator_event_lead',
    title: lead.eventName.slice(0, 200),
    summary: summary.slice(0, 2000),
    sourceUrl: lead.officialOrganizerUrl ?? lead.officialVenueUrl ?? lead.ticketUrl ?? source.url,
    sourceName: `Trusted creator · ${attribution}`,
    sourceCategory: 'curator_watchlist',
    businessName: lead.venue,
    eventDate: lead.eventDate ? new Date(`${lead.eventDate}T12:00:00`) : null,
    rawText: lead.originalQuotedText,
    normalizedData: {
      curatorLeadId: lead.id,
      verificationStatus: lead.verificationStatus,
      discoveredViaHandle: lead.discoveredViaHandle,
      discoveredViaPostUrl: lead.discoveredViaPostUrl,
      discoveredViaSlideNumber: lead.discoveredViaSlideNumber,
      occurrenceFingerprint: lead.occurrenceFingerprint,
      occurrenceIdentityKeys: watchlistOccurrenceIdentityKeys({
        title: lead.eventName,
        eventDate: lead.eventDate,
        venue: lead.venue,
        evidence: lead.originalQuotedText,
        type: 'curator_event_lead',
      }),
      provenanceUrls: [lead.discoveredViaPostUrl],
      sourceOpenUrl: source.url,
      sourceOpenKind: source.kind,
      postUrlAvailable: source.postUrlAvailable,
      creatorRecommendation: lead.creatorRecommendation,
      evidenceText: lead.originalQuotedText,
      extractionConfidence: lead.creatorValueScore,
      officialLinks: {
        organizer: lead.officialOrganizerUrl,
        venue: lead.officialVenueUrl,
        ticket: lead.ticketUrl,
        social: lead.officialSocialUrl,
      },
      copyrightSafeguard: 'facts_only_attribution_required',
      sourceHonesty: 'trusted_creator_secondary_unverified',
    },
    contentHash,
    confidenceLevel: mapped.confidenceLevel,
    confidenceScore: lead.creatorValueScore ?? '0.5',
    confidenceExplanation: [
      {
        factor: 'curator_source',
        points: 20,
        detail: `Trusted creator / secondary source — ${attribution}. Not an official confirmation.`,
      },
      {
        factor: 'verification',
        points: mapped.verificationStatus === 'confirmed' ? 40 : mapped.verificationStatus === 'partial' ? 20 : 10,
        detail: `Verification status: ${lead.verificationStatus} → ${mapped.verificationStatus}`,
      },
    ],
    urgencyLevel: lead.creatorRecommendation === 'visit_in_person' ? 'early_opportunity' : 'planning_lead',
    urgencyScore: lead.creatorValueScore ?? '0.5',
    urgencyExplanation: [
      {
        factor: 'timing',
        points: 15,
        detail: String(
          (lead.creatorValueExplanation as { summary?: string })?.summary ??
            `${lead.eventName} is worth tracking — verify before posting.`,
        ),
      },
    ],
    verificationStatus: mapped.verificationStatus,
    signalState: 'needs_verification',
    watcherId: lead.watcherId,
    contentRecommendation: buildContentRecommendation({
      signalType: 'curator_event_lead',
      confidenceLevel: mapped.confidenceLevel,
      urgencyLevel: lead.creatorRecommendation === 'visit_in_person' ? 'early_opportunity' : 'planning_lead',
      title: lead.eventName,
      confirmedFacts,
      needsVerification,
      sourceName: `Trusted creator · ${attribution}`,
    }),
  });

  await db
    .update(curatorEventLeads)
    .set({ linkedEarlySignalId: created.id, updatedAt: new Date() })
    .where(eq(curatorEventLeads.id, leadId));

  return { earlySignalId: created.id };
}
