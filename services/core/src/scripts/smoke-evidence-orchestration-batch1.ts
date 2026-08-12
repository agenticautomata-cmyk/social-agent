/**
 * Local smoke for Batch 1 evidence orchestration (no paid research / no deploy).
 *
 * Run:
 *   BENSON_EVIDENCE_DRAFT_MODE=template_only pnpm exec tsx src/scripts/smoke-evidence-orchestration-batch1.ts
 */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import {
  bensonChatMessages,
  contentItems,
  creatorAccounts,
  outreachEmails,
  sponsorContacts,
} from '../schema.js';
import {
  readEvidenceLedger,
  tryEvidenceOrchestration,
} from '../ask-benson/evidence-orchestration/index.js';

const PLATO = `
Plato's Closet Smoke Fixture — local rewards Closet Cash program.
Parent influencer campaign history noted.
Direct local contact: smoke.plato@platoscloset-op.test
Pitch context: thrift haul sponsor fit.
`.trim();

async function main() {
  const [creator] = await db.select({ id: creatorAccounts.id }).from(creatorAccounts).limit(1);
  if (!creator) {
    console.error('SMOKE FAIL: no creator account');
    process.exit(1);
  }

  const conversationId = randomUUID();
  console.log('smoke.conversationId', conversationId);

  const first = await tryEvidenceOrchestration({
    message: PLATO,
    conversationId,
    creatorId: creator.id,
    draftMode: 'template_only',
  });
  if (!first.handled) {
    console.error('SMOKE FAIL: first orchestration not handled', first);
    process.exit(1);
  }

  const result = first.result;
  console.log('smoke.first', {
    messageId: first.response.messageId,
    contentItemId: result.contentItemId,
    draftId: result.draftId,
    association: result.association.status,
    mutations: result.mutations.map((m) => m.summary),
    actions: result.safeActionsExecuted.map((a) => `${a.type}:${a.status}`),
    answerPreview: first.response.answer.slice(0, 240),
  });

  if (!result.contentItemId || !result.draftId || !first.response.messageId) {
    console.error('SMOKE FAIL: missing contentItemId/draftId/messageId');
    process.exit(1);
  }
  if (!/WHAT I DID/i.test(first.response.answer)) {
    console.error('SMOKE FAIL: answer is not delta-first');
    process.exit(1);
  }
  if (/smoke\.plato@platoscloset-op\.test/i.test(first.response.answer)) {
    console.error('SMOKE FAIL: answer echoed full evidence email');
    process.exit(1);
  }

  const [item] = await db
    .select({ metadata: contentItems.metadata, topic: contentItems.topic })
    .from(contentItems)
    .where(eq(contentItems.id, result.contentItemId))
    .limit(1);
  const ledger = readEvidenceLedger((item?.metadata ?? {}) as Record<string, unknown>);
  if (ledger.length < 1) {
    console.error('SMOKE FAIL: durable ledger empty');
    process.exit(1);
  }

  const [draft] = await db
    .select({ id: outreachEmails.id, status: outreachEmails.status, subject: outreachEmails.subject })
    .from(outreachEmails)
    .where(eq(outreachEmails.id, result.draftId))
    .limit(1);
  if (!draft || draft.status === 'sent') {
    console.error('SMOKE FAIL: draft missing or sent', draft);
    process.exit(1);
  }

  const [assistant] = await db
    .select({ message: bensonChatMessages.message, outputJson: bensonChatMessages.outputJson })
    .from(bensonChatMessages)
    .where(eq(bensonChatMessages.id, first.response.messageId))
    .limit(1);
  if (!assistant || !/WHAT I DID/i.test(assistant.message)) {
    console.error('SMOKE FAIL: reload missing delta');
    process.exit(1);
  }
  const output = (assistant.outputJson ?? {}) as Record<string, unknown>;
  if (!output.evidenceOrchestration || !output.responseDelta) {
    console.error('SMOKE FAIL: workspace output missing orchestration delta');
    process.exit(1);
  }

  const second = await tryEvidenceOrchestration({
    message: PLATO,
    conversationId,
    creatorId: creator.id,
    draftMode: 'template_only',
  });
  if (!second.handled) {
    console.error('SMOKE FAIL: second orchestration not handled');
    process.exit(1);
  }
  const ledgerAfter = readEvidenceLedger(
    (
      (
        await db
          .select({ metadata: contentItems.metadata })
          .from(contentItems)
          .where(eq(contentItems.id, result.contentItemId))
          .limit(1)
      )[0]?.metadata ?? {}
    ) as Record<string, unknown>,
  );
  const emailEntries = ledgerAfter.filter((e) => e.kind === 'contact_email' && !e.supersededBy);
  if (emailEntries.length !== 1) {
    console.error('SMOKE FAIL: duplicate evidence on repeat', emailEntries.length);
    process.exit(1);
  }

  const drafts = await db
    .select({ id: outreachEmails.id })
    .from(outreachEmails)
    .innerJoin(sponsorContacts, eq(sponsorContacts.id, outreachEmails.sponsorContactId))
    .where(eq(sponsorContacts.sourceOpportunityId, result.contentItemId));
  if (drafts.length !== 1) {
    console.error('SMOKE FAIL: duplicate drafts', drafts.length);
    process.exit(1);
  }

  console.log('SMOKE PASS', {
    contentItemId: result.contentItemId,
    topic: item?.topic,
    draftId: draft.id,
    draftStatus: draft.status,
    ledgerCount: ledgerAfter.length,
    draftCount: drafts.length,
    idempotent: second.result.mutations.some((m) => m.idempotentHit) ||
      second.result.safeActionsExecuted.some((a) => a.status === 'skipped_idempotent'),
  });
}

main().catch((err) => {
  console.error('SMOKE FAIL', err);
  process.exit(1);
});
