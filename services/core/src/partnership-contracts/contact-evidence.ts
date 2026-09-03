/**
 * Contact evidence model.
 *
 * The previous model was a single free-text `contact_verification_status` with a dozen
 * informal values, and every one of the nine rows claiming `verified_direct_email` was
 * a smoke-test fixture. 43 of 94 real addresses are `info@`/`hello@` front-desk
 * inboxes that were being shown as usable contacts.
 *
 * This module defines exactly six states and the rules that follow from them. It is
 * pure — no database, no network — so the same rules apply in the send-readiness gate,
 * the API payload and the UI.
 */

import {
  evaluateRecipientSafety,
  type RecipientSafetyVerdict,
} from '../sponsor-outreach/recipient-safety.js';

export const CONTACT_EVIDENCE_STATES = [
  /** A named person, with their current role, published on an official source. */
  'verified_named_decision_maker',
  /** A role inbox whose published purpose is media/press/partnerships (media@, press@). */
  'verified_role_inbox',
  /** An official inbox with no partnership scope (info@, hello@). Reachable, not targeted. */
  'official_general_inbox',
  /** An official web form. A legitimate path, but Kellie submits it — Benson never does. */
  'official_contact_form',
  /** Someone or something suggested this address but no official source confirms it. */
  'inferred_unverified',
  /** No contact information at all. */
  'unknown',
] as const;

export type ContactEvidenceState = (typeof CONTACT_EVIDENCE_STATES)[number];

/** Where a pitch can actually go, given the evidence state. */
export type ContactDeliveryChannel = 'email' | 'official_form' | 'none';

export const CONTACT_NEXT_PATHS = [
  'official_contact_form',
  'official_general_inbox',
  'phone',
  'named_person_needs_research',
  'official_social_account',
  'monitor_only',
] as const;

export type ContactNextPath = (typeof CONTACT_NEXT_PATHS)[number];

/**
 * States from which Benson may send an email. `inferred_unverified` and `unknown` are
 * excluded by the spec and must never be added here.
 */
const EMAILABLE_STATES = new Set<ContactEvidenceState>([
  'verified_named_decision_maker',
  'verified_role_inbox',
  'official_general_inbox',
]);

const STATE_LABELS: Record<ContactEvidenceState, string> = {
  verified_named_decision_maker: 'Named contact, verified',
  verified_role_inbox: 'Verified media or partnerships inbox',
  official_general_inbox: 'Official general inbox',
  official_contact_form: 'Official contact form',
  inferred_unverified: 'Unverified — not confirmed by an official source',
  unknown: 'No contact found',
};

/** Ranked best-to-worst. Used for ordering and for picking between conflicting evidence. */
const STATE_RANK: Record<ContactEvidenceState, number> = {
  verified_named_decision_maker: 5,
  verified_role_inbox: 4,
  official_general_inbox: 3,
  official_contact_form: 2,
  inferred_unverified: 1,
  unknown: 0,
};

export function isContactEvidenceState(value: unknown): value is ContactEvidenceState {
  return (
    typeof value === 'string' &&
    (CONTACT_EVIDENCE_STATES as readonly string[]).includes(value)
  );
}

export function normalizeContactEvidenceState(value: unknown): ContactEvidenceState {
  return isContactEvidenceState(value) ? value : 'unknown';
}

export function contactEvidenceLabel(state: ContactEvidenceState): string {
  return STATE_LABELS[state];
}

export function contactEvidenceRank(state: ContactEvidenceState): number {
  return STATE_RANK[state];
}

/**
 * Maps the legacy free-text `contact_verification_status` onto the six states.
 * Conservative by design: anything that does not clearly describe official, published
 * evidence lands on `inferred_unverified`, not on a verified state.
 */
