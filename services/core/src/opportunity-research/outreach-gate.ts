/**
 * Contact business gate — research must complete before generic outreach UI.
 */

import type { OpportunityResearchDossier } from './types.js';

export type ContactBusinessGate =
  | {
      ready: false;
      reason: 'research_incomplete' | 'research_failed' | 'no_usable_contact';
      offerResearchFirst: true;
      message: string;
    }
  | {
      ready: true;
      offerResearchFirst: false;
      message: string;
      rankedContactIds: string[];
      draft: string | null;
      requiresApproval: true;
    };

export function evaluateContactBusinessGate(
  dossier: OpportunityResearchDossier | null | undefined,
): ContactBusinessGate {
  if (!dossier || dossier.status === 'queued' || dossier.status === 'running') {
    return {
      ready: false,
      reason: 'research_incomplete',
      offerResearchFirst: true,
      message: 'Research first — Contact business needs a source-backed dossier before outreach prep.',
    };
  }
  if (dossier.status === 'failed') {
    return {
      ready: false,
      reason: 'research_failed',
      offerResearchFirst: true,
      message: 'Prior research failed. Run Research this again before contacting the business.',
    };
  }

  const ranked = [...dossier.contacts]
    .filter((c) => c.rank != null && (c.email || c.contactFormUrl || c.phone))
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));

  if (ranked.length === 0) {
    return {
      ready: false,
      reason: 'no_usable_contact',
      offerResearchFirst: true,
      message:
        'Research completed but no usable public contact path was found. Refresh research or use the store phone/form if one appears later.',
    };
  }

  return {
    ready: true,
    offerResearchFirst: false,
    message: 'Ranked contacts ready — select a recipient, review evidence, approve before send.',
    rankedContactIds: ranked.map((c) => c.id),
    draft: dossier.outreachPrep?.draft ?? null,
    requiresApproval: true,
  };
}

export function assertNoOutreachDuringResearch(dossier: OpportunityResearchDossier): boolean {
  return dossier.autoOutreach === false && dossier.outreachPrep?.autoSend === false;
}
