/**
 * Idempotent merge of research dossiers — no duplicate contacts/opportunities.
 */

import { createHash } from 'node:crypto';
import type { OpportunityContact, OpportunityResearchDossier, PartnershipProgram } from './types.js';

export function contactMergeKey(c: OpportunityContact): string {
  if (c.email) return `email:${c.email.toLowerCase()}`;
  if (c.contactFormUrl) return `form:${c.contactFormUrl.toLowerCase()}`;
  if (c.phone) return `phone:${c.phone.replace(/\D/g, '')}`;
  return `name:${(c.name ?? '').toLowerCase()}|${(c.title ?? '').toLowerCase()}|${(c.organization ?? '').toLowerCase()}`;
}

export function mergeContacts(
  prior: OpportunityContact[],
  next: OpportunityContact[],
): { contacts: OpportunityContact[]; duplicateContactsAvoided: number } {
  const map = new Map<string, OpportunityContact>();
  let duplicateContactsAvoided = 0;

  for (const c of prior) {
    map.set(contactMergeKey(c), c);
  }
  for (const c of next) {
    const key = contactMergeKey(c);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, c);
      continue;
    }
    duplicateContactsAvoided += 1;
    map.set(key, {
      ...existing,
      ...pickNonNull(c),
      // Preserve stronger verification; never upgrade rejected → verified without evidence.
      verificationStatus: preferVerification(existing.verificationStatus, c.verificationStatus),
      retrievedAt: c.retrievedAt || existing.retrievedAt,
      id: existing.id,
    });
  }

  return { contacts: [...map.values()], duplicateContactsAvoided };
}

function pickNonNull(c: OpportunityContact): Partial<OpportunityContact> {
  const out: Partial<OpportunityContact> = {};
  for (const [k, v] of Object.entries(c) as Array<[keyof OpportunityContact, OpportunityContact[keyof OpportunityContact]]>) {
    if (v != null && v !== '') out[k] = v as never;
  }
  return out;
}

function preferVerification(
  a: OpportunityContact['verificationStatus'],
  b: OpportunityContact['verificationStatus'],
): OpportunityContact['verificationStatus'] {
  const order = [
    'verified',
    'partially_verified',
    'unverified_lead',
    'not_found',
    'rejected_guess',
    'rejected_private',
  ] as const;
  return order.indexOf(a) <= order.indexOf(b) ? a : b;
}

export function mergePrograms(
  prior: PartnershipProgram[],
  next: PartnershipProgram[],
): PartnershipProgram[] {
  const map = new Map<string, PartnershipProgram>();
  for (const p of [...prior, ...next]) {
    const key = `${p.programType}|${(p.officialUrl ?? p.name ?? '').toLowerCase()}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, p);
      continue;
    }
    map.set(key, {
      ...existing,
      ...p,
      id: existing.id,
      compensationOfficial: existing.compensationOfficial || p.compensationOfficial,
      compensation:
        p.compensationOfficial ? p.compensation : existing.compensationOfficial ? existing.compensation : p.compensation,
    });
  }
  return [...map.values()];
}

export function dossierFingerprint(input: {
  businessName: string | null;
  website: string | null;
  address: string | null;
  phone: string | null;
  contactKeys: string[];
  programKeys: string[];
}): string {
  const payload = JSON.stringify({
    b: input.businessName,
    w: input.website,
    a: input.address,
    p: input.phone,
    c: [...input.contactKeys].sort(),
    g: [...input.programKeys].sort(),
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 24);
}

export function diffChangedFacts(
  prior: OpportunityResearchDossier | null,
  next: OpportunityResearchDossier,
): string[] {
  if (!prior) return ['initial_research'];
  const changes: string[] = [];
  const pairs: Array<[string, string | null | undefined, string | null | undefined]> = [
    ['website', prior.business.website.value, next.business.website.value],
    ['address', prior.business.streetAddress.value, next.business.streetAddress.value],
    ['phone', prior.business.phone.value, next.business.phone.value],
    ['hours', prior.business.hours.value, next.business.hours.value],
    ['location_page', prior.business.locationPage.value, next.business.locationPage.value],
  ];
  for (const [label, a, b] of pairs) {
    if ((a ?? null) !== (b ?? null)) changes.push(label);
  }
  if (prior.contacts.length !== next.contacts.length) {
    changes.push('contacts_count');
  }
  if (prior.programs.length !== next.programs.length) {
    changes.push('programs_count');
  }
  return changes;
}

/** Meaningful Telegram: only when actionable new info appears. */
export function shouldNotifyTelegram(changedFacts: string[], prior: OpportunityResearchDossier | null): boolean {
  if (!prior) return false; // discovery create already notified; research refresh is quieter
  const actionable = changedFacts.some((f) =>
    ['website', 'phone', 'contacts_count', 'programs_count', 'location_page'].includes(f),
  );
  return actionable;
}
