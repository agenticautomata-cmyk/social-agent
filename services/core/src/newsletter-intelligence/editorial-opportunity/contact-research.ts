/**
 * Bounded public contact/program discovery after opportunity create.
 * Official sources only — never invents emails or private PII.
 * "contact found" ≠ "contact verified".
 */

import type { ContactDiscoveryStatus, EditorialOpportunityCandidate } from './types.js';

export type ContactResearchResult = {
  status: ContactDiscoveryStatus;
  officialWebsite: string | null;
  pressPageUrl: string | null;
  contactPageUrl: string | null;
  notes: string[];
  /** Never populated with guessed addresses. */
  emailsFound: string[];
  verified: false;
};

/**
 * Policy-only stub used at create time. Live enrichment may later attach
 * official URLs discovered from article metadata without guessing emails.
 */
export function initialContactResearch(
  candidate: EditorialOpportunityCandidate,
): ContactResearchResult {
  const notes = [
    'Contact discovery not started automatically beyond opportunity create.',
    'Do not fabricate emails, partnership availability, or affiliate programs.',
    candidate.suggestedNextAction,
  ];
  return {
    status: 'not_started',
    officialWebsite: null,
    pressPageUrl: null,
    contactPageUrl: null,
    notes,
    emailsFound: [],
    verified: false,
  };
}

/** Reject any fabricated contact payload. */
export function assertNoFabricatedContacts(result: ContactResearchResult): boolean {
  return result.emailsFound.length === 0 && result.verified === false;
}
