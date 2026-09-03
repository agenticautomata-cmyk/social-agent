/**
 * Recipient safety gate — the last thing standing between Benson and an embarrassing
 * or actively harmful email.
 *
 * Live Gmail send is armed (`sendMode: "live"`). Before this module existed, the six
 * highest-confidence, top-of-queue pitches on `/email/approvals` were smoke-test
 * fixtures created 2026-08-10 addressed to `platoscloset-op.test`, `platos.example`,
 * `reviveboutique-kc.test` and `orphankc.test`. Every row marked
 * `verified_direct_email` was one of them. Approving any of them would have attempted
 * real delivery to domains that cannot exist.
 *
 * Everything here is a pure function so it can be enforced identically at the
 * send-readiness gate, the approval API, the dispatch worker and the approval UI.
 * No database, no network, no I/O.
 */

/**
 * Reserved / non-resolvable TLDs. RFC 2606 (`.test`, `.example`, `.invalid`,
 * `.localhost`) plus RFC 6761 special-use names. Mail to these can never be
 * delivered, so any address using one is by definition a fixture.
 */
export const RESERVED_TLDS = ['test', 'example', 'invalid', 'localhost', 'local'] as const;

/** Reserved second-level example domains (RFC 2606 §3). */
export const RESERVED_DOMAINS = ['example.com', 'example.net', 'example.org'] as const;

/**
 * Addresses that must never receive a partnership pitch, with the reason a human
 * can read. These are not "unverified" — they are verified to be the WRONG inbox.
 */
export type DoNotContactEntry = {
  address: string;
  /** Why this inbox is wrong for outreach — shown verbatim to the operator. */
  reason: string;
  kind: 'wrong_purpose_inbox' | 'do_not_contact';
};

export const DO_NOT_CONTACT_ADDRESSES: DoNotContactEntry[] = [
  {
    address: 'breakingnews@hilton.com',
    reason:
      'Hilton publishes this address only for urgent media requests — it is a crisis-communications inbox. A hosted-stay pitch sent here would be counterproductive. Hilton has no published partnership email; the influencer request form is the only correct route.',
    kind: 'wrong_purpose_inbox',
  },
];

/**
 * Local-parts that identify an inbox whose published purpose is incompatible with a
 * partnership pitch. Matched against the local part only, so a real
 * `press@` or `media@` inbox is never caught.
 */
const WRONG_PURPOSE_LOCAL_PARTS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /^breakingnews$/i,
    reason: 'Crisis-communications / urgent-media inbox, not a partnership inbox.',
  },
  {
    pattern: /^(abuse|postmaster|security|phishing|spam|noreply|no-reply|donotreply|do-not-reply|bounce|mailer-daemon)$/i,
    reason: 'Automated or abuse-handling inbox — nobody reads partnership mail here.',
  },
  {
    pattern: /^(unsubscribe|optout|opt-out)$/i,
    reason: 'List-management inbox, not a partnership inbox.',
  },
  {
    pattern: /^(jobs|careers|recruiting|hr|resumes?)$/i,
    reason: 'Recruiting inbox — a collaboration pitch here will be discarded.',
  },
  {
    pattern: /^(billing|invoices?|accounts?payable|ap|remittance)$/i,
    reason: 'Accounts-payable inbox, not a partnership inbox.',
  },
];

/**
 * Substrings that identify a synthetic test/QA fixture rather than a real business.
 * Drawn from the actual breadcrumbs left in `sponsor_contacts.notes` by the
 * 2026-08-10 smoke-test batch (`canary.plato.<epoch>@…`, `batch2.gate@…`,
 * `orphan-unique-<hex>@orphankc.test`).
 */
const FIXTURE_MARKERS = [
  // Dotted/hyphenated forms only — a bare "canary" could appear in a real business
  // name or note, but "canary." never does outside a generated fixture address.
  'canary.',
  'canary-',
  'canary test',
  'smoke test',
  'smoketest',
  'smoke-test',
  'gate check',
  'gatecheck',
  'gate-check',
  'orphan evidence',
  'orphan-evidence',
  'orphan-unique',
  'ambiguous brand',
  'ambiguous-brand',
  'do not use',
  'test fixture',
  'fixture only',
  'batch2.gate',
] as const;

