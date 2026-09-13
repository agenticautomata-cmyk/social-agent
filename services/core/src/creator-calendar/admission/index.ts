/**
 * Calendar Admission Authority — single boundary for Calendar-visible suggestions.
 */
export {
  CALENDAR_ADMISSION_RULE_VERSION,
  isCalendarAccepted,
  type CalendarAdmissionCandidate,
  type CalendarAdmissionDecision,
  type CalendarAdmissionEvidence,
  type CalendarAdmissionReasonCode,
  type CalendarDisplayFields,
  type CalendarLifecycleStatus,
  type EditorialStatus,
  type FactStatus,
} from './types.js';

export {
  evaluateCalendarAdmission,
  admissionDecisionToMetadata,
  readAdmissionFromMetadata,
} from './evaluate.js';

export {
  admissionCandidateFromInventory,
  admissionCandidateFromCuratorLead,
  admissionCandidateFromScoutPromote,
  type AdmissionCuratorLeadInput,
} from './from-sources.js';

export { calendarAdmissionAllowsDisplay } from './displayable.js';
export { sanitizeCalendarDisplay, hasMachineTextLeak } from './sanitize.js';
export {
  normalizeAdmissionTitle,
  admissionTitlesLikelySame,
  admissionEntitiesMatch,
  chicagoDayKeyFromIso,
  normalizeVenueKey,
} from './entity-resolution.js';

export { evaluateGeographicGate } from './gates/geographic.js';
export { evaluateTemporalGate } from './gates/temporal.js';
export { evaluateEventnessGate } from './gates/eventness.js';
export { evaluateCompletenessGate } from './gates/completeness.js';
export {
  evaluateSourceEvidenceGate,
  scrubMismatchedSourceUrl,
} from './gates/source-evidence.js';
export { resolveCanonicalVenue, getCanonicalVenueById, listCanonicalVenueIds } from './venues/resolve.js';
export { CANONICAL_KC_VENUES, type CanonicalVenueRecord } from './venues/registry.js';
export {
  preferAdmissionStartIso,
} from './entity-resolution.js';

export {
  NAMED_ADMISSION_FIXTURES,
  type NamedAdmissionFixture,
} from './fixtures/named-failures.js';
