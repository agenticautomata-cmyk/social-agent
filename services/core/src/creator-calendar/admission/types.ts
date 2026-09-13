/**
 * Calendar Admission Authority — shared types.
 * One decision shape for every ingestion path before Calendar-visible writes.
 */

export const CALENDAR_ADMISSION_RULE_VERSION = '2026-09-13.admission.2' as const;

export type CalendarLifecycleStatus =
  | 'candidate'
  | 'quarantined'
  | 'accepted'
  | 'rejected'
  | 'merged_duplicate';

/** Facts may be true while calendar-ineligible (e.g. Dallas concert). */
export type FactStatus = 'supported' | 'unsupported' | 'conflicted' | 'unknown';

/** Editorial/recommendation strength — independent of admission. */
export type EditorialStatus = 'strong' | 'neutral' | 'weak' | 'none';

export type CalendarAdmissionReasonCode =
  | 'outside_service_area'
  | 'location_unverified'
  | 'date_year_unverified'
  | 'stale_source'
  | 'not_a_discrete_event'
  | 'merchandise_not_event'
  | 'news_not_event'
  | 'promotion_not_event'
  | 'contest_not_event'
  | 'announcement_not_event'
  | 'missing_required_fields'
  | 'duplicate_event'
  | 'machine_text_leak'
  | 'source_conflict'
  | 'source_event_mismatch'
  | 'source_missing_event_evidence'
  | 'needs_human_review'
  | 'expired'
  | 'past_event'
  | 'suppressed'
  | 'excluded'
  | 'no_date'
  | 'weak_identity'
  | 'ok';

export type CalendarAdmissionEvidence = {
  title?: string | null;
  venue?: string | null;
  locationName?: string | null;
  formattedAddress?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  sourceUrl?: string | null;
  sourceName?: string | null;
  summary?: string | null;
  description?: string | null;
  eventDate?: string | null;
  eventEndDate?: string | null;
  extractedEventDate?: string | null;
  extractedStartTime?: string | null;
  publicationDate?: string | null;
  retrievalDate?: string | null;
  yearExplicit?: boolean;
  timezone?: string | null;
  parser?: string | null;
  ingest?: string | null;
  attribution?: string | null;
  geoEvidence?: string[];
  temporalEvidence?: string[];
  eventnessEvidence?: string[];
  notes?: string[];
};

export type CalendarDisplayFields = {
  title: string;
  description: string | null;
  location: string | null;
};

export type CalendarAdmissionDecision = {
  lifecycle: CalendarLifecycleStatus;
  calendarStatus: CalendarLifecycleStatus;
  factStatus: FactStatus;
  editorialStatus: EditorialStatus;
  reasonCodes: CalendarAdmissionReasonCode[];
  primaryReason: CalendarAdmissionReasonCode;
  detail: string;
  ruleVersion: typeof CALENDAR_ADMISSION_RULE_VERSION;
  evaluatedAt: string;
  evidence: CalendarAdmissionEvidence;
  display: CalendarDisplayFields;
  /** Surviving identity key when merged; null otherwise. */
  mergeSurvivorKey?: string | null;
  mergedSourceIds?: string[];
};

export type CalendarAdmissionCandidate = {
  id?: string | null;
  title: string;
  summary?: string | null;
  description?: string | null;
  venue?: string | null;
  locationName?: string | null;
  formattedAddress?: string | null;
  neighborhood?: string | null;
  businessName?: string | null;
  city?: string | null;
  state?: string | null;
  sourceUrl?: string | null;
  sourceName?: string | null;
  eventDate?: string | null;
  eventEndDate?: string | null;
  extractedEventDate?: string | null;
  extractedEventEndDate?: string | null;
  extractedStartTime?: string | null;
  publicationDate?: string | null;
  retrievalDate?: string | null;
  yearExplicit?: boolean | null;
  timezone?: string | null;
  parser?: string | null;
  ingest?: string | null;
  category?: string | null;
  attribution?: string | null;
  lifecycleStatus?: string | null;
  creatorValueStatus?: string | null;
  metadata?: Record<string, unknown> | null;
  /** When true, candidate came from a Watchlist-verified first-party listing. */
  watchlistVerified?: boolean;
  /** Manual / user-confirmed / Kellie-owned — admission softens but still blocks corruption. */
  userConfirmed?: boolean;
};

export function isCalendarAccepted(decision: Pick<CalendarAdmissionDecision, 'calendarStatus' | 'lifecycle'>): boolean {
  return decision.calendarStatus === 'accepted' && decision.lifecycle === 'accepted';
}
