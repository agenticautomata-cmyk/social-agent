/**
 * Recompute-on-read authority for Instagram / trusted-creator Early Signals.
 * Producer stamps (planning_lead / confirmed) must not bypass temporal freshness
 * or evidence-authority rules.
 */

import { evaluateTemporalState } from '../creator-agent/temporal-state.js';
import type {
  ConfidenceLevel,
  EarlySignalView,
  UrgencyLevel,
  VerificationStatus,
} from './types.js';

export type TrustedCreatorSurfaceResult = {
  view: EarlySignalView;
  /** False → hide from active Signals / planning queues (retain for history/detail). */
  surfaceEligible: boolean;
  temporalState: 'current' | 'upcoming' | 'expired' | 'unknown';
  demotions: string[];
};

function isTrustedCreatorSignal(view: EarlySignalView): boolean {
  if (view.sourceCategory === 'curator_watchlist') return true;
  const meta = view.metadata ?? {};
  if (meta.sourceKind === 'trusted_creator_secondary') return true;
  if (meta.sourceHonesty === 'trusted_creator_secondary_unverified') return true;
  if (/trusted creator/i.test(view.sourceName ?? '')) return true;
  return false;
}

function hasRecurrenceEvidence(view: EarlySignalView): boolean {
  const links = view.metadata?.officialLinks as Record<string, unknown> | undefined;
  const blob = [
    view.title,
    view.summary,
    view.contentRecommendation?.suggestedTiming,
    typeof links === 'object' ? JSON.stringify(links) : '',
    typeof view.metadata?.normalizedData === 'object'
      ? JSON.stringify(view.metadata.normalizedData)
      : '',
  ]
    .filter(Boolean)
    .join('\n');
  if (
    /\b(every\s+(week|month|friday|saturday|sunday|monday|tuesday|wednesday|thursday)|weekly|monthly|recurring|ongoing series|every other)\b/i.test(
      blob,
    )
  ) {
    return true;
  }
  // Explicit future occurrence beyond a single past date
  const futureDates = blob.match(/\b20\d{2}-\d{2}-\d{2}\b/g) ?? [];
  const now = Date.now();
  return futureDates.some((d) => {
    const t = Date.parse(`${d}T23:59:59.000Z`);
    return Number.isFinite(t) && t > now;
  });
}

/** Official confirmation requires organizer/venue evidence — not a random ticket citation. */
export function hasQualifyingOfficialEvidence(view: EarlySignalView): boolean {
  const normalized = (view.metadata?.normalizedData ?? view.metadata ?? {}) as Record<
    string,
    unknown
  >;
  const links = (normalized.officialLinks ?? view.metadata?.officialLinks ?? {}) as {
    organizer?: string | null;
    venue?: string | null;
    ticket?: string | null;
  };
  const summary = view.summary ?? '';
  if (
    /could(?:n't| not) locate an official|official event could not|unverified until official confirmation|no upcoming events|does not include any events/i.test(
      summary,
    )
  ) {
    return false;
  }
  const organizer = typeof links.organizer === 'string' ? links.organizer.trim() : '';
  const venue = typeof links.venue === 'string' ? links.venue.trim() : '';
  return Boolean(organizer || venue);
}

function dateOnlyAnchor(eventDateIso: string | null): string | null {
  if (!eventDateIso) return null;
  // Prefer calendar day so one-off curator dates expire at Chicago EOD, not noon UTC.
  const day = eventDateIso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return eventDateIso;
  return `${day}T00:00:00.000Z`;
}

