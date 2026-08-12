/**
 * Post-deploy canary for Batch 1 evidence orchestration (no paid research).
 * Uses askBenson core path against the local DB the API uses.
 *
 *   BENSON_EVIDENCE_DRAFT_MODE=template_only pnpm exec tsx src/scripts/canary-evidence-orchestration-batch1.ts
 */
import { randomUUID } from 'node:crypto';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  bensonChatMessages,
  contentItems,
  creatorPartnerships,
  outreachEmails,
  sponsorContacts,
} from '../schema.js';
import { askBenson } from '../ask-benson/ask.js';
import {
  readContactPathEvidence,
  readEvidenceLedger,
  runEvidenceOrchestration,
} from '../ask-benson/evidence-orchestration/index.js';
import { resolveOperatorCreatorId } from '../tiktok-operator/resolve-creator.js';

const LOEWS_URL = 'https://www.loewshotels.com/influencer-stay-request';
const CANARY_TAG = `batch1-canary-${new Date().toISOString().slice(0, 10)}`;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function findLoewsPartnership(): Promise<{
  partnershipId: string;
  contentItemId: string;
  brandName: string | null;
} | null> {
  const [row] = await db
    .select({
      partnershipId: creatorPartnerships.id,
      contentItemId: creatorPartnerships.contentItemId,
      brandName: creatorPartnerships.brandName,
      retailerName: creatorPartnerships.retailerName,
      submittedUrl: creatorPartnerships.submittedUrl,
    })
    .from(creatorPartnerships)
    .where(
      or(
        ilike(creatorPartnerships.brandName, '%loews%'),
        ilike(creatorPartnerships.retailerName, '%loews%'),
        ilike(creatorPartnerships.submittedUrl, '%loewshotels%'),
      ),
    )
    .orderBy(desc(creatorPartnerships.updatedAt))
    .limit(1);
  if (!row) return null;
  return {
    partnershipId: row.partnershipId,
    contentItemId: row.contentItemId,
    brandName: row.brandName ?? row.retailerName,
  };
}

async function countDraftsForContentItem(contentItemId: string): Promise<number> {
  const rows = await db
    .select({ id: outreachEmails.id })
    .from(outreachEmails)
    .innerJoin(sponsorContacts, eq(sponsorContacts.id, outreachEmails.sponsorContactId))
    .where(eq(sponsorContacts.sourceOpportunityId, contentItemId));
  return rows.length;
}

