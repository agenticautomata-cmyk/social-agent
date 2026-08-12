import { eq } from 'drizzle-orm';
import { db } from '../../db.js';
import { contentItems, creatorPartnerships, sponsorContacts } from '../../schema.js';
import {
  createSponsorFromOpportunity,
  updateSponsorContact,
} from '../../sponsor-outreach/contacts.js';
import { appendContactPathHook, appendEvidenceToLedger, buildProvenance } from './ledger.js';
import type {
  AssociationResult,
  EvidenceItem,
  MutationRecord,
} from './types.js';

export type MutateEvidenceResult = {
  mutations: MutationRecord[];
  contentItemId: string | null;
  partnershipId: string | null;
  sponsorContactId: string | null;
};

export async function mutateDurableStateFromEvidence(input: {
  message: string;
  conversationId: string;
  evidence: EvidenceItem[];
  association: Extract<AssociationResult, { status: 'resolved' }>;
}): Promise<MutateEvidenceResult> {
  const mutations: MutationRecord[] = [];
  const provenance = buildProvenance({
    conversationId: input.conversationId,
    message: input.message,
  });

  let contentItemId = input.association.contentItemId;
  let partnershipId = input.association.partnershipId;
  let sponsorContactId = input.association.sponsorContactId;

  if (input.association.createdOpportunity && contentItemId) {
    mutations.push({
      type: 'create_opportunity',
      entityType: 'content_item',
      entityId: contentItemId,
      summary: `Created sponsor opportunity for ${input.association.label}`,
    });
  }

  // Persist evidence ledger on content item when available
  if (contentItemId) {
    const [item] = await db
      .select({ id: contentItems.id, metadata: contentItems.metadata })
      .from(contentItems)
      .where(eq(contentItems.id, contentItemId))
      .limit(1);
    if (item) {
      const meta = { ...((item.metadata ?? {}) as Record<string, unknown>) };
      const ledgerResult = appendEvidenceToLedger({
        metadata: meta,
        evidence: input.evidence,
        provenance,
        entityType: 'content_item',
        entityId: contentItemId,
      });
      const pathResult = appendContactPathHook({
        metadata: ledgerResult.metadata,
        evidence: input.evidence,
        provenance,
      });

      const emails = input.evidence.filter((e) => e.kind === 'contact_email').map((e) => e.value);
      const existingEmails = Array.isArray(pathResult.metadata.contactEmails)
        ? (pathResult.metadata.contactEmails as string[])
        : [];
      const mergedEmails = [...new Set([...existingEmails, ...emails])];

      // Do not stamp lifecycleStatus here — evidence persist must not re-activate
      // temporally expired opportunities (Batch 3 currentness authority).
      await db
        .update(contentItems)
        .set({
          metadata: {
            ...pathResult.metadata,
            contactEmails: mergedEmails,
            lastEvidenceAt: provenance.capturedAt,
          },
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(contentItems.id, contentItemId));

      if (ledgerResult.added.length > 0) {
        mutations.push({
          type: 'persist_evidence',
          entityType: 'content_item',
          entityId: contentItemId,
          summary: `Persisted ${ledgerResult.added.length} evidence item(s) with provenance`,
        });
      } else if (ledgerResult.idempotentKeys.length > 0) {
        mutations.push({
          type: 'persist_evidence',
          entityType: 'content_item',
          entityId: contentItemId,
          summary: 'Evidence already present (idempotent)',
          idempotentHit: true,
        });
      }

      if (pathResult.added.length > 0) {
        mutations.push({
          type: 'contact_path_hook',
          entityType: 'content_item',
          entityId: contentItemId,
          summary: 'Recorded contact-path evidence hook for Batch 4 authority',
        });
      }

      if (emails.length > 0) {
        mutations.push({
          type: 'update_verified_fact',
          entityType: 'content_item',
          entityId: contentItemId,
          summary: 'Added verified local contact',
          idempotentHit: existingEmails.includes(emails[0]!),
        });
      }
    }
  }

  // Partnership metadata ledger + contact-path hook (preserve research/pitch)
  if (partnershipId) {
    const [p] = await db
      .select({
        id: creatorPartnerships.id,
        metadata: creatorPartnerships.metadata,
        contentItemId: creatorPartnerships.contentItemId,
        pipelineStatus: creatorPartnerships.pipelineStatus,
      })
      .from(creatorPartnerships)
      .where(eq(creatorPartnerships.id, partnershipId))
      .limit(1);
    if (p) {
      if (!contentItemId) contentItemId = p.contentItemId;
      const meta = { ...((p.metadata ?? {}) as Record<string, unknown>) };
      const ledgerResult = appendEvidenceToLedger({
        metadata: meta,
        evidence: input.evidence,
        provenance,
        entityType: 'partnership',
        entityId: partnershipId,
      });
      const pathResult = appendContactPathHook({
        metadata: ledgerResult.metadata,
        evidence: input.evidence,
        provenance,
      });

      const nextStatus = p.pipelineStatus === 'discovered' ? 'qualified' : p.pipelineStatus;

      await db
        .update(creatorPartnerships)
        .set({
          metadata: pathResult.metadata,
          pipelineStatus: nextStatus,
          updatedAt: new Date(),
        })
        .where(eq(creatorPartnerships.id, partnershipId));

      if (ledgerResult.added.length > 0) {
        mutations.push({
          type: 'persist_evidence',
          entityType: 'partnership',
          entityId: partnershipId,
          summary: `Persisted ${ledgerResult.added.length} evidence item(s) on partnership`,
        });
      } else if (ledgerResult.idempotentKeys.length > 0) {
        mutations.push({
          type: 'persist_evidence',
          entityType: 'partnership',
          entityId: partnershipId,
          summary: 'Partnership evidence already present (idempotent)',
          idempotentHit: true,
        });
      }

      if (pathResult.added.length > 0) {
        mutations.push({
          type: 'contact_path_hook',
          entityType: 'partnership',
          entityId: partnershipId,
          summary: 'Official contact-path evidence recorded (authority ranking deferred to Batch 4)',
        });
      }

      if (nextStatus !== p.pipelineStatus) {
        mutations.push({
          type: 'advance_lifecycle',
          entityType: 'partnership',
          entityId: partnershipId,
          summary: `Advanced partnership lifecycle ${p.pipelineStatus} → ${nextStatus}`,
        });
      }
    }
  }

  // Update / create sponsor contact when email present + content item
  const email = input.evidence.find((e) => e.kind === 'contact_email')?.value;
  if (email && contentItemId) {
    try {
      const { contact } = await createSponsorFromOpportunity(contentItemId);
      sponsorContactId = contact.id;
      const patch: { email?: string; notes?: string; status?: 'lead' | 'ready_to_contact' } = {};
      if (!contact.email || contact.email.toLowerCase() !== email.toLowerCase()) {
        patch.email = email;
      }
      if (contact.status === 'lead') {
        patch.status = 'ready_to_contact';
      }
      const noteLine = `Ask Benson evidence ${provenance.capturedAt}: local contact ${email}`;
      if (!contact.notes?.includes(email)) {
        patch.notes = contact.notes ? `${contact.notes}\n${noteLine}` : noteLine;
      }
      if (Object.keys(patch).length > 0) {
        await updateSponsorContact(contact.id, patch);
        mutations.push({
          type: 'update_contact',
          entityType: 'sponsor_contact',
          entityId: contact.id,
          summary: patch.email
            ? `Updated sponsor contact with verified email`
            : `Updated sponsor opportunity contact state`,
          idempotentHit: !patch.email,
        });
      } else {
        mutations.push({
          type: 'update_contact',
          entityType: 'sponsor_contact',
          entityId: contact.id,
          summary: 'Sponsor contact already up to date (idempotent)',
          idempotentHit: true,
        });
      }

      // Ensure verification status reflects operator-supplied email
      await db
        .update(sponsorContacts)
        .set({
          contactVerificationStatus: 'verified_direct_email',
          updatedAt: new Date(),
        })
        .where(eq(sponsorContacts.id, contact.id));
    } catch (err) {
      mutations.push({
        type: 'update_contact',
        entityType: 'sponsor_contact',
        entityId: contentItemId,
        summary: `Contact update blocked: ${err instanceof Error ? err.message : 'error'}`,
      });
    }
  }

  return { mutations, contentItemId, partnershipId, sponsorContactId };
}
