/**
 * Discovery-layer contact lifecycle states for Kansas City partnership intelligence.
 *
 * These are richer than the send-gate {@link ContactEvidenceState} set: they track
 * programs, staleness, conflicts, and blocklist removals. Mapping into the send
 * contract is one-way and never widens what Benson may email.
 */

import {
  normalizeContactEvidenceState,
  type ContactEvidenceState,
} from '../../partnership-contracts/contact-evidence.js';

export const DISCOVERY_CONTACT_STATES = [
  'verified_named_contact',
  'verified_role_inbox',
  'verified_official_form',
  'verified_program',
  'official_general_route',
  'stale_needs_recheck',
  'conflicting',
  'inferred_unverified',
  'unknown',
  'blocked_or_removed',
] as const;

export type DiscoveryContactState = (typeof DISCOVERY_CONTACT_STATES)[number];

const STATE_LABELS: Record<DiscoveryContactState, string> = {
  verified_named_contact: 'Verified named contact',
  verified_role_inbox: 'Verified role inbox',
  verified_official_form: 'Verified official form',
  verified_program: 'Verified program or application',
  official_general_route: 'Official general route',
  stale_needs_recheck: 'Stale — needs recheck',
  conflicting: 'Conflicting evidence',
  inferred_unverified: 'Inferred / unverified',
  unknown: 'Unknown',
  blocked_or_removed: 'Blocked or removed',
};

export function isDiscoveryContactState(value: unknown): value is DiscoveryContactState {
  return (
    typeof value === 'string' &&
    (DISCOVERY_CONTACT_STATES as readonly string[]).includes(value)
  );
}

export function normalizeDiscoveryContactState(value: unknown): DiscoveryContactState {
  return isDiscoveryContactState(value) ? value : 'unknown';
}

export function discoveryContactStateLabel(state: DiscoveryContactState): string {
  return STATE_LABELS[state];
}

/**
 * Maps a discovery lifecycle state onto the send-safety contact-evidence contract.
 *
 * Never upgrades. Lifecycle-only states that must not be emailed map to
 * `inferred_unverified` or `unknown` so existing send gates keep refusing them.
 */
export function toSendEvidenceState(state: DiscoveryContactState): ContactEvidenceState {
  switch (state) {
    case 'verified_named_contact':
      return 'verified_named_decision_maker';
    case 'verified_role_inbox':
      return 'verified_role_inbox';
    case 'verified_official_form':
    case 'verified_program':
      return 'official_contact_form';
    case 'official_general_route':
      return 'official_general_inbox';
    case 'stale_needs_recheck':
      // Stale is a freshness overlay; underlying send state must not look verified.
      return 'inferred_unverified';
    case 'conflicting':
      return 'inferred_unverified';
    case 'inferred_unverified':
      return 'inferred_unverified';
    case 'blocked_or_removed':
    case 'unknown':
      return 'unknown';
  }
}

/**
 * Inverse helper for imports / UI that already store send-contract states.
 * Conservative: anything ambiguous lands on inferred_unverified.
 */
export function fromSendEvidenceState(state: unknown): DiscoveryContactState {
  const normalized = normalizeContactEvidenceState(state);
  switch (normalized) {
    case 'verified_named_decision_maker':
      return 'verified_named_contact';
    case 'verified_role_inbox':
      return 'verified_role_inbox';
    case 'official_contact_form':
      return 'verified_official_form';
    case 'official_general_inbox':
      return 'official_general_route';
    case 'inferred_unverified':
      return 'inferred_unverified';
    case 'unknown':
      return 'unknown';
  }
}

/** True when discovery considers the contact ready for human review toward outreach. */
export function isDiscoveryPotentiallyUseful(state: DiscoveryContactState): boolean {
  return (
    state === 'verified_named_contact' ||
    state === 'verified_role_inbox' ||
    state === 'verified_official_form' ||
    state === 'verified_program' ||
    state === 'official_general_route'
  );
}

/**
 * True when the discovery state must never become send-ready without new evidence.
 * Includes inferred, unknown, blocked, conflicting, and stale overlays.
 */
export function isDiscoverySendBlocked(state: DiscoveryContactState): boolean {
  return !isDiscoveryPotentiallyUseful(state);
}