export function applyTrustedCreatorSurfaceAuthority(
  view: EarlySignalView,
  now = new Date(),
): TrustedCreatorSurfaceResult {
  const demotions: string[] = [];
  let next: EarlySignalView = {
    ...view,
    metadata: { ...(view.metadata ?? {}) },
  };
  const trusted = isTrustedCreatorSignal(view);

  const startsAt = dateOnlyAnchor(view.eventDate);
  const temporal = evaluateTemporalState({
    startsAt,
    endsAt: null,
    now,
  });
  const recurring = hasRecurrenceEvidence(view);
  let surfaceEligible = true;

  if (temporal.state === 'expired' && !recurring) {
    surfaceEligible = false;
    demotions.push('temporal_expired');
    next = {
      ...next,
      urgencyLevel: 'weak_signal' as UrgencyLevel,
      metadata: {
        ...next.metadata,
        temporalState: 'expired',
        surfaceEligible: false,
        producerUrgencyLevel: view.urgencyLevel,
      },
    };
  } else if (temporal.state === 'expired' && recurring) {
    demotions.push('recurring_kept_despite_past_occurrence');
    next = {
      ...next,
      metadata: {
        ...next.metadata,
        temporalState: 'expired_occurrence_recurring',
        surfaceEligible: true,
      },
    };
  } else {
    next = {
      ...next,
      metadata: {
        ...next.metadata,
        temporalState: temporal.state,
        surfaceEligible: true,
      },
    };
  }

  if (trusted) {
    const officialOk = hasQualifyingOfficialEvidence(view);
    let verificationStatus = next.verificationStatus as VerificationStatus;
    let confidenceLevel = next.confidenceLevel as ConfidenceLevel;

    if (!officialOk) {
      if (verificationStatus === 'confirmed' || verificationStatus === 'verified') {
        verificationStatus = 'unverified';
        demotions.push('trusted_creator_confirmation_demoted');
      }
      if (confidenceLevel === 'confirmed' || confidenceLevel === 'high') {
        confidenceLevel = verificationStatus === 'partial' ? 'medium' : 'low';
        demotions.push('trusted_creator_confidence_capped');
      }
      // Past producer planning_lead must not stay inflated when secondary/unverified
      if (
        surfaceEligible &&
        (next.urgencyLevel === 'planning_lead' || next.urgencyLevel === 'early_opportunity') &&
        verificationStatus === 'unverified'
      ) {
        // keep planning_lead for future unverified leads — still a planning signal
      }
    }

    next = {
      ...next,
      verificationStatus,
      confidenceLevel,
      metadata: {
        ...next.metadata,
        sourceKind: 'trusted_creator_secondary',
        confirmationAuthority: officialOk ? 'official_evidence' : 'trusted_creator_secondary',
        producerVerificationStatus: view.verificationStatus,
        producerConfidenceLevel: view.confidenceLevel,
      },
    };
  }

  return {
    view: next,
    surfaceEligible,
    temporalState: temporal.state,
    demotions,
  };
}

/** Map curator lead verification → signal labels (write path). */
export function mapCuratorVerificationForSignal(input: {
  verificationStatus: string;
  officialOrganizerUrl?: string | null;
  officialVenueUrl?: string | null;
  researchSummaryText?: string | null;
}): { verificationStatus: VerificationStatus; confidenceLevel: ConfidenceLevel } {
  const summary = input.researchSummaryText ?? '';
  const officialFailed =
    /could(?:n't| not) locate an official|official event could not|unverified until official confirmation/i.test(
      summary,
    );
  const hasOfficialPages = Boolean(
    (input.officialOrganizerUrl && input.officialOrganizerUrl.trim()) ||
      (input.officialVenueUrl && input.officialVenueUrl.trim()),
  );
  const qualifying = hasOfficialPages && !officialFailed;

  if (input.verificationStatus === 'VERIFIED' && qualifying) {
    return { verificationStatus: 'confirmed', confidenceLevel: 'high' };
  }
  if (input.verificationStatus === 'PARTIALLY_VERIFIED' || (input.verificationStatus === 'VERIFIED' && !qualifying)) {
    return { verificationStatus: 'partial', confidenceLevel: 'medium' };
  }
  if (input.verificationStatus === 'EXPIRED') {
    return { verificationStatus: 'unverified', confidenceLevel: 'low' };
  }
  return { verificationStatus: 'unverified', confidenceLevel: 'low' };
}