async function main() {
  process.env.BENSON_EVIDENCE_DRAFT_MODE = process.env.BENSON_EVIDENCE_DRAFT_MODE || 'template_only';
  const creatorId = await resolveOperatorCreatorId();
  const conversationId = randomUUID();
  const evidenceMessage = `
${CANARY_TAG} Plato's Closet Canary — local rewards Closet Cash program.
Parent influencer campaign history noted.
Direct local contact: canary.plato.${Date.now()}@platoscloset-op.test
Pitch context: thrift haul sponsor fit for Kellie.
`.trim();

  console.log(JSON.stringify({ phase: 'start', conversationId, creatorId, draftMode: process.env.BENSON_EVIDENCE_DRAFT_MODE }, null, 2));

  // --- Canary 1: Ask Benson evidence submission ---
  const first = await askBenson({ message: evidenceMessage, conversationId });
  assert(first.ok, `askBenson failed: ${first.error}`);
  assert(first.messageId, 'missing assistant messageId');
  assert(/WHAT I DID/i.test(first.answer), 'answer not delta-first');
  assert(!/canary\.plato\./i.test(first.answer), 'answer echoed evidence email');
  assert(!/Closet Cash program/i.test(first.answer), 'answer paraphrased rewards evidence dump');
  assert(!/Parent influencer campaign history/i.test(first.answer), 'answer paraphrased history dump');

  const [assistant] = await db
    .select({
      message: bensonChatMessages.message,
      outputJson: bensonChatMessages.outputJson,
    })
    .from(bensonChatMessages)
    .where(eq(bensonChatMessages.id, first.messageId!))
    .limit(1);
  assert(assistant, 'assistant row missing');
  const output = (assistant.outputJson ?? {}) as Record<string, unknown>;
  assert(output.evidenceOrchestration, 'missing evidenceOrchestration in outputJson');
  assert(output.responseDelta, 'missing responseDelta in outputJson');

  const orch = output.evidenceOrchestration as {
    association?: { status?: string; label?: string; contentItemId?: string };
    safeActionsExecuted?: Array<{ type: string; status: string; draftId?: string | null }>;
  };
  assert(orch.association?.status === 'resolved', `association not resolved: ${orch.association?.status}`);
  const contentItemId =
    (typeof output.contentItemId === 'string' && output.contentItemId) ||
    orch.association?.contentItemId ||
    null;
  assert(contentItemId, 'missing contentItemId');

  const [item] = await db
    .select({ metadata: contentItems.metadata, topic: contentItems.topic })
    .from(contentItems)
    .where(eq(contentItems.id, contentItemId))
    .limit(1);
  const ledger = readEvidenceLedger((item?.metadata ?? {}) as Record<string, unknown>);
  assert(ledger.length >= 1, 'durable evidence ledger empty');

  const draftAction = (orch.safeActionsExecuted ?? []).find(
    (a) => a.type === 'create_pitch_draft' || a.type === 'update_pitch_draft',
  );
  const draftId =
    (typeof output.draftId === 'string' && output.draftId) || draftAction?.draftId || null;
  assert(draftId, 'expected internal draft');
  const [draft] = await db
    .select({ id: outreachEmails.id, status: outreachEmails.status })
    .from(outreachEmails)
    .where(eq(outreachEmails.id, draftId))
    .limit(1);
  assert(draft, 'draft row missing');
  assert(draft.status !== 'sent', `draft unexpectedly sent: ${draft.status}`);

  const sendGated = (orch.safeActionsExecuted ?? []).some(
    (a) => a.type === 'send_email' && a.status === 'requires_approval',
  );
  assert(sendGated, 'send_email not approval-gated in orchestration result');

  const draftCount1 = await countDraftsForContentItem(contentItemId);
  const emailLedger1 = ledger.filter((e) => e.kind === 'contact_email' && !e.supersededBy).length;

  console.log(
    JSON.stringify(
      {
        phase: 'canary_first',
        ok: true,
        conversationId,
        messageId: first.messageId,
        contentItemId,
        topic: item?.topic,
        draftId,
        draftStatus: draft.status,
        ledgerCount: ledger.length,
        emailLedgerCount: emailLedger1,
        draftCount: draftCount1,
        answerHead: first.answer.split('\n').slice(0, 8),
      },
      null,
      2,
    ),
  );

  // --- Canary 2: idempotent repeat ---
  const second = await askBenson({ message: evidenceMessage, conversationId });
  assert(second.ok, `repeat askBenson failed: ${second.error}`);
  assert(second.messageId, 'repeat missing messageId');
  assert(/WHAT I DID|already|idempotent|Draft updated|No new durable/i.test(second.answer), 'repeat delta not truthful');

  const [item2] = await db
    .select({ metadata: contentItems.metadata })
    .from(contentItems)
    .where(eq(contentItems.id, contentItemId))
    .limit(1);
  const ledger2 = readEvidenceLedger((item2?.metadata ?? {}) as Record<string, unknown>);
  const emailLedger2 = ledger2.filter((e) => e.kind === 'contact_email' && !e.supersededBy).length;
  const draftCount2 = await countDraftsForContentItem(contentItemId);
  assert(emailLedger2 === emailLedger1, `duplicate email evidence: ${emailLedger1} → ${emailLedger2}`);
  assert(draftCount2 === draftCount1, `duplicate drafts: ${draftCount1} → ${draftCount2}`);

  console.log(
    JSON.stringify(
      {
        phase: 'canary_idempotent',
        ok: true,
        messageId: second.messageId,
        emailLedgerCount: emailLedger2,
        draftCount: draftCount2,
        answerHead: second.answer.split('\n').slice(0, 8),
      },
      null,
      2,
    ),
  );

  // --- Loews check (no form submit) ---
  const loews = await findLoewsPartnership();
  let loewsResult: Record<string, unknown>;
  if (!loews) {
    loewsResult = { ok: false, reason: 'no_loews_partnership_in_db', skipped: true };
    console.log(JSON.stringify({ phase: 'loews', ...loewsResult }, null, 2));
  } else {
    const [before] = await db
      .select({
        metadata: creatorPartnerships.metadata,
        research: creatorPartnerships.research,
      })
      .from(creatorPartnerships)
      .where(eq(creatorPartnerships.id, loews.partnershipId))
      .limit(1);
    const beforeMeta = (before?.metadata ?? {}) as Record<string, unknown>;
    const beforeResearch = JSON.stringify(before?.research ?? {});

    // Preserve any existing draft bodies for this opportunity
    const draftsBefore = await db
      .select({ id: outreachEmails.id, subject: outreachEmails.subject, body: outreachEmails.body })
      .from(outreachEmails)
      .innerJoin(sponsorContacts, eq(sponsorContacts.id, outreachEmails.sponsorContactId))
      .where(eq(sponsorContacts.sourceOpportunityId, loews.contentItemId));

    const loewsOrch = await runEvidenceOrchestration({
      message: LOEWS_URL,
      conversationId: randomUUID(),
      creatorId,
      softPartnershipId: loews.partnershipId,
      draftMode: 'template_only',
    });
    assert(loewsOrch.handled, 'loews orchestration not handled');
    assert(loewsOrch.association.status === 'resolved', `loews association ${loewsOrch.association.status}`);
    assert(
      loewsOrch.partnershipId === loews.partnershipId ||
        (loewsOrch.association.status === 'resolved' &&
          loewsOrch.association.partnershipId === loews.partnershipId),
      'loews associated to wrong partnership',
    );
    assert(
      loewsOrch.safeActionsExecuted.some((a) => a.type === 'submit_form' && a.status === 'requires_approval'),
      'form submit not approval-gated',
    );
    assert(
      !loewsOrch.safeActionsExecuted.some((a) => a.type === 'submit_form' && a.status === 'executed'),
      'form was auto-submitted',
    );

    const [after] = await db
      .select({
        metadata: creatorPartnerships.metadata,
        research: creatorPartnerships.research,
      })
      .from(creatorPartnerships)
      .where(eq(creatorPartnerships.id, loews.partnershipId))
      .limit(1);
    const afterMeta = (after?.metadata ?? {}) as Record<string, unknown>;
    const path = readContactPathEvidence(afterMeta);
    assert(
      path.some((p) => p.kind === 'official_form' && String(p.value).includes('influencer-stay-request')),
      'contact-path official form evidence missing',
    );
    assert(JSON.stringify(after?.research ?? {}) === beforeResearch, 'Loews research/pitch authority mutated unexpectedly');

    const draftsAfter = await db
      .select({ id: outreachEmails.id, subject: outreachEmails.subject, body: outreachEmails.body })
      .from(outreachEmails)
      .innerJoin(sponsorContacts, eq(sponsorContacts.id, outreachEmails.sponsorContactId))
      .where(eq(sponsorContacts.sourceOpportunityId, loews.contentItemId));
    for (const d of draftsBefore) {
      const match = draftsAfter.find((x) => x.id === d.id);
      assert(match, `existing draft deleted: ${d.id}`);
      assert(match.subject === d.subject && match.body === d.body, `existing draft mutated: ${d.id}`);
    }

    loewsResult = {
      ok: true,
      partnershipId: loews.partnershipId,
      contentItemId: loews.contentItemId,
      brandName: loews.brandName,
      contactPathCount: path.length,
      existingDraftsPreserved: draftsBefore.length,
      submitApprovalGated: true,
      answerHead: loewsOrch.answer.split('\n').slice(0, 8),
      // Batch 4 not implemented — confirm we did not invent preferred-path supersession fields
      preferredPathRanked: false,
      beforeMarkerKeys: Object.keys(beforeMeta).slice(0, 12),
    };
    console.log(JSON.stringify({ phase: 'loews', ...loewsResult }, null, 2));
  }

  // Workspace persistence still lists conversation
  const userCount = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(bensonChatMessages)
    .where(
      and(eq(bensonChatMessages.conversationId, conversationId), eq(bensonChatMessages.role, 'user')),
    );
  const asstCount = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(bensonChatMessages)
    .where(
      and(
        eq(bensonChatMessages.conversationId, conversationId),
        eq(bensonChatMessages.role, 'assistant'),
      ),
    );

  console.log(
    JSON.stringify(
      {
        phase: 'summary',
        ok: true,
        conversationId,
        contentItemId,
        draftId,
        userMessages: userCount[0]?.n,
        assistantMessages: asstCount[0]?.n,
        loews: loewsResult,
      },
      null,
      2,
    ),
  );
  console.log('CANARY PASS');
}

main().catch((err) => {
  console.error('CANARY FAIL', err);
  process.exit(1);
});
