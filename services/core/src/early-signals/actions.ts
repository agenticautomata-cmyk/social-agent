import { promoteSignalToOpportunity } from './promote.js';
import { loadSignalView, updateSignal, listRecentDeliveries } from './store.js';
import { db } from '../db.js';
import { curatorEventLeads, earlySignals, sourceWatchers } from '../schema.js';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { computeOccurrenceFingerprint } from '../creator-skip/fingerprint.js';
import { researchCuratorEventLead } from '../curator-watchlist/event-research.js';
import { dismissCuratorLead } from '../curator-watchlist/store.js';
import { buildContentRecommendation } from './scoring.js';

function curatorLeadIdFromSignal(signal: typeof earlySignals.$inferSelect): string | null {
  const normalized = (signal.normalizedData ?? {}) as Record<string, unknown>;
  const id = normalized.curatorLeadId;
  return typeof id === 'string' ? id : null;
}

function occurrenceFingerprintFromSignal(signal: typeof earlySignals.$inferSelect): string {
  const normalized = (signal.normalizedData ?? {}) as Record<string, unknown>;
  if (typeof normalized.occurrenceFingerprint === 'string' && normalized.occurrenceFingerprint) {
    return normalized.occurrenceFingerprint;
  }
  return computeOccurrenceFingerprint({
    title: signal.title,
    eventDate: signal.eventDate?.toISOString() ?? null,
    locationName: signal.businessName ?? signal.address,
    sourceUrl: signal.sourceUrl,
    summary: signal.summary,
  });
}

async function emitSkipRevision(signalId: string, sourceScreen: string, fingerprint: string) {
  try {
    const { emitDataChange } = await import('../data-revision/index.js');
    await emitDataChange({
      eventType: 'skip',
      domains: ['early_signals', 'opportunities', 'home_briefing'],
      completedAt: new Date().toISOString(),
      source: sourceScreen,
      recordIds: [signalId],
      success: true,
      metadata: { fingerprint },
    });
  } catch {
    /* ignore */
  }
}

export async function dismissSignal(signalId: string, reason?: string): Promise<{ ok: true }> {
  const [signal] = await db.select().from(earlySignals).where(eq(earlySignals.id, signalId)).limit(1);
  if (!signal) throw new Error('Signal not found');

  const now = new Date();
  const auditReason = reason?.trim() || 'dismissed';
  await updateSignal(signalId, {
    signalState: 'dismissed',
    dismissedAt: now,
    metadata: {
      ...(signal.metadata as Record<string, unknown>),
      dismissReason: auditReason,
      dismissedAt: now.toISOString(),
    },
  });

  const leadId = curatorLeadIdFromSignal(signal);
  if (leadId) {
    await dismissCuratorLead(leadId, auditReason).catch(() => false);
  }

  return { ok: true };
}

export async function skipSignal(
  signalId: string,
  sourceScreen = 'early_signals',
  reason?: string,
): Promise<{ ok: true; fingerprint: string; skippedAt: string }> {
  const [signal] = await db.select().from(earlySignals).where(eq(earlySignals.id, signalId)).limit(1);
  if (!signal) throw new Error('Signal not found');

  const now = new Date();
  const fingerprint = occurrenceFingerprintFromSignal(signal);
  const auditReason = reason?.trim() || 'skipped_for_now';

  await updateSignal(signalId, {
    signalState: 'skipped',
    metadata: {
      ...(signal.metadata as Record<string, unknown>),
      skippedAt: now.toISOString(),
      sourceScreen,
      skipNotDismiss: true,
      skipReason: auditReason,
      skippedFingerprint: fingerprint,
    },
  });

  // Hide sibling rows from the same curator occurrence / fingerprint so Skip sticks after reload.
  const siblings = await db
    .select({ id: earlySignals.id, metadata: earlySignals.metadata, normalizedData: earlySignals.normalizedData })
    .from(earlySignals)
    .where(
      and(
        isNull(earlySignals.dismissedAt),
        sql`${earlySignals.id} <> ${signalId}`,
        sql`${earlySignals.signalState} IN ('active', 'needs_verification', 'snoozed')`,
        sql`(
          ${earlySignals.normalizedData}->>'occurrenceFingerprint' = ${fingerprint}
          OR ${earlySignals.metadata}->>'skippedFingerprint' = ${fingerprint}
          OR (
            ${earlySignals.title} = ${signal.title}
            AND coalesce(${earlySignals.businessName}, '') = ${signal.businessName ?? ''}
            AND ${earlySignals.sourceCategory} = 'curator_watchlist'
          )
        )`,
      ),
    );

  for (const sibling of siblings) {
    await updateSignal(sibling.id, {
      signalState: 'skipped',
      metadata: {
        ...((sibling.metadata ?? {}) as Record<string, unknown>),
        skippedAt: now.toISOString(),
        sourceScreen,
        skipNotDismiss: true,
        skipReason: auditReason,
        skippedFingerprint: fingerprint,
        skippedAsSiblingOf: signalId,
      },
    });
  }

  await emitSkipRevision(signalId, sourceScreen, fingerprint);
  return { ok: true, fingerprint, skippedAt: now.toISOString() };
}

