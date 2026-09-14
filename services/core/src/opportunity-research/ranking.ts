/**
 * Contact ranking 1–8 with explicit reasons. Never assumes C-suite is best.
 */

import type { OpportunityContact } from './types.js';
import { isUsableOutreachContact } from './contact-rules.js';

type RankRule = {
  rank: number;
  label: string;
  match: (c: OpportunityContact) => boolean;
};

const RULES: RankRule[] = [
  {
    rank: 1,
    label: 'Verified creator/influencer/partnership contact',
    match: (c) =>
      c.verificationStatus === 'verified' &&
      /creator|influencer|partnership|ambassador|collaborat/i.test(
        `${c.title ?? ''} ${c.relevanceReason}`,
      ),
  },
  {
    rank: 2,
    label: 'Verified local marketing or community-relations contact',
    match: (c) =>
      c.verificationStatus === 'verified' &&
      c.scope === 'local' &&
      /market|community|relations|pr|communications/i.test(`${c.title ?? ''} ${c.relevanceReason}`),
  },
  {
    rank: 3,
    label: 'Verified corporate PR/communications contact',
    match: (c) =>
      c.verificationStatus === 'verified' &&
      c.scope === 'corporate' &&
      /pr|press|media|communications|public relations/i.test(`${c.title ?? ''} ${c.relevanceReason}`),
  },
  {
    rank: 4,
    label: 'Verified PR-agency contact for the brand',
    match: (c) => c.verificationStatus === 'verified' && c.scope === 'agency',
  },
  {
    rank: 5,
    label: 'Verified local store manager/contact',
    match: (c) =>
      c.verificationStatus === 'verified' &&
      c.scope === 'local' &&
      /manager|store|boutique|location/i.test(`${c.title ?? ''} ${c.relevanceReason}`),
  },
  {
    rank: 6,
    label: 'Official press or partnership form',
    match: (c) =>
      Boolean(c.contactFormUrl) &&
      /press|media|partner|creator|influencer|contact/i.test(
        `${c.contactFormUrl ?? ''} ${c.relevanceReason}`,
      ),
  },
  {
    rank: 7,
    label: 'General local store contact',
    match: (c) => c.scope === 'local' && isUsableOutreachContact(c),
  },
  {
    rank: 8,
    label: 'General corporate contact',
    match: (c) =>
      (c.scope === 'corporate' || c.scope === 'generic') && isUsableOutreachContact(c),
  },
];

export function rankContacts(contacts: OpportunityContact[]): OpportunityContact[] {
  const ranked = contacts.map((c) => {
    if (!isUsableOutreachContact(c) && c.verificationStatus.startsWith('rejected')) {
      return { ...c, rank: null, rankReason: c.rejectedReason ?? 'Not usable for outreach' };
    }
    const rule = RULES.find((r) => r.match(c));
    if (!rule) {
      return {
        ...c,
        rank: null,
        rankReason: isUsableOutreachContact(c)
          ? 'Listed but does not match a preferred outreach tier'
          : 'No usable public contact path',
      };
    }
    return {
      ...c,
      rank: rule.rank,
      rankReason: rule.label,
    };
  });

  return ranked.sort((a, b) => {
    const ar = a.rank ?? 99;
    const br = b.rank ?? 99;
    if (ar !== br) return ar - br;
    const conf = { high: 0, medium: 1, low: 2 };
    return conf[a.confidence] - conf[b.confidence];
  });
}

export function explainContactRanking(contacts: OpportunityContact[]): string[] {
  return rankContacts(contacts)
    .filter((c) => c.rank != null)
    .map((c) => `#${c.rank} ${c.rankReason} — ${c.name ?? c.email ?? c.contactFormUrl ?? c.phone ?? 'contact'}`);
}
