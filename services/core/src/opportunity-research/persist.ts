/**
 * Persist opportunity research dossier on content_items.metadata.
 */

import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems } from '../schema.js';
import type { OpportunityResearchDossier } from './types.js';

export function readDossierFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): OpportunityResearchDossier | null {
  const raw = metadata?.opportunityResearch;
  if (!raw || typeof raw !== 'object') return null;
  return raw as OpportunityResearchDossier;
}

export async function loadOpportunityResearch(
  contentItemId: string,
): Promise<{ item: typeof contentItems.$inferSelect; dossier: OpportunityResearchDossier | null } | null> {
  const [item] = await db.select().from(contentItems).where(eq(contentItems.id, contentItemId)).limit(1);
  if (!item) return null;
  const metadata = (item.metadata ?? {}) as Record<string, unknown>;
  return { item, dossier: readDossierFromMetadata(metadata) };
}

export async function saveOpportunityResearch(
  contentItemId: string,
  dossier: OpportunityResearchDossier,
  extraMetadata?: Record<string, unknown>,
): Promise<void> {
  const [item] = await db.select().from(contentItems).where(eq(contentItems.id, contentItemId)).limit(1);
  if (!item) throw new Error('content_item_not_found');
  const metadata = (item.metadata ?? {}) as Record<string, unknown>;
  const editorial = (metadata.editorialOpportunity as Record<string, unknown> | undefined) ?? {};

  await db
    .update(contentItems)
    .set({
      metadata: {
        ...metadata,
        ...extraMetadata,
        opportunityResearch: dossier,
        editorialOpportunity: {
          ...editorial,
          contactDiscovery: {
            status: dossier.contacts.some((c) => c.email || c.contactFormUrl || c.phone)
              ? 'contact_found_unverified'
              : 'none_found',
            verified: false,
            emailsFound: dossier.contacts.map((c) => c.email).filter(Boolean),
            researchedAt: dossier.researchedAt,
            researchRunId: dossier.researchRunId,
          },
        },
        lastOpportunityResearchAt: dossier.researchedAt,
        lastOpportunityResearchRunId: dossier.researchRunId,
      },
      creatorNextAction: dossier.recommendedNextAction.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(eq(contentItems.id, contentItemId));
}

/** Research errors must not wipe verified facts from a prior successful dossier. */
export function preserveVerifiedOnFailure(
  prior: OpportunityResearchDossier | null,
  failedRunId: string,
  errorMessage: string,
): OpportunityResearchDossier | null {
  if (!prior) return null;
  return {
    ...prior,
    status: 'failed',
    lastFailedResearchAt: new Date().toISOString(),
    missingOrConflicting: [
      ...prior.missingOrConflicting.filter((m) => !m.startsWith('research_error:')),
      `research_error:${errorMessage}`,
    ],
    history: [
      ...prior.history,
      {
        researchRunId: failedRunId,
        researchedAt: new Date().toISOString(),
        fingerprint: prior.fingerprint,
        status: 'failed',
        changedFacts: [],
      },
    ].slice(-20),
  };
}