export function evidenceStateFromLegacyStatus(input: {
  status: string | null | undefined;
  hasEmail: boolean;
  hasContactName: boolean;
  hasWebsite: boolean;
}): ContactEvidenceState {
  const status = (input.status ?? '').trim().toLowerCase();

  if (!input.hasEmail) {
    if (status === 'contact_form' || status === 'official_contact_form') {
      return 'official_contact_form';
    }
    if (status === 'official_press_page' && input.hasWebsite) return 'official_contact_form';
    return 'unknown';
  }

  switch (status) {
    case 'verified_direct_email':
    case 'verified_appropriate':
      // A "verified direct email" with a name attached is the named-decision-maker case;
      // without a name it is at best a role inbox.
      return input.hasContactName ? 'verified_named_decision_maker' : 'verified_role_inbox';
    case 'verified_role_email':
      return 'verified_role_inbox';
    case 'official_press_page':
      return 'verified_role_inbox';
    case 'generic_business_channel':
    case 'generic_business_contact':
      return 'official_general_inbox';
    case 'contact_form':
    case 'official_contact_form':
      return 'official_contact_form';
    case 'found_unverified':
    case 'likely_contact_unverified':
    case 'phone_only':
    case 'verified_social_dm_path':
      return 'inferred_unverified';
    default:
      return 'inferred_unverified';
  }
}

/**
 * Local-part heuristic used only when an address is known to come from an official
 * published page. It decides role-inbox vs general-inbox; it never upgrades an
 * unverified address to a verified state.
 */
export function officialInboxStateForLocalPart(localPart: string): ContactEvidenceState {
  const local = localPart.trim().toLowerCase();
  const roleInbox = /^(media|press|pr|publicity|marketing|partnerships?|partner|collab|collabs|collaborations?|influencer|creators?|social|socialmedia|social\.media|communications?|comms)$/;
  if (roleInbox.test(local)) return 'verified_role_inbox';
  return 'official_general_inbox';
}

/** Registrable-ish domain for comparison. Not a full public-suffix implementation. */
function domainOf(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim().toLowerCase();
  if (!raw) return null;
  const host = raw.includes('@')
    ? raw.split('@').pop()!
    : raw.replace(/^[a-z]+:\/\//, '').split('/')[0]!;
  const cleaned = host.replace(/^www\./, '').replace(/[^a-z0-9.-]/g, '');
  return cleaned.includes('.') ? cleaned : null;
}

/** Free and shared mailbox providers can never evidence an official business inbox. */
const CONSUMER_MAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com',
  'aol.com', 'icloud.com', 'me.com', 'msn.com', 'protonmail.com', 'proton.me',
]);

/**
 * Whether the stored evidence actually supports claiming an official state.
 *
 * This exists because the first pass at classifying the backlog promoted every
 * `info@`/`hello@` address to `official_general_inbox` on the strength of the local
 * part alone. That produced 30 contacts asserting an official inbox with no evidence
 * URL at all, and — worse — bound addresses to the wrong business: `Aerie` carried
 * `info@kclegendssoccer.com` and `Nordstrom Rack` carried the shopping centre's inbox,
 * both scraped from a page that merely mentioned the brand.
 *
 * An address is official only when an official page said so and the address belongs to
 * a domain that page or the business actually owns. Anything else is inferred.
 */