export async function snoozeSignal(signalId: string, hours = 24): Promise<{ ok: true }> {
  const until = new Date(Date.now() + hours * 3600000);
  await updateSignal(signalId, { signalState: 'snoozed', snoozedUntil: until });
  return { ok: true };
}

export async function markSignalVerified(signalId: string): Promise<{ ok: true }> {
  await updateSignal(signalId, {
    verificationStatus: 'verified',
    confidenceLevel: 'high',
    signalState: 'active',
    metadata: {
      verifiedAt: new Date().toISOString(),
      verifyAction: 'approve_verified',
    },
  });
  return { ok: true };
}

export async function mergeSignals(primaryId: string, duplicateId: string): Promise<void> {
  await updateSignal(duplicateId, { signalState: 'merged', dismissedAt: new Date() });
  const primary = await loadSignalView(primaryId);
  const duplicate = await loadSignalView(duplicateId);
  if (primary && duplicate) {
    await updateSignal(primaryId, {
      summary: `${primary.summary}\n\nMerged: ${duplicate.summary}`.slice(0, 4000),
      metadata: {
        ...primary.metadata,
        mergedSignalIds: [...((primary.metadata.mergedSignalIds as string[]) ?? []), duplicateId],
      },
    });
  }
}

export async function approveSignalAsOpportunity(signalId: string) {
  const [signal] = await db.select().from(earlySignals).where(eq(earlySignals.id, signalId)).limit(1);
  if (!signal) throw new Error('Signal not found');
  const result = await promoteSignalToOpportunity(signal);
  const now = new Date();
  await updateSignal(signalId, {
    verificationStatus: 'verified',
    confidenceLevel: 'high',
    metadata: {
      ...(signal.metadata as Record<string, unknown>),
      verifiedAt: now.toISOString(),
      verifyAction: 'approve_verified',
    },
  });
  return result;
}

export async function reportMalformedSignal(signalId: string, note?: string): Promise<{ ok: true }> {
  const [signal] = await db.select().from(earlySignals).where(eq(earlySignals.id, signalId)).limit(1);
  if (!signal) throw new Error('Signal not found');

  const now = new Date();
  const auditNote = note?.trim() || 'malformed_record';
  await updateSignal(signalId, {
    signalState: 'dismissed',
    dismissedAt: now,
    metadata: {
      ...(signal.metadata as Record<string, unknown>),
      malformedReport: true,
      malformedReportedAt: now.toISOString(),
      malformedNote: auditNote,
    },
  });

  return { ok: true };
}

/** Promote into Opportunities without claiming official verification. */
export async function keepSignalAsUnverifiedOpportunity(signalId: string) {
  const [signal] = await db.select().from(earlySignals).where(eq(earlySignals.id, signalId)).limit(1);
  if (!signal) throw new Error('Signal not found');
  const result = await promoteSignalToOpportunity(signal);
  await updateSignal(signalId, {
    verificationStatus: 'unverified',
    metadata: {
      ...(signal.metadata as Record<string, unknown>),
      keptUnverifiedAt: new Date().toISOString(),
      keptUnverified: true,
    },
  });
  return { ...result, verificationStatus: 'unverified' as const };
}

