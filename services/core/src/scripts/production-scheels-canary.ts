#!/usr/bin/env -S pnpm exec tsx
/**
 * Post-deploy production SCHEELS singleflight canary (one controlled research cycle).
 */
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  getCreatorPartnership,
  runPartnershipResearch,
  submitCreatorPartnership,
} from '../creator-partnership/pipeline.js';
import { completePartnershipResearchFenced } from '../creator-partnership/research-singleflight.js';

const REQUESTED_PARTNERSHIP_ID = 'cec7d31d-ab53-4828-aae6-2c170dd3b293';
const SCHEELS_URL =
  'https://www.scheels.com/c/all/b/what%20goes%20around%20comes%20around?r=storeAvailability%3A88';
const SCHEELS_TRACKING_URL = `${SCHEELS_URL}&utm_source=test_canary&utm_medium=social`;
const CANARY_STARTED = new Date().toISOString();

async function resolveCanaryPartnershipId(): Promise<{ id: string; requestedIdFound: boolean }> {
  const requested = await getCreatorPartnership(REQUESTED_PARTNERSHIP_ID);
  if (requested) return { id: REQUESTED_PARTNERSHIP_ID, requestedIdFound: true };
  const rows = (await db.execute(sql`
    SELECT id::text as id
    FROM creator_partnerships
    WHERE submitted_url ILIKE '%scheels%what%goes%around%'
    ORDER BY updated_at DESC
    LIMIT 1
  `)) as unknown as Array<{ id: string }>;
  const fallback = rows[0]?.id;
  if (!fallback) throw new Error('scheels_partnership_not_found');
  return { id: fallback, requestedIdFound: false };
}

type SpendRow = {
  count: string;
  total_cost: string;
};

type UsageRow = {
  id: string;
  created_at: string;
  estimated_cost: string;
  metadata: Record<string, unknown>;
};

async function querySpendSince(sinceIso: string, partnershipId?: string, researchRunId?: string) {
  const rows = (await db.execute(sql`
    SELECT count(*)::text as count, coalesce(sum(estimated_cost), 0)::text as total_cost
    FROM llm_usage_events
    WHERE source = 'web_search'
      AND created_at >= ${sinceIso}::timestamptz
      AND (${partnershipId ?? null}::text IS NULL OR metadata->>'partnershipId' = ${partnershipId ?? null})
      AND (${researchRunId ?? null}::text IS NULL OR metadata->>'researchRunId' = ${researchRunId ?? null})
      AND coalesce(metadata->>'caller', '') LIKE 'creator_partnership%'
  `)) as unknown as SpendRow[];
  return rows[0] ?? { count: '0', total_cost: '0' };
}

async function listUsageForRun(researchRunId: string, sinceIso: string) {
  return (await db.execute(sql`
    SELECT id, created_at, estimated_cost, metadata
    FROM llm_usage_events
    WHERE source = 'web_search'
      AND created_at >= ${sinceIso}::timestamptz
      AND metadata->>'researchRunId' = ${researchRunId}
    ORDER BY created_at ASC
  `)) as unknown as UsageRow[];
}