export function evidenceSupportsOfficialState(input: {
  email: string | null | undefined;
  evidenceUrl: string | null | undefined;
  sourceIsOfficial: boolean;
  /** The business's own website, when known, as a second acceptable domain. */
  businessWebsite?: string | null;
  /**
   * The business name. A domain built from the business's own name is itself evidence
   * of ownership: `info@crossroadshotelkc.com` for Crossroads Hotel is plainly the
   * hotel's own inbox, while `info@kclegendssoccer.com` for Aerie is plainly not.
   */
  businessName?: string | null;
}): { supported: boolean; reason: string | null } {
  const emailDomain = domainOf(input.email);
  if (!emailDomain) {
    return { supported: false, reason: 'No address is stored.' };
  }
  if (CONSUMER_MAIL_DOMAINS.has(emailDomain)) {
    return {
      supported: false,
      reason: `${emailDomain} is a personal mail provider, so it cannot be an official business inbox.`,
    };
  }
  // The address must sit on a domain the business demonstrably controls. Either an
  // official page we recorded, or the business's own website, anchors that.
  const evidenceDomain = input.sourceIsOfficial ? domainOf(input.evidenceUrl) : null;
  const websiteDomain = domainOf(input.businessWebsite);
  const anchors = [evidenceDomain, websiteDomain].filter(
    (value): value is string => value !== null,
  );

  const matchesAnchor = anchors.some(
    (candidate) =>
      candidate === emailDomain ||
      candidate.endsWith(`.${emailDomain}`) ||
      emailDomain.endsWith(`.${candidate}`),
  );
  if (matchesAnchor) return { supported: true, reason: null };

  if (domainDerivedFromName(emailDomain, input.businessName)) {
    return { supported: true, reason: null };
  }

  if (anchors.length === 0) {
    return {
      supported: false,
      reason: `Benson cannot confirm ${emailDomain} belongs to ${
        input.businessName?.trim() || 'this business'
      } — no official page records it and the domain is not built from the business name.`,
    };
  }

  {
    return {
      supported: false,
      // A mismatch is the wrong-business case, which is more dangerous than a missing
      // one: the pitch would reach a real person at an unrelated company.
      reason: `The address is at ${emailDomain} but the business's own domain is ${anchors.join(
        ' / ',
      )}, so Benson cannot confirm it belongs to this business.`,
    };
  }
}

/**
 * Whether a mail domain looks like it was built from the business's own name.
 *
 * Requires the name's distinctive words to be present in the domain, so
 * `crossroadshotelkc.com` matches "Crossroads Hotel" but `legendsshopping.com` does
 * not match "Nordstrom Rack". A one-word business name has to match on that word
 * alone, which is why very short names are rejected — "Aerie" against a domain
 * containing "aerie" would be fine, but two-letter fragments would match anything.
 */
function domainDerivedFromName(
  emailDomain: string,
  businessName: string | null | undefined,
): boolean {
  const name = (businessName ?? '').trim().toLowerCase();
  if (!name) return false;

  // Compare on letters only: "crossroadshotelkc" vs "crossroads hotel".
  const domainLetters = emailDomain.split('.').slice(0, -1).join('').replace(/[^a-z0-9]/g, '');
  if (!domainLetters) return false;

  const words = name
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3 && !GENERIC_VENUE_WORDS_FOR_DOMAIN.has(word));
  if (words.length === 0) return false;

  const present = words.filter((word) => domainLetters.includes(word));
  // Every distinctive word must appear. A partial match is how "Legends Outlets
  // Kansas City" wrongly claimed "legendsshopping.com".
  return present.length === words.length;
}

/** Words too common to distinguish one business's domain from another's. */
const GENERIC_VENUE_WORDS_FOR_DOMAIN = new Set([
  'hotel', 'hotels', 'restaurant', 'kansas', 'city', 'the', 'and', 'company', 'group',
  'kitchen', 'shop', 'shops', 'store', 'stores', 'center', 'centre', 'events', 'event',
]);

/**
 * Downgrades a claimed state to what the evidence actually supports. Never upgrades.
 */
export function stateSupportedByEvidence(input: {
  claimed: ContactEvidenceState;
  email: string | null | undefined;
  evidenceUrl: string | null | undefined;
  sourceIsOfficial: boolean;
  businessWebsite?: string | null;
  businessName?: string | null;
}): { state: ContactEvidenceState; downgradeReason: string | null } {
  if (!EMAILABLE_STATES.has(input.claimed)) {
    return { state: input.claimed, downgradeReason: null };
  }
  const support = evidenceSupportsOfficialState(input);
  if (support.supported) return { state: input.claimed, downgradeReason: null };
  return { state: 'inferred_unverified', downgradeReason: support.reason };
}

