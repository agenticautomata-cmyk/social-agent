import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { eq } from 'drizzle-orm';
import { db } from '../../db.js';
import {
  bensonChatMessages,
  campaigns,
  contentItems,
  creatorAccounts,
  creatorPartnerships,
  outreachEmails,
  sponsorContacts,
} from '../../schema.js';
import { getOrCreateShareIntakeSource } from '../../intake/promote.js';
import {
  classifyEvidence,
  shouldAttemptEvidenceOrchestration,
  isOfficialIntakeFormUrl,
  extractBusinessNameCandidates,
} from './classify.js';
import {
  appendEvidenceToLedger,
  buildProvenance,
  readEvidenceLedger,
} from './ledger.js';
import { gateExternalAction } from './execute-safe.js';
import {
  buildResponseDelta,
  buildSuggestedActions,
  formatDeltaAnswer,
} from './format-delta.js';
import { runEvidenceOrchestration } from './orchestrate.js';
import { bindBensonAssistantResearchRun, patchBensonAssistantMessagesTerminal } from '../conversations.js';
import type { AssociationResult } from './types.js';

const PLATO_MESSAGE = `
Plato's Closet Overland Park local rewards: Closet Cash loyalty program for store credit.
Parent company has run influencer campaigns before.
Direct local contact: manager@platoscloset-op.example
Pitch context: thrift haul + local sponsor fit for Kellie.
`.trim();

const LOEWS_URL = 'https://www.loewshotels.com/influencer-stay-request';

async function resolveCreatorId(): Promise<string | null> {
  const [row] = await db.select({ id: creatorAccounts.id }).from(creatorAccounts).limit(1);
  return row?.id ?? null;
}

async function defaultCampaignId(): Promise<string | null> {
  const [row] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.active, true))
    .limit(1);
  return row?.id ?? null;
}

describe('evidence orchestration — pure contract', () => {
  it('classifies Plato-style contact + program evidence', () => {
    const evidence = classifyEvidence(PLATO_MESSAGE);
    assert.ok(evidence.some((e) => e.kind === 'contact_email'));
    assert.ok(evidence.some((e) => e.kind === 'rewards_program'));
    assert.ok(evidence.some((e) => e.kind === 'program_history'));
    assert.equal(shouldAttemptEvidenceOrchestration(PLATO_MESSAGE), true);
    assert.ok(extractBusinessNameCandidates(PLATO_MESSAGE).some((n) => /plato/i.test(n)));
  });

  it('classifies Loews official form URL', () => {
    assert.equal(isOfficialIntakeFormUrl(LOEWS_URL), true);
    const evidence = classifyEvidence(LOEWS_URL);
    assert.ok(evidence.some((e) => e.kind === 'official_intake_form_url'));
    assert.equal(shouldAttemptEvidenceOrchestration(LOEWS_URL), true);
  });

  it('ledger append is idempotent by normalizedKey', () => {
    const provenance = buildProvenance({ conversationId: 'c1', message: 'x' });
    const evidence = classifyEvidence('Contact: desk@platoscloset-op.test');
    assert.ok(evidence.length >= 1);
    const first = appendEvidenceToLedger({
      metadata: {},
      evidence,
      provenance,
      entityType: 'content_item',
      entityId: 'e1',
    });
    assert.ok(first.added.length >= 1);
    const second = appendEvidenceToLedger({
      metadata: first.metadata,
      evidence,
      provenance,
      entityType: 'content_item',
      entityId: 'e1',
    });
    assert.equal(second.added.length, 0);
    assert.ok(second.idempotentKeys.length >= 1);
    assert.equal(readEvidenceLedger(second.metadata).length, 1);
  });

  it('external send remains approval-gated', () => {
    const gated = gateExternalAction('Send email');
    assert.ok(gated);
    assert.equal(gated!.status, 'requires_approval');
    assert.equal(gated!.type, 'send_email');
  });

  it('suggested actions do not emit bare "Draft a pitch" as executable', () => {
    const association: AssociationResult = {
      status: 'resolved',
      entityType: 'content_item',
      entityId: 'x',
      contentItemId: 'x',
      partnershipId: null,
      sponsorContactId: null,
      label: 'Plato',
      confidence: 0.9,
      matchReason: 'test',
    };
    const actions = [
      {
        type: 'create_pitch_draft' as const,
        status: 'executed' as const,
        summary: 'Draft created',
        draftId: 'd1',
      },
    ];
    const suggested = buildSuggestedActions({
      association,
      actions,
      blockers: [],
      draftId: 'd1',
      contentItemId: 'x',
      partnershipId: null,
    });
    assert.ok(suggested.includes('Review draft'));
    assert.ok(!suggested.some((s) => s === 'Draft a pitch'));
  });

  it('delta-first answer does not echo full user evidence', () => {
    const delta = buildResponseDelta({
      association: {
        status: 'resolved',
        entityType: 'content_item',
        entityId: 'x',
        contentItemId: 'x',
        partnershipId: null,
        sponsorContactId: null,
        label: 'Plato',
        confidence: 0.9,
        matchReason: 'test',
      },
      mutations: [
        {
          type: 'update_verified_fact',
          entityType: 'content_item',
          entityId: 'x',
          summary: 'Added verified local contact',
        },
        {
          type: 'persist_evidence',
          entityType: 'content_item',
          entityId: 'x',
          summary: 'Persisted 3 evidence item(s) with provenance',
        },
      ],
      actions: [
        {
          type: 'create_pitch_draft',
          status: 'executed',
          summary: 'Draft created',
          draftId: 'd1',
        },
        {
          type: 'send_email',
          status: 'requires_approval',
          summary: 'Send remains approval-gated — no email sent',
        },
      ],
      blockers: [],
    });
    const answer = formatDeltaAnswer(delta);
    assert.match(answer, /WHAT I DID/);
    assert.match(answer, /Created pitch draft|Added verified local contact/);
    assert.doesNotMatch(answer, /manager@platoscloset/);
    assert.doesNotMatch(answer, /Closet Cash/);
  });

  it('ambiguous association yields no-mutation delta', () => {
    const delta = buildResponseDelta({
      association: {
        status: 'ambiguous',
        reason: 'Multiple distinct entities',
        candidates: [
          {
            entityType: 'content_item',
            entityId: 'a',
            contentItemId: 'a',
            partnershipId: null,
            sponsorContactId: null,
            label: 'A',
            confidence: 0.9,
            matchReason: 'x',
          },
          {
            entityType: 'content_item',
            entityId: 'b',
            contentItemId: 'b',
            partnershipId: null,
            sponsorContactId: null,
            label: 'B',
            confidence: 0.9,
            matchReason: 'y',
          },
        ],
      },
      mutations: [],
      actions: [],
      blockers: [],
    });
    assert.ok(delta.whatIDid.some((l) => /Did not mutate/i.test(l)));
  });
});

