import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { curatorEventLeads } from '../schema.js';
import { insertSignal } from '../early-signals/store.js';
import { createHash } from 'node:crypto';
import { buildAttributionLine } from './slide-ocr.js';

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
  const summary = [
    lead.eventName,
    lead.eventDate ? `Date: ${lead.eventDate}` : null,
    lead.eventTime ? `Time: ${lead.eventTime}` : null,
    lead.venue ? `Venue: ${lead.venue}` : null,
    lead.neighborhood ? `Area: ${lead.neighborhood}` : null,
    (lead.researchSummary as { summary?: string })?.summary?.slice(0, 400) ?? null,
    attribution,
  ]
    .filter(Boolean)
    .join('\n');

  const contentHash = createHash('sha256')
    .update(`curator-lead:${lead.id}:${lead.occurrenceFingerprint}`)
    .digest('hex');

  const created = await insertSignal({
    signalType: 'curator_event_lead',
    title: lead.eventName.slice(0, 200),
    summary: summary.slice(0, 2000),
    sourceUrl: lead.ticketUrl ?? lead.officialOrganizerUrl ?? lead.discoveredViaPostUrl,
    sourceName: attribution,
    sourceCategory: 'curator_watchlist',
    businessName: lead.venue,
    eventDate: lead.eventDate ? new Date(`${lead.eventDate}T12:00:00`) : null,
    rawText: lead.originalQuotedText,
    normalizedData: {
      curatorLeadId: lead.id,
      verificationStatus: lead.verificationStatus,
      discoveredViaPostUrl: lead.discoveredViaPostUrl,
      discoveredViaSlideNumber: lead.discoveredViaSlideNumber,
      creatorRecommendation: lead.creatorRecommendation,
      officialLinks: {
        organizer: lead.officialOrganizerUrl,
        venue: lead.officialVenueUrl,
        ticket: lead.ticketUrl,
        social: lead.officialSocialUrl,
      },
      copyrightSafeguard: 'facts_only_attribution_required',
    },
    contentHash,
    confidenceLevel:
      lead.verificationStatus === 'VERIFIED'
        ? 'high'
        : lead.verificationStatus === 'PARTIALLY_VERIFIED'
          ? 'medium'
          : 'low',
    confidenceScore: lead.creatorValueScore ?? '0.5',
    confidenceExplanation: [`Curator lead — ${lead.verificationStatus}. ${attribution}.`],
    urgencyLevel: lead.creatorRecommendation === 'visit_in_person' ? 'high' : 'medium',
    urgencyScore: lead.creatorValueScore ?? '0.5',
    urgencyExplanation: [
      String((lead.creatorValueExplanation as { summary?: string })?.summary ?? 'Curator discovery'),
    ],
    verificationStatus:
      lead.verificationStatus === 'VERIFIED'
        ? 'confirmed'
        : lead.verificationStatus === 'PARTIALLY_VERIFIED'
          ? 'partial'
          : 'unverified',
    signalState: 'needs_verification',
    watcherId: lead.watcherId,
    contentRecommendation: {
      recommendation: lead.creatorRecommendation,
      explanation: lead.creatorValueExplanation,
      attribution,
    },
  });

  const signalId = created.id;

  await db
    .update(curatorEventLeads)
    .set({ linkedEarlySignalId: signalId, updatedAt: new Date() })
    .where(eq(curatorEventLeads.id, leadId));

  return { earlySignalId: signalId };
}