export async function researchSignalOfficialSource(signalId: string) {
  const [signal] = await db.select().from(earlySignals).where(eq(earlySignals.id, signalId)).limit(1);
  if (!signal) throw new Error('Signal not found');

  const leadId = curatorLeadIdFromSignal(signal);
  let lead =
    leadId != null
      ? (
          await db.select().from(curatorEventLeads).where(eq(curatorEventLeads.id, leadId)).limit(1)
        )[0]
      : null;

  const handle = (lead?.discoveredViaHandle ?? 'jasfoodjourney').replace(/^@/, '');
  const research = await researchCuratorEventLead({
    event: {
      eventName: lead?.eventName ?? signal.title,
      eventDate: lead?.eventDate ?? signal.eventDate?.toISOString().slice(0, 10) ?? null,
      eventTime: lead?.eventTime ?? null,
      venue: lead?.venue ?? signal.businessName,
      neighborhood: lead?.neighborhood ?? signal.city,
      price: lead?.price ?? null,
      ageRestriction: lead?.ageRestriction ?? null,
      registrationNotes: lead?.registrationNotes ?? null,
      dayHeading: lead?.dayHeading ?? null,
      originalQuotedText: lead?.originalQuotedText ?? signal.rawText ?? signal.summary,
      slideNumber: lead?.discoveredViaSlideNumber ?? 0,
    },
    curatorHandle: handle,
    postUrl: lead?.discoveredViaPostUrl ?? signal.sourceUrl ?? `https://www.instagram.com/${handle}/`,
  });

  if (lead) {
    const [updated] = await db
      .update(curatorEventLeads)
      .set({
        verificationStatus: research.verificationStatus,
        officialOrganizerUrl: research.officialOrganizerUrl,
        officialVenueUrl: research.officialVenueUrl,
        ticketUrl: research.ticketUrl,
        officialSocialUrl: research.officialSocialUrl,
        researchSummary: {
          summary: research.summary,
          citations: research.citations,
          conflicts: research.conflicts,
        },
        verificationNotes: research.conflicts.join('; ') || null,
        verifiedAt: research.verificationStatus === 'VERIFIED' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(curatorEventLeads.id, lead.id))
      .returning();
    lead = updated ?? lead;
  }

  const officialUrl =
    research.ticketUrl ?? research.officialOrganizerUrl ?? research.officialVenueUrl ?? research.officialSocialUrl;

  const recommendation = buildContentRecommendation({
    signalType: signal.signalType,
    confidenceLevel:
      research.verificationStatus === 'VERIFIED'
        ? 'high'
        : research.verificationStatus === 'PARTIALLY_VERIFIED'
          ? 'medium'
          : 'low',
    urgencyLevel: signal.urgencyLevel as import('./types.js').UrgencyLevel,
    title: signal.title,
    confirmedFacts: [signal.title, signal.businessName].filter(Boolean).map(String),
    needsVerification:
      research.verificationStatus === 'VERIFIED'
        ? []
        : ['Confirm official date/time', 'Confirm venue', 'Confirm tickets/RSVP'],
    sourceName: signal.sourceName,
  });

  await updateSignal(signalId, {
    verificationStatus:
      research.verificationStatus === 'VERIFIED'
        ? 'verified'
        : research.verificationStatus === 'PARTIALLY_VERIFIED'
          ? 'partial'
          : 'unverified',
    confidenceLevel:
      research.verificationStatus === 'VERIFIED'
        ? 'high'
        : research.verificationStatus === 'PARTIALLY_VERIFIED'
          ? 'medium'
          : 'low',
    contentRecommendation: recommendation,
    sourceUrl: officialUrl ?? signal.sourceUrl,
    normalizedData: {
      ...(signal.normalizedData as Record<string, unknown>),
      officialLinks: {
        organizer: research.officialOrganizerUrl,
        venue: research.officialVenueUrl,
        ticket: research.ticketUrl,
        social: research.officialSocialUrl,
      },
      researchSummary: research.summary,
      researchedAt: new Date().toISOString(),
    },
    metadata: {
      ...(signal.metadata as Record<string, unknown>),
      lastResearchedAt: new Date().toISOString(),
    },
  });

  return {
    ok: true as const,
    verificationStatus: research.verificationStatus,
    officialUrl,
    summary: research.summary,
    citations: research.citations,
  };
}

export async function getSignalDetail(signalId: string) {
  const view = await loadSignalView(signalId);
  if (!view) return null;
  const deliveries = await listRecentDeliveries(signalId);
  return {
    signal: view,
    deliveries: deliveries.map((d) => ({
      id: d.id,
      channel: d.channel,
      success: d.success,
      deliveredAt: d.deliveredAt.toISOString(),
      providerResponse: d.providerResponse,
      retryCount: d.retryCount,
    })),
  };
}

export async function disableWatcher(watcherId: string): Promise<void> {
  await db.update(sourceWatchers).set({ enabled: false, updatedAt: new Date() }).where(eq(sourceWatchers.id, watcherId));
}