/**
 * Business names that are self-evidently a fixture, not a business.
 *
 * Deliberately narrow. A bare `\bsmoke\b` or `\bcanary\b` looks like a fixture marker
 * but is ordinary in Kansas City business names — "Dream KC Smoke Shop" is a real
 * business, and flagging it as test data would have quarantined a genuine lead. The
 * real fixtures always carry a stronger signal: a unix-epoch suffix, an explicit
 * "smoke test"/"gate check" phrase, or a reserved-TLD address (handled separately).
 */
const FIXTURE_BUSINESS_PATTERNS: RegExp[] = [
  // The 2026-08-10 smoke-test batch, named exactly. Anchored so a real Plato's Closet
  // franchise is never caught by them.
  /^plato'?s? closet (canary|smoke)$/i,
  /^orphan evidence only brand$/i,
  /\bcanary[-\s]?(test|check|run|batch)\b/i,
  /\bsmoke[-\s]?(test|check|run|batch)\b/i,
  /\bgate[-\s]?check\b/i,
  /\borphan[-\s]?evidence\b/i,
  /\bambiguous brand\b/i,
  /^test\b/i,
  /\btest (kit|brand|business|contact|fixture|verify)\b/i,
  // A 10+ digit run is a millisecond epoch stamped in by a test harness. No real
  // business name contains one.
  /\d{10,}/,
];

export type RecipientBlockCode =
  | 'missing_email'
  | 'invalid_email_syntax'
  | 'reserved_tld'
  | 'reserved_domain'
  | 'do_not_contact'
  | 'wrong_purpose_inbox'
  | 'fixture_marker';

export type RecipientBlock = {
  code: RecipientBlockCode;
  /** Plain-English, operator-safe. Never contains a stack trace or internal id. */
  message: string;
};

export type RecipientSafetyVerdict = {
  /** True only when this address may be used for a real external send. */
  sendable: boolean;
  /**
   * True when the address is structurally impossible or forbidden — as opposed to
   * merely absent. A synthetic fixture is `blocked`; "no email yet" is not.
   */
  blocked: boolean;
  blocks: RecipientBlock[];
  /** Single best line to show a human. Null when sendable. */
  summary: string | null;
  /** True when the row looks like test data rather than a real business. */
  syntheticFixture: boolean;
};

const EMAIL_SHAPE = /^[^\s@,;<>()[\]\\]+@[^\s@,;<>()[\]\\]+\.[A-Za-z][A-Za-z0-9-]*$/;

export function splitEmail(email: string): { local: string; domain: string } | null {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) return null;
  return { local: trimmed.slice(0, at), domain: trimmed.slice(at + 1) };
}

/** True when the domain's TLD can never resolve on the public internet. */
export function hasReservedTld(email: string): boolean {
  const parts = splitEmail(email);
  if (!parts) return false;
  const labels = parts.domain.split('.');
  const tld = labels[labels.length - 1] ?? '';
  return (RESERVED_TLDS as readonly string[]).includes(tld);
}

export function isReservedDomain(email: string): boolean {
  const parts = splitEmail(email);
  if (!parts) return false;
  return (RESERVED_DOMAINS as readonly string[]).includes(parts.domain);
}

export function findDoNotContactEntry(email: string): DoNotContactEntry | null {
  const normalized = email.trim().toLowerCase();
  return DO_NOT_CONTACT_ADDRESSES.find((e) => e.address === normalized) ?? null;
}

/** Text-based fixture detection across business name, notes and the address itself. */
export function looksLikeSyntheticFixture(input: {
  email?: string | null;
  businessName?: string | null;
  notes?: string | null;
}): boolean {
  const email = input.email?.trim() ?? '';
  if (email && (hasReservedTld(email) || isReservedDomain(email))) return true;

  const businessName = input.businessName?.trim() ?? '';
  if (businessName && FIXTURE_BUSINESS_PATTERNS.some((re) => re.test(businessName))) return true;

  const haystack = `${email} ${input.notes ?? ''}`.toLowerCase();
  return FIXTURE_MARKERS.some((marker) => haystack.includes(marker));
}

