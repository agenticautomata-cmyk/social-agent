/**
 * Creates discovery evidence records from research findings.
 *
 * Output is evidence for the review queue — never a send-ready pitch.
 * Records map into {@link ContactEvidenceRecord} fields via
 * {@link toContactEvidenceRecord} so send gates stay authoritative.
 */

import {
  officialInboxStateForLocalPart,
  type ContactEvidenceRecord,
  type ContactEvidenceState,
} from '../../partnership-contracts/contact-evidence.js';
import { emailInferenceBlockReason } from './email-inference.js';
import {
  applyFreshnessToDiscoveryState,
  evaluateDiscoveryFreshness,
  type DiscoveryFreshnessVerdict,
} from './freshness.js';
import { evaluateDiscoveryPurpose } from './purpose-blocklist.js';
import {
  classifyRouteOntoSearchStep,
  type ContactDiscoveryStepId,
} from './search-order.js';
import {
  isDiscoveryContactState,
  toSendEvidenceState,
  type DiscoveryContactState,
} from './states.js';

export type DiscoveryRouteKind =
  | 'media_press'
  | 'staff_directory'
  | 'creator_program'
  | 'affiliate_program'
  | 'partnership_page'
  | 'contact_form'
  | 'tourism_association'
  | 'general_inbox'
  | 'none';

export type DiscoveryFindingInput = {
  organizationName: string;
  routeKind: DiscoveryRouteKind;
  personName?: string | null;
  personRole?: string | null;
  email?: string | null;
  phone?: string | null;
  contactFormUrl?: string | null;
  programUrl?: string | null;
  officialSocialUrl?: string | null;
  evidenceUrl?: string | null;
  /** Must be true only for first-party or official affiliated pages. */
  sourceIsOfficial: boolean;
  /** True only when the exact email string was copied from that page. */
  emailObservedOnOfficialPage?: boolean;
  publishedLabel?: string | null;
  verificationMethod?: string | null;
  evidenceCapturedAt?: string | null;
  lastRecheckedAt?: string | null;
  conflictNote?: string | null;
  excerpt?: string | null;
  /** Workbook or prior confidence — never treated as permanent verification alone. */
  importedConfidence?: string | null;
  explicitBlocklist?: ReadonlyArray<{ address: string; reason: string }>;
  now?: Date;
};

export type DiscoveryEvidenceRecord = {
  discoveryState: DiscoveryContactState;
  sendEvidenceState: ContactEvidenceState;
  searchStepId: ContactDiscoveryStepId;
  organizationName: string;
  personName: string | null;
  personRole: string | null;
  representsBusiness: string;
  email: string | null;
  phone: string | null;
  contactFormUrl: string | null;
  programUrl: string | null;
  officialSocialUrl: string | null;
  evidenceUrl: string | null;
  sourceIsOfficial: boolean;
  verificationMethod: string | null;
  evidenceCapturedAt: string | null;
  lastRecheckedAt: string | null;
  conflictNote: string | null;
  staleNote: string | null;
  excerpt: string | null;
  importedConfidence: string | null;
  freshness: DiscoveryFreshnessVerdict;
  /** Why this record is not yet actionable, if blocked at creation. */
  creationBlockers: string[];
  /** Research produces evidence only — never a pitch. */
  producesPitch: false;
};

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
}

function classifyDiscoveryState(input: DiscoveryFindingInput): {
  state: DiscoveryContactState;
  blockers: string[];
} {
  const blockers: string[] = [];
  const email = blankToNull(input.email);
  const formUrl = blankToNull(input.contactFormUrl) ?? blankToNull(input.programUrl);
  const observed = Boolean(input.emailObservedOnOfficialPage && input.sourceIsOfficial);

  if (input.conflictNote?.trim()) {
    return { state: 'conflicting', blockers: [`Conflicting evidence: ${input.conflictNote.trim()}`] };
  }

  if (email) {
    const purpose = evaluateDiscoveryPurpose({
      email,
      publishedLabel: input.publishedLabel,
      explicitBlocklist: input.explicitBlocklist,
    });
    if (!purpose.allowed) {
      blockers.push(purpose.reason ?? 'Wrong-purpose inbox.');
      return { state: 'blocked_or_removed', blockers };
    }

    const inferenceBlock = emailInferenceBlockReason({
      personName: input.personName,
      email,
      observedOnOfficialPage: observed,
    });
    if (inferenceBlock) {
      blockers.push(inferenceBlock);
      return { state: 'inferred_unverified', blockers };
    }
  }

  if (!input.sourceIsOfficial) {
    if (email || formUrl) {
      blockers.push(
        'Source is not an official organization page, so the finding stays inferred until verified.',
      );
      return { state: 'inferred_unverified', blockers };
    }
    return { state: 'unknown', blockers: ['No official source and no published route.'] };
  }

  if (input.routeKind === 'creator_program' || input.routeKind === 'affiliate_program') {
    if (!formUrl && !email) {
      return {
        state: 'unknown',
        blockers: ['Program route was claimed but no application URL or contact was recorded.'],
      };
    }
    return { state: 'verified_program', blockers };
  }

  if (input.routeKind === 'contact_form' || (formUrl && !email)) {
    if (!formUrl) {
      return { state: 'unknown', blockers: ['Contact form route claimed without a URL.'] };
    }
    return { state: 'verified_official_form', blockers };
  }

  if (email && observed) {
    const local = email.slice(0, email.indexOf('@'));
    if (blankToNull(input.personName)) {
      return { state: 'verified_named_contact', blockers };
    }
    const inboxState = officialInboxStateForLocalPart(local);
    // Never upgrade a general local-part to a role inbox just because research
    // started on a media page — info@ stays a labeled general route.
    if (
      input.routeKind === 'general_inbox' ||
      inboxState === 'official_general_inbox'
    ) {
      return { state: 'official_general_route', blockers };
    }
    if (inboxState === 'verified_role_inbox') {
      return { state: 'verified_role_inbox', blockers };
    }
    // Custom local-parts on partnership/media pages stay role inboxes only when
    // the published label supports it; otherwise treat as general.
    const label = (input.publishedLabel ?? '').toLowerCase();
    if (
      /\b(media|press|pr|partnership|creator|influencer|marketing|communications)\b/.test(
        label,
      )
    ) {
      return { state: 'verified_role_inbox', blockers };
    }
    return { state: 'official_general_route', blockers };
  }

  if (input.routeKind === 'none') {
    return { state: 'unknown', blockers: ['No legitimate published route found.'] };
  }

  if (blankToNull(input.personName) && !email && !formUrl) {
    blockers.push(
      `${input.personName!.trim()} is named but no published contact route was found for them.`,
    );
    return { state: 'inferred_unverified', blockers };
  }

  return {
    state: 'unknown',
    blockers: ['Finding did not include a published email, form, or program URL.'],
  };
}

