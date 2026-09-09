/**
 * Purpose checks for discovery — wrong-purpose inboxes must never enter the
 * actionable contact set, even when published on an official page.
 *
 * Complements sponsor-outreach recipient-safety (which already blocks
 * breakingnews / abuse / careers / billing). Discovery adds legal, privacy,
 * security, investor-relations, and unrelated press tip-line patterns required
 * by the KC contact-intelligence mission.
 */

export type DiscoveryPurposeBlockKind =
  | 'crisis'
  | 'legal'
  | 'privacy'
  | 'security'
  | 'investor_relations'
  | 'unrelated_press'
  | 'automated'
  | 'recruiting'
  | 'billing'
  | 'explicit_blocklist';

export type DiscoveryPurposeVerdict = {
  allowed: boolean;
  kind: DiscoveryPurposeBlockKind | null;
  reason: string | null;
};

type LocalPartRule = {
  kind: DiscoveryPurposeBlockKind;
  pattern: RegExp;
  reason: string;
};

const LOCAL_PART_RULES: LocalPartRule[] = [
  {
    kind: 'crisis',
    pattern: /^(breakingnews|breaking.?news|crisis|emergenc(y|ies)|urgentmedia|urgent.?media)$/i,
    reason: 'Crisis or urgent-media inbox — not a partnership route.',
  },
  {
    kind: 'legal',
    pattern: /^(legal|counsel|lawyers?|litigation|subpoena|dmca|copyright)$/i,
    reason: 'Legal inbox — partnership pitches do not belong here.',
  },
  {
    kind: 'privacy',
    pattern: /^(privacy|dpo|gdpr|ccpa|dataprivacy|data.?privacy|dataprotection|data.?protection)$/i,
    reason: 'Privacy / data-protection inbox — not a creator partnership route.',
  },
  {
    kind: 'security',
    pattern: /^(security|infosec|cyber|abuse|phishing|spam|trust.?safety|trustandsafety)$/i,
    reason: 'Security or abuse-handling inbox — not a partnership route.',
  },
  {
    kind: 'investor_relations',
    pattern: /^(ir|investor|investors|investorrelations|investor.?relations|shareholders?|sec)$/i,
    reason: 'Investor-relations inbox — unrelated to creator partnerships.',
  },
  {
    kind: 'unrelated_press',
    pattern: /^(tips?|newstips?|news.?tips?|tipline|tip.?line|newsdesk|news.?desk|scoop|corrections?)$/i,
    reason:
      'News tip / desk line for unrelated press, not a media-partnership or creator route.',
  },
  {
    kind: 'automated',
    pattern:
      /^(noreply|no.?reply|donotreply|do.?not.?reply|bounce|mailer.?daemon|postmaster|unsubscribe|opt.?out)$/i,
    reason: 'Automated or list-management address — nobody reads partnership mail here.',
  },
  {
    kind: 'recruiting',
    pattern: /^(jobs|careers|recruiting|hr|resumes?|talent)$/i,
    reason: 'Recruiting inbox — collaboration pitches are discarded here.',
  },
  {
    kind: 'billing',
    pattern: /^(billing|invoices?|accounts?payable|ap|remittance|collections)$/i,
    reason: 'Accounts / billing inbox — not a partnership route.',
  },
];

/**
 * Media/press/partnership local-parts that ARE appropriate for creator outreach
 * when published officially. Kept explicit so tip-line rules never catch them.
 */
const APPROPRIATE_ROLE_LOCAL_PARTS =
  /^(media|press|pr|publicity|marketing|partnerships?|partner|collab|collabs|collaborations?|influencer|creators?|social|socialmedia|social\.media|communications?|comms)$/i;

export function splitAddress(email: string): { local: string; domain: string } | null {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) return null;
  return { local: trimmed.slice(0, at), domain: trimmed.slice(at + 1) };
}

/**
 * Whether an address's published purpose fits partnership / creator outreach.
 */
export function evaluateDiscoveryPurpose(input: {
  email?: string | null;
  /** Optional label from the page ("Media", "Legal", "News tips"). */
  publishedLabel?: string | null;
  /** Exact addresses already known to be wrong-purpose (code or DB blocklist). */
  explicitBlocklist?: ReadonlyArray<{ address: string; reason: string }>;
}): DiscoveryPurposeVerdict {
  const email = input.email?.trim().toLowerCase() ?? '';
  if (!email) {
    return { allowed: true, kind: null, reason: null };
  }

  const blocked = (input.explicitBlocklist ?? []).find(
    (entry) => entry.address.trim().toLowerCase() === email,
  );
  if (blocked) {
    return {
      allowed: false,
      kind: 'explicit_blocklist',
      reason: blocked.reason,
    };
  }

  const parts = splitAddress(email);
  if (!parts) {
    return {
      allowed: false,
      kind: 'automated',
      reason: 'Address is not a usable email.',
    };
  }

  if (APPROPRIATE_ROLE_LOCAL_PARTS.test(parts.local)) {
    // Still check published label for contradictory purpose.
    const labelBlock = labelPurposeBlock(input.publishedLabel);
    if (labelBlock) return labelBlock;
    return { allowed: true, kind: null, reason: null };
  }

  for (const rule of LOCAL_PART_RULES) {
    if (rule.pattern.test(parts.local)) {
      return { allowed: false, kind: rule.kind, reason: rule.reason };
    }
  }

  const labelBlock = labelPurposeBlock(input.publishedLabel);
  if (labelBlock) return labelBlock;

  return { allowed: true, kind: null, reason: null };
}

function labelPurposeBlock(label: string | null | undefined): DiscoveryPurposeVerdict | null {
  const text = (label ?? '').trim().toLowerCase();
  if (!text) return null;
  if (/\b(crisis|breaking\s*news|urgent\s*media)\b/.test(text)) {
    return {
      allowed: false,
      kind: 'crisis',
      reason: 'Published label identifies a crisis / urgent-media purpose.',
    };
  }
  if (/\b(legal|counsel|litigation)\b/.test(text)) {
    return {
      allowed: false,
      kind: 'legal',
      reason: 'Published label identifies a legal purpose.',
    };
  }
  if (/\b(privacy|gdpr|data\s*protection)\b/.test(text)) {
    return {
      allowed: false,
      kind: 'privacy',
      reason: 'Published label identifies a privacy purpose.',
    };
  }
  if (/\b(security|abuse|infosec)\b/.test(text)) {
    return {
      allowed: false,
      kind: 'security',
      reason: 'Published label identifies a security purpose.',
    };
  }
  if (/\b(investor|shareholder|ir\b)/.test(text)) {
    return {
      allowed: false,
      kind: 'investor_relations',
      reason: 'Published label identifies investor relations.',
    };
  }
  if (/\b(news\s*tip|tip\s*line|newsdesk|corrections)\b/.test(text)) {
    return {
      allowed: false,
      kind: 'unrelated_press',
      reason: 'Published label identifies an unrelated press tip line.',
    };
  }
  return null;
}

/** Convenience: true when discovery may keep the address as a candidate. */
export function isPartnershipPurposeAllowed(input: {
  email?: string | null;
  publishedLabel?: string | null;
  explicitBlocklist?: ReadonlyArray<{ address: string; reason: string }>;
}): boolean {
  return evaluateDiscoveryPurpose(input).allowed;
}