/**
 * The single authority on whether an address may be used for an external send.
 *
 * `sendable: false` with `blocked: false` means "not ready yet" (no address).
 * `blocked: true` means "this address must never be used", which is a permanent,
 * structural refusal that no amount of approval can override.
 */
export function evaluateRecipientSafety(input: {
  email?: string | null;
  businessName?: string | null;
  notes?: string | null;
}): RecipientSafetyVerdict {
  const blocks: RecipientBlock[] = [];
  const email = input.email?.trim() ?? '';

  const synthetic = looksLikeSyntheticFixture(input);

  if (!email) {
    blocks.push({
      code: 'missing_email',
      message: 'No email address on file for this business.',
    });
    if (synthetic) {
      blocks.push({
        code: 'fixture_marker',
        message:
          'This record carries test-fixture markers, so it is not a real business Benson can contact.',
      });
    }
    return {
      sendable: false,
      blocked: synthetic,
      blocks,
      summary: synthetic
        ? 'Synthetic test fixture — never sendable.'
        : 'No email address on file for this business.',
      syntheticFixture: synthetic,
    };
  }

  if (!EMAIL_SHAPE.test(email)) {
    blocks.push({
      code: 'invalid_email_syntax',
      message: 'The stored address is not a valid email address.',
    });
  }

  if (hasReservedTld(email)) {
    const parts = splitEmail(email);
    const tld = parts ? parts.domain.split('.').pop() : null;
    blocks.push({
      code: 'reserved_tld',
      message: `The domain ends in .${tld ?? '?'}, a reserved suffix that can never receive mail. This is test data, not a real business.`,
    });
  }

  if (isReservedDomain(email)) {
    blocks.push({
      code: 'reserved_domain',
      message:
        'The domain is one of the reserved example.com/.net/.org names, which can never receive mail. This is test data.',
    });
  }

  const doNotContact = findDoNotContactEntry(email);
  if (doNotContact) {
    blocks.push({ code: doNotContact.kind, message: doNotContact.reason });
  }

  const parts = splitEmail(email);
  if (parts && !doNotContact) {
    const wrongPurpose = WRONG_PURPOSE_LOCAL_PARTS.find((entry) => entry.pattern.test(parts.local));
    if (wrongPurpose) {
      blocks.push({ code: 'wrong_purpose_inbox', message: wrongPurpose.reason });
    }
  }

  if (synthetic && !blocks.some((b) => b.code === 'reserved_tld' || b.code === 'reserved_domain')) {
    blocks.push({
      code: 'fixture_marker',
      message:
        'This record carries test-fixture markers (canary / smoke / gate-check / orphan-evidence), so it is not a real business Benson can contact.',
    });
  }

  return {
    sendable: blocks.length === 0,
    blocked: blocks.length > 0,
    blocks,
    summary: blocks[0]?.message ?? null,
    syntheticFixture: synthetic,
  };
}

/** Thrown when something tries to send or approve a structurally forbidden recipient. */
export class RecipientBlockedError extends Error {
  readonly blocks: RecipientBlock[];
  readonly code: RecipientBlockCode;

  constructor(verdict: RecipientSafetyVerdict) {
    const first = verdict.blocks[0];
    super(first?.message ?? 'Recipient is not sendable');
    this.name = 'RecipientBlockedError';
    this.blocks = verdict.blocks;
    this.code = first?.code ?? 'missing_email';
  }
}

/**
 * Hard gate. Throws `RecipientBlockedError` unless the address is safe for a real
 * external send. Called from the send path, the approval path and the dispatch
 * worker — never bypassed, never made conditional on a feature flag.
 */
export function assertRecipientSendable(input: {
  email?: string | null;
  businessName?: string | null;
  notes?: string | null;
}): void {
  const verdict = evaluateRecipientSafety(input);
  if (!verdict.sendable) throw new RecipientBlockedError(verdict);
}