/**
 * Builds a discovery evidence record from a research finding.
 * Always sets `producesPitch: false`.
 */
export function createDiscoveryEvidenceRecord(
  input: DiscoveryFindingInput,
): DiscoveryEvidenceRecord {
  const classified = classifyDiscoveryState(input);
  const capturedAt =
    blankToNull(input.evidenceCapturedAt) ?? (input.now ?? new Date()).toISOString();
  const lastRecheckedAt = blankToNull(input.lastRecheckedAt);

  let discoveryState = classified.state;
  const freshness = evaluateDiscoveryFreshness({
    evidenceCapturedAt: capturedAt,
    lastRecheckedAt,
    discoveryState,
    conflictNote: input.conflictNote,
    now: input.now,
  });
  discoveryState = applyFreshnessToDiscoveryState(discoveryState, freshness);

  const staleNote =
    freshness.needsRecheck && discoveryState === 'stale_needs_recheck'
      ? freshness.reason
      : null;

  const creationBlockers = [...classified.blockers];
  if (staleNote) creationBlockers.push(staleNote);

  return {
    discoveryState,
    sendEvidenceState: toSendEvidenceState(discoveryState),
    searchStepId: classifyRouteOntoSearchStep({ routeKind: input.routeKind }),
    organizationName: input.organizationName.trim(),
    personName: blankToNull(input.personName),
    personRole: blankToNull(input.personRole),
    representsBusiness: input.organizationName.trim(),
    email: blankToNull(input.email)?.toLowerCase() ?? null,
    phone: blankToNull(input.phone),
    contactFormUrl: blankToNull(input.contactFormUrl) ?? blankToNull(input.programUrl),
    programUrl: blankToNull(input.programUrl),
    officialSocialUrl: blankToNull(input.officialSocialUrl),
    evidenceUrl: blankToNull(input.evidenceUrl),
    sourceIsOfficial: input.sourceIsOfficial,
    verificationMethod: blankToNull(input.verificationMethod) ?? 'official_page_observation',
    evidenceCapturedAt: capturedAt,
    lastRecheckedAt,
    conflictNote: blankToNull(input.conflictNote),
    staleNote,
    excerpt: blankToNull(input.excerpt),
    importedConfidence: blankToNull(input.importedConfidence),
    freshness,
    creationBlockers,
    producesPitch: false,
  };
}

/** Projects discovery evidence into the send-contract record shape. */
export function toContactEvidenceRecord(
  record: DiscoveryEvidenceRecord,
): ContactEvidenceRecord {
  return {
    state: record.sendEvidenceState,
    personName: record.personName,
    personRole: record.personRole,
    representsBusiness: record.representsBusiness,
    email: record.email,
    contactFormUrl: record.contactFormUrl,
    phone: record.phone,
    officialSocialUrl: record.officialSocialUrl,
    evidenceUrl: record.evidenceUrl,
    evidenceCapturedAt: record.evidenceCapturedAt,
    sourceIsOfficial: record.sourceIsOfficial,
    verificationMethod: record.verificationMethod,
    lastRecheckedAt: record.lastRecheckedAt,
    conflictNote: record.conflictNote,
    staleNote: record.staleNote,
  };
}

/**
 * Quarantines conflicting observations instead of deleting history.
 * Keeps the prior record's values and stamps a conflict note + state.
 */
export function quarantineConflictingEvidence(input: {
  prior: DiscoveryEvidenceRecord;
  conflictingValue: string;
  conflictNote: string;
  now?: Date;
}): DiscoveryEvidenceRecord {
  const now = input.now ?? new Date();
  return {
    ...input.prior,
    discoveryState: 'conflicting',
    sendEvidenceState: toSendEvidenceState('conflicting'),
    conflictNote: input.conflictNote.trim(),
    lastRecheckedAt: now.toISOString(),
    freshness: evaluateDiscoveryFreshness({
      evidenceCapturedAt: input.prior.evidenceCapturedAt,
      lastRecheckedAt: now.toISOString(),
      discoveryState: 'conflicting',
      conflictNote: input.conflictNote,
      now,
    }),
    creationBlockers: [
      ...input.prior.creationBlockers,
      `Quarantined conflicting value: ${input.conflictingValue.trim()}`,
    ],
    producesPitch: false,
  };
}

export function isDiscoveryEvidenceRecord(value: unknown): value is DiscoveryEvidenceRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as DiscoveryEvidenceRecord;
  return (
    isDiscoveryContactState(record.discoveryState) &&
    record.producesPitch === false &&
    typeof record.organizationName === 'string'
  );
}
