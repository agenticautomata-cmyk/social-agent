/**
 * Authoritative Calendar admission evaluation.
 * Every Calendar-visible suggestion must pass through evaluateCalendarAdmission.
 */
import {
  evaluateDiscoverCalendarJunkGates,
} from '../../creator-interest/discover-trust.js';
import {
  isEditorialArticleItem,
  isEditorialHeadlineTitle,
} from '../../inventory/today-clarity.js';
import { isEmploymentOpportunity } from '../../creator-agent/employment-intent.js';
import { isOperatorTemporallyCurrent } from '../../creator-agent/stale-temporal-prose.js';
import { getCreatorTimezone } from '../../datetime.js';
import { evaluateCompletenessGate } from './gates/completeness.js';
import { evaluateEventnessGate } from './gates/eventness.js';
import { evaluateGeographicGate } from './gates/geographic.js';
import { evaluateTemporalGate } from './gates/temporal.js';
import { hasMachineTextLeak, sanitizeCalendarDisplay } from './sanitize.js';
import {
  CALENDAR_ADMISSION_RULE_VERSION,
  type CalendarAdmissionCandidate,
  type CalendarAdmissionDecision,
  type CalendarAdmissionReasonCode,
  type FactStatus,
} from './types.js';

function decide(input: {
  lifecycle: CalendarAdmissionDecision['lifecycle'];
  reasonCodes: CalendarAdmissionReasonCode[];
  primaryReason: CalendarAdmissionReasonCode;
  detail: string;
  factStatus: FactStatus;
  evidence: CalendarAdmissionDecision['evidence'];
  display: CalendarAdmissionDecision['display'];
  now: Date;
}): CalendarAdmissionDecision {
  return {
    lifecycle: input.lifecycle,
    calendarStatus: input.lifecycle,
    factStatus: input.factStatus,
    editorialStatus: 'none',
    reasonCodes: input.reasonCodes,
    primaryReason: input.primaryReason,
    detail: input.detail,
    ruleVersion: CALENDAR_ADMISSION_RULE_VERSION,
    evaluatedAt: input.now.toISOString(),
    evidence: input.evidence,
    display: input.display,
  };
}

/**
 * Single admission boundary. Calendar displays only lifecycle === 'accepted'.
 */