async function waitForTerminal(partnershipId: string, timeoutMs = 900_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const partnership = await getCreatorPartnership(partnershipId);
    if (
      partnership &&
      (partnership.researchStatus === 'complete' ||
        partnership.researchStatus === 'needs_verification' ||
        partnership.researchStatus === 'failed')
    ) {
      return partnership;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('timeout_waiting_for_terminal');
}

async function main() {
  const { id: partnershipId, requestedIdFound } = await resolveCanaryPartnershipId();
  const before = await getCreatorPartnership(partnershipId);
  assert.ok(before, 'partnership_not_found');
  const priorRunId =
    typeof before.metadata?.researchRunId === 'string' ? before.metadata.researchRunId : null;

  const spendBeforeDay = (await db.execute(sql`
    SELECT count(*)::text as count, coalesce(sum(estimated_cost), 0)::text as total_cost
    FROM llm_usage_events
    WHERE source = 'web_search'
      AND metadata->>'partnershipId' = ${partnershipId}
      AND created_at >= date_trunc('day', now())
  `)) as unknown as SpendRow[];

  let claimWinners = 0;
  let recoveryWinners = 0;

  console.log(
    JSON.stringify({
      phase: 'pre_canary',
      requestedPartnershipId: REQUESTED_PARTNERSHIP_ID,
      requestedIdFound,
      partnershipId,
      priorRunId,
      priorStatus: before.researchStatus,
      submittedUrl: before.submittedUrl,
      spendTodayBefore: spendBeforeDay[0],
      canaryStarted: CANARY_STARTED,
    }),
  );

  await runPartnershipResearch(partnershipId, {
    force: true,
    trigger: 'production_canary',
    testOnClaim: (claim) => {
      if (claim.claimed) claimWinners += 1;
      if (claim.recovery) recoveryWinners += 1;
    },
  });

  const dupResults = await Promise.all([
    submitCreatorPartnership({ url: SCHEELS_URL, text: SCHEELS_URL, sourceScreen: 'production_canary' }),
    submitCreatorPartnership({
      url: SCHEELS_URL,
      text: SCHEELS_URL,
      sourceScreen: 'production_canary_normalized',
    }),
    submitCreatorPartnership({
      url: SCHEELS_TRACKING_URL,
      text: SCHEELS_TRACKING_URL,
      sourceScreen: 'production_canary_tracking',
    }),
  ]);

  const dupIds = new Set(dupResults.map((r) => r.partnershipId));
  assert.equal(dupIds.size, 1);
  assert.equal([...dupIds][0], partnershipId);
  assert.equal(dupResults.every((r) => r.duplicate), true);

  const terminal = await waitForTerminal(partnershipId);
  const newRunId =
    typeof terminal.metadata?.researchRunId === 'string' ? terminal.metadata.researchRunId : null;
  assert.ok(newRunId);

  const usage = await listUsageForRun(newRunId, CANARY_STARTED);
  const spendForRun = await querySpendSince(CANARY_STARTED, partnershipId, newRunId);

  let staleFenceApplied: boolean | null = null;
  if (priorRunId && priorRunId !== newRunId) {
    const stale = await completePartnershipResearchFenced({
      partnershipId,
      researchRunId: priorRunId,
      patch: {
        researchStatus: 'complete',
        research: { researchedAt: new Date().toISOString() },
      },
    });
    staleFenceApplied = stale.applied;
  }

  const dupCount = (await db.execute(sql`
    SELECT count(*)::text as count
    FROM creator_partnerships
    WHERE submitted_url ILIKE '%scheels.com%what%goes%around%'
       OR metadata->>'opportunityFingerprint' = ${before.metadata?.opportunityFingerprint ?? null}
  `)) as unknown as Array<{ count: string }>;

  console.log(
    JSON.stringify(
      {
        phase: 'post_canary',
        requestedPartnershipId: REQUESTED_PARTNERSHIP_ID,
        requestedIdFound,
        partnershipId,
        priorRunId,
        newRunId,
        claimWinnersFromForceRefresh: claimWinners,
        recoveryWinners,
        duplicatePartnershipIds: [...dupIds],
        duplicateResults: dupResults.map((r) => ({
          duplicate: r.duplicate,
          researchStatus: r.researchStatus,
        })),
        terminalStatus: terminal.researchStatus,
        webSearchCountForRun: Number(spendForRun.count),
        estimatedCostForRun: spendForRun.total_cost,
        telemetrySample: usage.slice(0, 2).map((row) => ({
          id: row.id,
          estimatedCost: row.estimated_cost,
          metadata: row.metadata,
        })),
        stalePriorRunFenceApplied: staleFenceApplied,
        scheelsPartnershipRows: dupCount[0]?.count ?? '0',
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
