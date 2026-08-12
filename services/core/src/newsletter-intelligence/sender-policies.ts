import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rootDomain } from '../discovery-subscriptions/extract.js';

export type SenderPolicyKind =
  | 'always_ignore'
  | 'events_only'
  | 'freebies_only'
  | 'trusted_event_roundup'
  | 'manual_review'
  | 'default';

export type PersistedSenderPolicy = {
  domain: string;
  policy: SenderPolicyKind;
  updatedAt: string;
  note?: string;
};

const POLICY_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../.cache/newsletter-sender-policies.json',
);

const DEFAULT_DOMAIN_POLICIES: Record<string, SenderPolicyKind> = {
  'urban-planet.com': 'events_only',
  'fivebelow.com': 'events_only',
  'target.com': 'events_only',
  'oldnavy.com': 'events_only',
  'gap.com': 'events_only',
  'marshalls.com': 'events_only',
  'eml.marshalls.com': 'events_only',
  'tjmaxx.com': 'events_only',
  'homegoods.com': 'events_only',
  'platoscloset.com': 'events_only',
  'ccsend.com': 'events_only',
  'do816.com': 'trusted_event_roundup',
  'newsletter.do816.com': 'trusted_event_roundup',
  'mail.do816.com': 'trusted_event_roundup',
  'instagram.com': 'always_ignore',
  'facebookmail.com': 'always_ignore',
  'google.com': 'always_ignore',
  'accounts.google.com': 'always_ignore',
};

const TRANSACTIONAL_LOCALPART = /^(noreply|no-reply|orders|order|receipts|shipping|support|account|notify|notification)/i;

export function loadSenderPolicies(): Record<string, PersistedSenderPolicy> {
  try {
    if (!existsSync(POLICY_PATH)) return {};
    return JSON.parse(readFileSync(POLICY_PATH, 'utf8')) as Record<string, PersistedSenderPolicy>;
  } catch {
    return {};
  }
}

export function persistSenderPolicy(input: {
  domain: string;
  policy: SenderPolicyKind;
  note?: string;
}): PersistedSenderPolicy {
  const all = loadSenderPolicies();
  const record: PersistedSenderPolicy = {
    domain: input.domain,
    policy: input.policy,
    updatedAt: new Date().toISOString(),
    note: input.note,
  };
  all[input.domain] = record;
  mkdirSync(dirname(POLICY_PATH), { recursive: true });
  writeFileSync(POLICY_PATH, JSON.stringify(all, null, 2));
  return record;
}

export function resolveSenderPolicy(
  senderEmail: string | null,
  senderDomain?: string | null,
): { policy: SenderPolicyKind; domain: string; source: 'persisted' | 'default' | 'transactional' } {
  const domain = (senderDomain ?? senderEmail?.split('@')[1] ?? 'unknown').toLowerCase();
  const root = rootDomain(domain);
  const local = senderEmail?.split('@')[0]?.toLowerCase() ?? '';

  if (TRANSACTIONAL_LOCALPART.test(local)) {
    return { policy: 'always_ignore', domain: root, source: 'transactional' };
  }

  const persisted = loadSenderPolicies();
  if (persisted[domain]?.policy) {
    return { policy: persisted[domain]!.policy, domain, source: 'persisted' };
  }
  if (persisted[root]?.policy) {
    return { policy: persisted[root]!.policy, domain: root, source: 'persisted' };
  }

  const def = DEFAULT_DOMAIN_POLICIES[domain] ?? DEFAULT_DOMAIN_POLICIES[root] ?? 'default';
  return { policy: def, domain: root, source: 'default' };
}

/** Literal free giveaway or in-person KC event with date/time/venue signals. */
export function isAllowedRetailException(blob: string): boolean {
  return (
    /\bfree admission\b|\bfree entry\b|\bno cover\b|\bcomplimentary\b|\bliteral free\b/i.test(blob) &&
    /\b(?:kansas city|\bkc\b|overland park|olathe|lenexa|in[- ]person|pop[- ]?up at)\b/i.test(blob)
  ) || (
    /\b(?:grand opening|ribbon cutting|in[- ]store event|store opening)\b/i.test(blob) &&
    /\b(?:kansas city|\bkc\b|\d{1,2}\/\d{1,2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2})\b/i.test(blob) &&
    /\b(?:\d{1,2}:\d{2}|am|pm|venue|at \d)/i.test(blob)
  );
}