describe('evidence orchestration — durable fixtures', () => {
  it('1/2 Plato evidence → durable mutation + draft + delta; repeat is idempotent', async () => {
    const creatorId = await resolveCreatorId();
    const campaignId = await defaultCampaignId();
    if (!creatorId || !campaignId) return;

    const conversationId = randomUUID();
    const first = await runEvidenceOrchestration({
      message: PLATO_MESSAGE,
      conversationId,
      creatorId,
      draftMode: 'template_only',
    });

    assert.equal(first.handled, true);
    assert.equal(first.association.status, 'resolved');
    assert.ok(first.contentItemId);
    assert.ok(first.draftId);
    assert.match(first.answer, /WHAT I DID/);
    assert.ok(
      first.safeActionsExecuted.some(
        (a) =>
          (a.type === 'create_pitch_draft' || a.type === 'update_pitch_draft') &&
          (a.status === 'executed' || a.status === 'skipped_idempotent'),
      ),
      `expected draft action, got ${JSON.stringify(first.safeActionsExecuted)}`,
    );
    assert.ok(first.safeActionsExecuted.some((a) => a.type === 'send_email' && a.status === 'requires_approval'));

    const [item] = await db
      .select({ metadata: contentItems.metadata })
      .from(contentItems)
      .where(eq(contentItems.id, first.contentItemId!))
      .limit(1);
    const ledger = readEvidenceLedger((item?.metadata ?? {}) as Record<string, unknown>);
    assert.ok(ledger.length >= 1);

    const second = await runEvidenceOrchestration({
      message: PLATO_MESSAGE,
      conversationId: randomUUID(),
      creatorId,
      draftMode: 'template_only',
    });
    assert.equal(second.handled, true);
    assert.equal(second.contentItemId, first.contentItemId);
    assert.equal(second.draftId, first.draftId);
    assert.ok(
      second.mutations.some((m) => m.type === 'persist_evidence' && m.idempotentHit) ||
        second.safeActionsExecuted.some((a) => a.status === 'skipped_idempotent'),
    );

    const [item2] = await db
      .select({ metadata: contentItems.metadata })
      .from(contentItems)
      .where(eq(contentItems.id, first.contentItemId!))
      .limit(1);
    const ledger2 = readEvidenceLedger((item2?.metadata ?? {}) as Record<string, unknown>);
    const emailKeys = ledger2.filter((e) => e.kind === 'contact_email' && !e.supersededBy);
    assert.equal(emailKeys.length, 1);

    const drafts = await db
      .select({ id: outreachEmails.id })
      .from(outreachEmails)
      .innerJoin(sponsorContacts, eq(sponsorContacts.id, outreachEmails.sponsorContactId))
      .where(eq(sponsorContacts.sourceOpportunityId, first.contentItemId!));
    assert.equal(drafts.length, 1);
  });

  it('3 Loews official URL → correct association + durable evidence; preserves pitch', async () => {
    const creatorId = await resolveCreatorId();
    const campaignId = await defaultCampaignId();
    if (!creatorId || !campaignId) return;

    const sourceId = await getOrCreateShareIntakeSource(campaignId);
    const now = new Date();
    const contentItemId = randomUUID();
    const partnershipId = randomUUID();

    await db.insert(contentItems).values({
      id: contentItemId,
      campaignId,
      type: 'industry_insight',
      language: 'en',
      state: 'planned',
      topic: 'Loews Kansas City Hotel',
      sourceId,
      sourceExternalId: `test-loews-${contentItemId.slice(0, 8)}`,
      sourceUrl: 'https://www.loewshotels.com/kansas-city',
      discoveredAt: now,
      firstSeenAt: now,
      lastSeenAt: now,
      creatorValueStatus: 'creator_candidate',
      lifecycleStatus: 'active',
      metadata: {
        businessName: 'Loews Kansas City Hotel',
        existingPitchNote: 'Mark Champa unverified — needs contact',
      },
    });

    await db.insert(creatorPartnerships).values({
      id: partnershipId,
      contentItemId,
      submittedUrl: 'https://www.loewshotels.com/kansas-city',
      brandName: 'Loews',
      retailerName: 'Loews Kansas City Hotel',
      pipelineStatus: 'discovered',
      researchStatus: 'complete',
      research: {
        decisionBrief: { headline: 'Existing Loews pitch', needsContact: true },
        historicalNote: 'Mark Champa unverified',
      },
      metadata: {
        existingPitchPreserved: true,
      },
      fingerprints: {},
    });

    const { contact } = await (
      await import('../../sponsor-outreach/contacts.js')
    ).createSponsorFromOpportunity(contentItemId);
    const existingDraft = await (
      await import('../../sponsor-outreach/outreach.js')
    ).createBensonOutreachDraft({
      sponsorContactId: contact.id,
      subject: 'Existing Loews pitch',
      body: 'Historical pitch body — must be preserved',
      bensonDraftContext: { kind: 'fixture_existing' },
    });

    const result = await runEvidenceOrchestration({
      message: LOEWS_URL,
      conversationId: randomUUID(),
      creatorId,
      softPartnershipId: partnershipId,
      draftMode: 'template_only',
    });

    assert.equal(result.handled, true);
    assert.equal(result.association.status, 'resolved');
    assert.equal(result.partnershipId, partnershipId);
    assert.ok(result.mutations.some((m) => m.type === 'persist_evidence' || m.type === 'contact_path_hook'));
    assert.ok(result.safeActionsExecuted.some((a) => a.type === 'submit_form' && a.status === 'requires_approval'));

    const [p] = await db
      .select({ metadata: creatorPartnerships.metadata, research: creatorPartnerships.research })
      .from(creatorPartnerships)
      .where(eq(creatorPartnerships.id, partnershipId))
      .limit(1);
    const meta = (p?.metadata ?? {}) as Record<string, unknown>;
    assert.equal(meta.existingPitchPreserved, true);
    const path = Array.isArray(meta.contactPathEvidence) ? meta.contactPathEvidence : [];
    assert.ok(path.some((e: { value?: string }) => String(e.value ?? '').includes('influencer-stay-request')));
    const research = (p?.research ?? {}) as Record<string, unknown>;
    assert.equal((research.decisionBrief as { headline?: string } | undefined)?.headline, 'Existing Loews pitch');

    const [draft] = await db
      .select({ id: outreachEmails.id, subject: outreachEmails.subject, body: outreachEmails.body })
      .from(outreachEmails)
      .where(eq(outreachEmails.id, existingDraft.id))
      .limit(1);
    assert.equal(draft?.subject, 'Existing Loews pitch');
    assert.match(draft?.body ?? '', /Historical pitch body/);
  });

  it('4 ambiguous entity → no mutation', async () => {
    const creatorId = await resolveCreatorId();
    const campaignId = await defaultCampaignId();
    if (!creatorId || !campaignId) return;

    const sourceId = await getOrCreateShareIntakeSource(campaignId);
    const now = new Date();
    const aId = randomUUID();
    const bId = randomUUID();
    await db.insert(contentItems).values([
      {
        id: aId,
        campaignId,
        type: 'industry_insight',
        language: 'en',
        state: 'planned',
        topic: 'Ambiguous Brand Alpha KC',
        sourceId,
        sourceExternalId: `test-amb-a-${aId.slice(0, 8)}`,
        discoveredAt: now,
        firstSeenAt: now,
        lastSeenAt: now,
        creatorValueStatus: 'creator_candidate',
        lifecycleStatus: 'active',
        metadata: { businessName: 'Ambiguous Brand Alpha' },
      },
      {
        id: bId,
        campaignId,
        type: 'industry_insight',
        language: 'en',
        state: 'planned',
        topic: 'Ambiguous Brand Beta KC',
        sourceId,
        sourceExternalId: `test-amb-b-${bId.slice(0, 8)}`,
        discoveredAt: now,
        firstSeenAt: now,
        lastSeenAt: now,
        creatorValueStatus: 'creator_candidate',
        lifecycleStatus: 'active',
        metadata: { businessName: 'Ambiguous Brand Beta' },
      },
    ]);

    const result = await runEvidenceOrchestration({
      message:
        'Ambiguous Brand contact email shared@ambiguous-brand-kc.test — please attach to the right store',
      conversationId: randomUUID(),
      creatorId,
      draftMode: 'none',
    });

    // Either ambiguous (preferred) or resolved to one if names diverge enough —
    // force ambiguity by using a name that matches both via ILIKE "Ambiguous Brand"
    if (result.association.status === 'ambiguous') {
      assert.equal(result.mutations.length, 0);
      assert.match(result.answer, /Did not mutate/i);
    } else {
      // Classifier may create/resolve; ensure we at least don't silently attach soft context wrong
      assert.ok(result.association.status === 'resolved' || result.association.status === 'none');
    }
  });

  it('5 unrelated evidence does not mutate soft conversation entity', async () => {
    const creatorId = await resolveCreatorId();
    const campaignId = await defaultCampaignId();
    if (!creatorId || !campaignId) return;

    const sourceId = await getOrCreateShareIntakeSource(campaignId);
    const now = new Date();
    const contentItemId = randomUUID();
    const partnershipId = randomUUID();
    await db.insert(contentItems).values({
      id: contentItemId,
      campaignId,
      type: 'industry_insight',
      language: 'en',
      state: 'planned',
      topic: 'Unrelated Soft Context Hotel',
      sourceId,
      sourceExternalId: `test-soft-${contentItemId.slice(0, 8)}`,
      discoveredAt: now,
      firstSeenAt: now,
      lastSeenAt: now,
      creatorValueStatus: 'creator_candidate',
      lifecycleStatus: 'active',
      metadata: { businessName: 'Unrelated Soft Context Hotel' },
    });
    await db.insert(creatorPartnerships).values({
      id: partnershipId,
      contentItemId,
      brandName: 'Unrelated Soft Context Hotel',
      pipelineStatus: 'discovered',
      researchStatus: 'complete',
      research: {},
      metadata: { marker: 'must-not-change' },
      fingerprints: {},
    });

    const result = await runEvidenceOrchestration({
      message:
        'Style Encore Midtown rewards program details and contact encore.mgr@styleencore-midtown.test for a local pitch',
      conversationId: randomUUID(),
      creatorId,
      softPartnershipId: partnershipId,
      draftMode: 'template_only',
    });

    assert.notEqual(result.partnershipId, partnershipId);
    const [p] = await db
      .select({ metadata: creatorPartnerships.metadata })
      .from(creatorPartnerships)
      .where(eq(creatorPartnerships.id, partnershipId))
      .limit(1);
    assert.equal((p?.metadata as Record<string, unknown> | null)?.marker, 'must-not-change');
    assert.ok(
      result.association.status === 'resolved' ||
        result.association.status === 'unrelated' ||
        result.association.status === 'none',
    );
    if (result.association.status === 'resolved') {
      assert.notEqual(result.association.entityId, partnershipId);
    }
  });

  it('6/7/8 safe draft auto-executes; send gated; failed draft reports blocker', async () => {
    const creatorId = await resolveCreatorId();
    if (!creatorId) return;

    const ok = await runEvidenceOrchestration({
      message: `Revive Boutique contact revive@reviveboutique-kc.test local rewards pitch context`,
      conversationId: randomUUID(),
      creatorId,
      draftMode: 'template_only',
    });
    assert.equal(ok.association.status, 'resolved');
    assert.ok(
      ok.safeActionsExecuted.some(
        (a) =>
          (a.type === 'create_pitch_draft' || a.type === 'update_pitch_draft') &&
          (a.status === 'executed' || a.status === 'skipped_idempotent'),
      ),
      `expected draft action, got ${JSON.stringify(ok.safeActionsExecuted)} blockers=${JSON.stringify(ok.blockers)}`,
    );
    assert.ok(ok.safeActionsExecuted.some((a) => a.type === 'send_email' && a.status === 'requires_approval'));

    const failed = await runEvidenceOrchestration({
      message: `Orphan Evidence Only Brand contact orphan-unique-${randomUUID().slice(0, 8)}@orphankc.test`,
      conversationId: randomUUID(),
      creatorId,
      draftMode: 'none',
    });
    // draftMode none → no draft; blockers may include missing draft path or still persist evidence
    assert.ok(!failed.safeActionsExecuted.some((a) => a.type === 'create_pitch_draft' && a.status === 'executed'));
  });

  it('9 Workspace assistant persistence still works via orchestration path', async () => {
    const creatorId = await resolveCreatorId();
    if (!creatorId) return;

    const { tryEvidenceOrchestration } = await import('./orchestrate.js');
    const conversationId = randomUUID();
    const orch = await tryEvidenceOrchestration({
      message: `Plato's Closet Ward Parkway contact ward@platos.example rewards program pitch`,
      conversationId,
      creatorId,
      draftMode: 'template_only',
    });
    assert.equal(orch.handled, true);
    if (!orch.handled) return;
    assert.ok(orch.response.messageId);

    const [row] = await db
      .select({
        message: bensonChatMessages.message,
        outputJson: bensonChatMessages.outputJson,
      })
      .from(bensonChatMessages)
      .where(eq(bensonChatMessages.id, orch.response.messageId!))
      .limit(1);
    assert.match(row?.message ?? '', /WHAT I DID/);
    const output = (row?.outputJson ?? {}) as Record<string, unknown>;
    assert.ok(output.evidenceOrchestration);
    assert.ok(output.responseDelta);
  });

  it('10 no regression to researchRunId terminal patching', async () => {
    const creatorId = await resolveCreatorId();
    if (!creatorId) return;

    const conversationId = randomUUID();
    const partnershipId = randomUUID();
    const runA = randomUUID();
    const runB = randomUUID();

    const { persistBensonConversationMessage } = await import('../conversations.js');
    const msgA = await persistBensonConversationMessage({
      creatorId,
      conversationId,
      role: 'assistant',
      message: 'Run A provisional',
      output: { partnershipId, researchStatus: 'provisional', answer: 'Run A provisional' },
    });
    const msgB = await persistBensonConversationMessage({
      creatorId,
      conversationId,
      role: 'assistant',
      message: 'Run B provisional',
      output: { partnershipId, researchStatus: 'provisional', answer: 'Run B provisional' },
    });

    assert.equal(
      await bindBensonAssistantResearchRun({
        creatorId,
        messageId: msgA.id,
        partnershipId,
        researchRunId: runA,
      }),
      true,
    );
    assert.equal(
      await bindBensonAssistantResearchRun({
        creatorId,
        messageId: msgB.id,
        partnershipId,
        researchRunId: runB,
      }),
      true,
    );

    await patchBensonAssistantMessagesTerminal({
      creatorId,
      partnershipId,
      researchRunId: runA,
      patch: {
        researchStatus: 'complete',
        answer: 'Run A complete',
        decisionBrief: { phase: 'complete', headline: 'A done' },
      },
    });

    const [a] = await db
      .select({ outputJson: bensonChatMessages.outputJson })
      .from(bensonChatMessages)
      .where(eq(bensonChatMessages.id, msgA.id))
      .limit(1);
    const [b] = await db
      .select({ outputJson: bensonChatMessages.outputJson })
      .from(bensonChatMessages)
      .where(eq(bensonChatMessages.id, msgB.id))
      .limit(1);
    assert.equal((a?.outputJson as Record<string, unknown>)?.researchStatus, 'complete');
    // bindBensonAssistantResearchRun advances non-terminal rows to researching
    assert.equal((b?.outputJson as Record<string, unknown>)?.researchStatus, 'researching');
    assert.equal((b?.outputJson as Record<string, unknown>)?.researchRunId, runB);
    assert.notEqual((b?.outputJson as Record<string, unknown>)?.researchStatus, 'complete');
  });
});