export function evaluateCalendarAdmission(
  candidate: CalendarAdmissionCandidate,
  now = new Date(),
): CalendarAdmissionDecision {
  const sanitized = sanitizeCalendarDisplay(candidate);
  const evidenceBase = {
    title: candidate.title,
    venue: candidate.venue,
    locationName: candidate.locationName,
    formattedAddress: candidate.formattedAddress,
    neighborhood: candidate.neighborhood,
    city: candidate.city,
    state: candidate.state,
    sourceUrl: candidate.sourceUrl,
    sourceName: candidate.sourceName,
    summary: candidate.summary,
    description: candidate.description,
    eventDate: candidate.eventDate,
    eventEndDate: candidate.eventEndDate,
    extractedEventDate: candidate.extractedEventDate,
    extractedStartTime: candidate.extractedStartTime,
    publicationDate: candidate.publicationDate,
    retrievalDate: candidate.retrievalDate ?? now.toISOString(),
    yearExplicit: candidate.yearExplicit ?? undefined,
    timezone: candidate.timezone ?? 'America/Chicago',
    parser: candidate.parser,
    ingest: candidate.ingest,
    attribution: candidate.attribution ?? candidate.sourceName,
    notes: [] as string[],
  };

  if (candidate.lifecycleStatus === 'expired' || candidate.lifecycleStatus === 'archived') {
    return decide({
      lifecycle: 'rejected',
      reasonCodes: ['expired'],
      primaryReason: 'expired',
      detail: String(candidate.lifecycleStatus),
      factStatus: 'unsupported',
      evidence: evidenceBase,
      display: sanitized.display,
      now,
    });
  }
  if (candidate.creatorValueStatus === 'rejected' || candidate.creatorValueStatus === 'archived') {
    return decide({
      lifecycle: 'rejected',
      reasonCodes: ['suppressed'],
      primaryReason: 'suppressed',
      detail: String(candidate.creatorValueStatus),
      factStatus: 'unsupported',
      evidence: evidenceBase,
      display: sanitized.display,
      now,
    });
  }

  const completeness = evaluateCompletenessGate(candidate);
  if (!completeness.ok) {
    return decide({
      lifecycle: completeness.quarantine ? 'quarantined' : 'rejected',
      reasonCodes: [completeness.reason ?? 'missing_required_fields'],
      primaryReason: completeness.reason ?? 'missing_required_fields',
      detail: completeness.detail,
      factStatus: 'unsupported',
      evidence: { ...evidenceBase, notes: completeness.missing },
      display: sanitized.display,
      now,
    });
  }

  if (hasMachineTextLeak(candidate.description) || hasMachineTextLeak(candidate.summary)) {
    // Sanitation may clear it for display, but raw leak still quarantines weak rows.
    if (sanitized.machineTextLeak) {
      return decide({
        lifecycle: 'quarantined',
        reasonCodes: ['machine_text_leak'],
        primaryReason: 'machine_text_leak',
        detail: sanitized.leakReasons.join(',') || 'machine_text_leak',
        factStatus: 'unknown',
        evidence: { ...evidenceBase, notes: sanitized.leakReasons },
        display: sanitized.display,
        now,
      });
    }
  }

  const eventness = evaluateEventnessGate(candidate);
  if (!eventness.ok) {
    return decide({
      lifecycle: 'rejected',
      reasonCodes: [eventness.reason ?? 'not_a_discrete_event'],
      primaryReason: eventness.reason ?? 'not_a_discrete_event',
      detail: eventness.detail,
      factStatus: 'supported',
      evidence: { ...evidenceBase, eventnessEvidence: eventness.eventnessEvidence },
      display: sanitized.display,
      now,
    });
  }

  const geo = evaluateGeographicGate(candidate);
  if (!geo.ok) {
    return decide({
      lifecycle: geo.quarantine ? 'quarantined' : 'rejected',
      reasonCodes: [geo.reason ?? 'location_unverified'],
      primaryReason: geo.reason ?? 'location_unverified',
      detail: geo.detail,
      factStatus: geo.factSupported ? 'supported' : 'unsupported',
      evidence: { ...evidenceBase, geoEvidence: geo.geoEvidence },
      display: sanitized.display,
      now,
    });
  }

  const temporal = evaluateTemporalGate(candidate, now);
  if (!temporal.ok) {
    return decide({
      lifecycle: temporal.quarantine ? 'quarantined' : 'rejected',
      reasonCodes: [temporal.reason ?? 'date_year_unverified'],
      primaryReason: temporal.reason ?? 'date_year_unverified',
      detail: temporal.detail,
      factStatus: temporal.reason === 'stale_source' ? 'unsupported' : 'unknown',
      evidence: {
        ...evidenceBase,
        temporalEvidence: temporal.temporalEvidence,
        yearExplicit: temporal.yearExplicit,
      },
      display: sanitized.display,
      now,
    });
  }

  // Shared Discover junk (trade conference, SEO leftover, remote headline, etc.).
  const junk = evaluateDiscoverCalendarJunkGates({
    title: candidate.title,
    summary: candidate.summary,
    sourceUrl: candidate.sourceUrl,
    eventStartsAt: candidate.eventDate,
    locationName: candidate.locationName,
    venue: candidate.venue,
    formattedAddress: candidate.formattedAddress,
    containerChild: candidate.metadata?.containerChild === true,
  });
  if (junk.junk) {
    const reason: CalendarAdmissionReasonCode =
      junk.reason === 'remote_city_headline' ? 'outside_service_area' : 'excluded';
    return decide({
      lifecycle: 'rejected',
      reasonCodes: [reason],
      primaryReason: reason,
      detail: junk.reason,
      factStatus: 'unsupported',
      evidence: { ...evidenceBase, notes: [junk.reason] },
      display: sanitized.display,
      now,
    });
  }

  // Legacy inventory-style exclusions that remain Calendar-ineligible.
  if (
    isEmploymentOpportunity({
      title: candidate.title,
      summary: candidate.summary,
      category: candidate.category,
      sourceUrl: candidate.sourceUrl,
      metadata: candidate.metadata ?? undefined,
    })
  ) {
    return decide({
      lifecycle: 'rejected',
      reasonCodes: ['excluded'],
      primaryReason: 'excluded',
      detail: 'employment',
      factStatus: 'supported',
      evidence: evidenceBase,
      display: sanitized.display,
      now,
    });
  }
  if (
    isEditorialHeadlineTitle(candidate.title) ||
    isEditorialArticleItem({
      title: candidate.title,
      sourceName: candidate.sourceName,
      ingest: candidate.ingest,
      summary: candidate.summary,
      category: candidate.category,
    })
  ) {
    return decide({
      lifecycle: 'rejected',
      reasonCodes: ['excluded'],
      primaryReason: 'excluded',
      detail: 'editorial',
      factStatus: 'unsupported',
      evidence: evidenceBase,
      display: sanitized.display,
      now,
    });
  }

  if (
    candidate.eventDate &&
    !isOperatorTemporallyCurrent({
      startsAt: candidate.eventDate,
      endsAt: candidate.eventEndDate,
      summaryText: candidate.summary,
      now,
    })
  ) {
    return decide({
      lifecycle: 'rejected',
      reasonCodes: ['expired'],
      primaryReason: 'expired',
      detail: 'not_temporally_current',
      factStatus: 'unsupported',
      evidence: evidenceBase,
      display: sanitized.display,
      now,
    });
  }

  // Past-day checks use inventoryTemporalDayKey at the eligibility layer (Chicago/extracted clocks).

  return decide({
    lifecycle: 'accepted',
    reasonCodes: ['ok'],
    primaryReason: 'ok',
    detail: 'accepted',
    factStatus: 'supported',
    evidence: {
      ...evidenceBase,
      geoEvidence: geo.geoEvidence,
      temporalEvidence: temporal.temporalEvidence,
      eventnessEvidence: eventness.eventnessEvidence,
      yearExplicit: temporal.yearExplicit,
    },
    display: sanitized.display,
    now,
  });
}