export type ContactEvidenceRecord = {
  state: ContactEvidenceState;
  personName: string | null;
  personRole: string | null;
  /** The business or property this contact genuinely represents. */
  representsBusiness: string | null;
  email: string | null;
  contactFormUrl: string | null;
  phone: string | null;
  officialSocialUrl: string | null;
  evidenceUrl: string | null;
  evidenceCapturedAt: string | null;
  sourceIsOfficial: boolean;
  verificationMethod: string | null;
  lastRecheckedAt: string | null;
  conflictNote: string | null;
  staleNote: string | null;
};

export type ContactEvidenceVerdict = {
  state: ContactEvidenceState;
  label: string;
  /** Where a pitch could actually be delivered right now. */
  deliveryChannel: ContactDeliveryChannel;
  /** True only when Benson may address an email to this contact. */
  emailSendAllowed: boolean;
  /** Reasons this contact cannot carry an email send. Empty when it can. */
  blockers: string[];
  /** The legitimate next step when no verified email exists. Never null. */
  nextPath: ContactNextPath;
  nextPathDetail: string;
  recipientSafety: RecipientSafetyVerdict;
  /** True when the stored evidence is old enough that it should be re-checked. */
  staleEvidence: boolean;
};

/** Evidence older than this should be re-verified before a pitch goes out. */
export const EVIDENCE_RECHECK_DAYS = 120;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return (Date.now() - then) / 86_400_000;
}

/**
 * Resolves the legitimate next path when Benson cannot email. Always returns something
 * actionable — "monitor_only" is the honest floor, used for properties like Origin
 * Hotel Kansas City where no media contact of any kind is published.
 */
export function resolveNextContactPath(record: {
  contactFormUrl: string | null;
  email: string | null;
  phone: string | null;
  officialSocialUrl: string | null;
  personName: string | null;
  state: ContactEvidenceState;
}): { path: ContactNextPath; detail: string } {
  if (record.contactFormUrl?.trim()) {
    return {
      path: 'official_contact_form',
      detail: `Submit the approved pitch through the official form at ${record.contactFormUrl.trim()}. Benson prepares the answers; you submit it.`,
    };
  }
  if (record.state === 'official_general_inbox' && record.email?.trim()) {
    return {
      path: 'official_general_inbox',
      detail: `Only a general inbox (${record.email.trim()}) is published. It is reachable but not a partnerships contact — expect it to be forwarded.`,
    };
  }
  if (record.phone?.trim()) {
    return {
      path: 'phone',
      detail: `No published email. The business lists ${record.phone.trim()} — a short call asking who handles partnerships is the fastest route.`,
    };
  }
  if (record.personName?.trim()) {
    return {
      path: 'named_person_needs_research',
      detail: `${record.personName.trim()} is named but no contact route is published for them. Their address still needs to be found on an official page.`,
    };
  }
  if (record.officialSocialUrl?.trim()) {
    return {
      path: 'official_social_account',
      detail: `No published email or form. The official account at ${record.officialSocialUrl.trim()} is the only route Benson can verify.`,
    };
  }
  return {
    path: 'monitor_only',
    detail:
      'No media or partnerships route is published anywhere Benson can verify. This stays monitor-only until a human confirms a contact — Benson will not guess one.',
  };
}

/**
 * The single authority on what a contact's evidence permits.
 *
 * Hard rule from the spec, enforced here: `inferred_unverified` and `unknown` can never
 * be send-ready, no matter what else is true. A guessed pattern is never presented as
 * verified.
 */
export function evaluateContactEvidence(
  record: Partial<ContactEvidenceRecord> & { state?: ContactEvidenceState },
  businessName?: string | null,
  notes?: string | null,
): ContactEvidenceVerdict {
  const state = normalizeContactEvidenceState(record.state);
  const blockers: string[] = [];

  const safety = evaluateRecipientSafety({
    email: record.email ?? null,
    businessName: businessName ?? record.representsBusiness ?? null,
    notes: notes ?? null,
  });

  if (state === 'unknown') {
    blockers.push('No contact information has been found for this business yet.');
  }
  if (state === 'inferred_unverified') {
    blockers.push(
      'The address on file is not confirmed by an official source, so Benson will not send to it.',
    );
  }
  if (state === 'official_contact_form') {
    blockers.push(
      'The only published route is an official web form, which you submit yourself — Benson never auto-submits a form.',
    );
  }
  if (EMAILABLE_STATES.has(state) && !record.email?.trim()) {
    blockers.push('The evidence state claims an inbox but no address is stored.');
  }
  if (!safety.sendable && record.email?.trim()) {
    for (const block of safety.blocks) blockers.push(block.message);
  }

  // Evidence that was true once may not be true now. A single named person at a state
  // tourism office is a single point of failure, so stale evidence is surfaced rather
  // than trusted silently.
  const age = daysSince(record.evidenceCapturedAt ?? null);
  const recheckAge = daysSince(record.lastRecheckedAt ?? null);
  const effectiveAge = recheckAge ?? age;
  const staleEvidence =
    EMAILABLE_STATES.has(state) &&
    effectiveAge !== null &&
    effectiveAge > EVIDENCE_RECHECK_DAYS;
  if (staleEvidence) {
    blockers.push(
      `The evidence for this contact is ${Math.round(effectiveAge!)} days old and needs re-checking before a pitch goes out.`,
    );
  }
  if (record.conflictNote?.trim()) {
    blockers.push(`Conflicting evidence on file: ${record.conflictNote.trim()}`);
  }

  const emailSendAllowed = blockers.length === 0 && EMAILABLE_STATES.has(state);
  const deliveryChannel: ContactDeliveryChannel = emailSendAllowed
    ? 'email'
    : record.contactFormUrl?.trim() || state === 'official_contact_form'
      ? 'official_form'
      : 'none';

  const next = resolveNextContactPath({
    contactFormUrl: record.contactFormUrl ?? null,
    email: record.email ?? null,
    phone: record.phone ?? null,
    officialSocialUrl: record.officialSocialUrl ?? null,
    personName: record.personName ?? null,
    state,
  });

  return {
    state,
    label: STATE_LABELS[state],
    deliveryChannel,
    emailSendAllowed,
    blockers,
    nextPath: next.path,
    nextPathDetail: next.detail,
    recipientSafety: safety,
    staleEvidence,
  };
}

/**
 * Guards against attaching a corporate or portfolio contact to the wrong property, and
 * against reusing one business's generic inbox for another. Both are explicit spec
 * requirements and both are easy to get wrong once a brand-level PR contact exists.
 */
export function contactRepresentsBusiness(input: {
  representsBusiness: string | null | undefined;
  targetBusinessName: string;
  /** True for a brand/portfolio contact that legitimately covers several properties. */
  portfolioScope?: string[] | null;
  businessKeyFn: (name: string | null | undefined) => string;
}): { ok: boolean; reason: string | null } {
  const represents = input.representsBusiness?.trim();
  if (!represents) {
    return {
      ok: false,
      reason:
        'This contact does not record which business it represents, so Benson cannot confirm it belongs to this one.',
    };
  }
  const targetKey = input.businessKeyFn(input.targetBusinessName);
  if (!targetKey) return { ok: false, reason: 'The target business has no usable name.' };

  if (input.businessKeyFn(represents) === targetKey) return { ok: true, reason: null };

  const scope = input.portfolioScope ?? [];
  if (scope.some((entry) => input.businessKeyFn(entry) === targetKey)) {
    return { ok: true, reason: null };
  }

  return {
    ok: false,
    reason: `This contact represents ${represents}, not ${input.targetBusinessName}. Benson will not reuse it here.`,
  };
}