export function admissionDecisionToMetadata(decision: CalendarAdmissionDecision): Record<string, unknown> {
  return {
    calendarAdmission: {
      lifecycle: decision.lifecycle,
      calendarStatus: decision.calendarStatus,
      factStatus: decision.factStatus,
      editorialStatus: decision.editorialStatus,
      reasonCodes: decision.reasonCodes,
      primaryReason: decision.primaryReason,
      detail: decision.detail,
      ruleVersion: decision.ruleVersion,
      evaluatedAt: decision.evaluatedAt,
      evidence: decision.evidence,
      display: decision.display,
      mergeSurvivorKey: decision.mergeSurvivorKey ?? null,
      mergedSourceIds: decision.mergedSourceIds ?? [],
    },
  };
}

export function readAdmissionFromMetadata(
  metadata: unknown,
): CalendarAdmissionDecision | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const raw = (metadata as Record<string, unknown>).calendarAdmission;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.lifecycle !== 'string' || typeof d.ruleVersion !== 'string') return null;
  return {
    lifecycle: d.lifecycle as CalendarAdmissionDecision['lifecycle'],
    calendarStatus: (d.calendarStatus as CalendarAdmissionDecision['lifecycle']) ?? (d.lifecycle as CalendarAdmissionDecision['lifecycle']),
    factStatus: (d.factStatus as FactStatus) ?? 'unknown',
    editorialStatus: (d.editorialStatus as CalendarAdmissionDecision['editorialStatus']) ?? 'none',
    reasonCodes: Array.isArray(d.reasonCodes)
      ? (d.reasonCodes as CalendarAdmissionReasonCode[])
      : [],
    primaryReason: (d.primaryReason as CalendarAdmissionReasonCode) ?? 'needs_human_review',
    detail: typeof d.detail === 'string' ? d.detail : '',
    ruleVersion: d.ruleVersion as typeof CALENDAR_ADMISSION_RULE_VERSION,
    evaluatedAt: typeof d.evaluatedAt === 'string' ? d.evaluatedAt : '',
    evidence: (d.evidence as CalendarAdmissionDecision['evidence']) ?? {},
    display: (d.display as CalendarAdmissionDecision['display']) ?? {
      title: '',
      description: null,
      location: null,
    },
    mergeSurvivorKey: typeof d.mergeSurvivorKey === 'string' ? d.mergeSurvivorKey : null,
    mergedSourceIds: Array.isArray(d.mergedSourceIds)
      ? d.mergedSourceIds.filter((x): x is string => typeof x === 'string')
      : [],
  };
}
