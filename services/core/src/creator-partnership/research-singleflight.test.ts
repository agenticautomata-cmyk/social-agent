import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { campaigns, contentItems, creatorPartnerships } from '../schema.js';
import {
  claimPartnershipResearch,
  completePartnershipResearchFenced,
  failPartnershipResearchFenced,
  isResearchLeaseExpired,
  RESEARCH_LEASE_MS,
  shouldAttemptPartnershipResearch,
} from './research-singleflight.js';
import {
  PARTNERSHIP_RESEARCH_SEARCH_TARGET_COUNT,
  researchCreatorPartnership,
} from './research.js';
import { runPartnershipResearch, submitCreatorPartnership } from './pipeline.js';
import type { PartnershipResearch } from './types.js';

const FIXTURE_PREFIX = 'ZZZ_TEST_FIXTURE_research_singleflight_';

let campaignId: string;
const partnershipIds: string[] = [];
const contentItemIds: string[] = [];

async function insertPartnershipFixture(input: {
  researchStatus: 'queued' | 'researching' | 'complete' | 'failed';
  metadata?: Record<string, unknown>;
  research?: Partial<PartnershipResearch>;
  submittedUrl?: string;
}): Promise<string> {
  const submittedUrl = input.submittedUrl ?? `https://example.com/${FIXTURE_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const [item] = await db
    .insert(contentItems)
    .values({
      campaignId,
      type: 'industry_insight',
      state: 'planned',
      topic: `${FIXTURE_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      creatorValueStatus: 'researching',
      lifecycleStatus: 'active',
    })
    .returning({ id: contentItems.id });
  assert.ok(item);
  contentItemIds.push(item.id);

  const [partnership] = await db
    .insert(creatorPartnerships)
    .values({
      contentItemId: item.id,
      submittedUrl,
      brandName: 'Fixture Brand',
      retailerName: 'Fixture Retailer',
      pipelineStatus: input.researchStatus === 'researching' ? 'researching' : 'discovered',
      researchStatus: input.researchStatus,
      metadata: input.metadata ?? {},
      research: input.research ?? {},
    })
    .returning({ id: creatorPartnerships.id });
  assert.ok(partnership);
  partnershipIds.push(partnership.id);
  return partnership.id;
}

async function setPartnershipState(
  partnershipId: string,
  patch: {
    researchStatus?: 'queued' | 'researching' | 'complete' | 'failed' | 'needs_verification';
    metadata?: Record<string, unknown>;
    research?: Record<string, unknown>;
  },
): Promise<void> {
  await db
    .update(creatorPartnerships)
    .set({
      researchStatus: patch.researchStatus,
      metadata: patch.metadata,
      research: patch.research,
      updatedAt: new Date(),
    })
    .where(eq(creatorPartnerships.id, partnershipId));
}

async function runConcurrentClaimsExpect(
  partnershipId: string,
  attempts: number,
  expect: { winners: number; throws: number },
): Promise<void> {
  const results = await Promise.allSettled(
    Array.from({ length: attempts }, () => claimPartnershipResearch(partnershipId, { trigger: 'test' })),
  );
  const throws = results.filter((r) => r.status === 'rejected').length;
  const claims = results
    .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof claimPartnershipResearch>>> => r.status === 'fulfilled')
    .map((r) => r.value);
  assert.equal(throws, expect.throws, `expected ${expect.throws} throws, got ${throws}`);
  assert.equal(
    claims.filter((r) => r.claimed).length,
    expect.winners,
    `expected ${expect.winners} winners, got ${claims.filter((r) => r.claimed).length}`,
  );
}

async function waitForResearchTerminal(partnershipId: string, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [row] = await db
      .select({
        researchStatus: creatorPartnerships.researchStatus,
        runId: sql<string | null>`${creatorPartnerships.metadata}->>'researchRunId'`,
      })
      .from(creatorPartnerships)
      .where(eq(creatorPartnerships.id, partnershipId))
      .limit(1);
    if (
      row?.researchStatus === 'complete' ||
      row?.researchStatus === 'needs_verification' ||
      row?.researchStatus === 'failed'
    ) {
      return row;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`research did not reach terminal state within ${timeoutMs}ms`);
}

describe('research-singleflight — unit semantics', () => {
  it('shouldAttemptPartnershipResearch covers queued/failed/researching and stale terminal', () => {
    assert.equal(shouldAttemptPartnershipResearch({ researchStatus: 'queued', researchedAt: null }), true);
    assert.equal(shouldAttemptPartnershipResearch({ researchStatus: 'failed', researchedAt: null }), true);
    assert.equal(shouldAttemptPartnershipResearch({ researchStatus: 'researching', researchedAt: null }), true);
    assert.equal(
      shouldAttemptPartnershipResearch({
        researchStatus: 'complete',
        researchedAt: new Date().toISOString(),
      }),
      false,
    );
    assert.equal(
      shouldAttemptPartnershipResearch({
        researchStatus: 'complete',
        researchedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      }),
      true,
    );
  });

  it('isResearchLeaseExpired treats missing and malformed startedAt as expired', () => {
    assert.equal(isResearchLeaseExpired(null), true);
    assert.equal(isResearchLeaseExpired('not-a-timestamp'), true);
    assert.equal(isResearchLeaseExpired('2026-99-99T25:61:61'), true);
    assert.equal(isResearchLeaseExpired('2026-02-31T12:00:00'), true);
    assert.equal(isResearchLeaseExpired(new Date().toISOString()), false);
    assert.equal(
      isResearchLeaseExpired(new Date(Date.now() - RESEARCH_LEASE_MS - 1000).toISOString()),
      true,
    );
  });

  it('research search target count is at most 6', () => {
    assert.equal(PARTNERSHIP_RESEARCH_SEARCH_TARGET_COUNT, 6);
  });

  it('mocked searchWeb performs at most 6 searches per cycle', async () => {
    let searchCount = 0;
    await researchCreatorPartnership(
      {
        title: 'Fixture',
        brandName: 'Fixture Brand',
        productName: null,
        retailerName: 'Fixture Retailer',
        submittedUrl: null,
        submittedText: null,
        partnershipId: '00000000-0000-0000-0000-000000000001',
        researchRunId: '00000000-0000-0000-0000-000000000002',
      },
      {
        searchWeb: async () => {
          searchCount += 1;
          return { ok: true, summary: 'fixture', citations: [] };
        },
      },
    );
    assert.equal(searchCount, PARTNERSHIP_RESEARCH_SEARCH_TARGET_COUNT);
    assert.ok(searchCount <= 6);
  });
});

describe('research-singleflight — postgres atomic claims', () => {
  before(async () => {
    const [existingCampaign] = await db.select({ id: campaigns.id }).from(campaigns).limit(1);
    assert.ok(existingCampaign, 'expected at least one campaign row');
    campaignId = existingCampaign.id;
  });

  after(async () => {
    if (partnershipIds.length > 0) {
      await db.delete(creatorPartnerships).where(inArray(creatorPartnerships.id, partnershipIds));
    }
    if (contentItemIds.length > 0) {
      await db.delete(contentItems).where(inArray(contentItems.id, contentItemIds));
    }
  });

  it('internal skipResearch prevents claim and paid work', async () => {
    let researchCalls = 0;
    const partnershipId = await insertPartnershipFixture({ researchStatus: 'queued' });
    await runPartnershipResearch(partnershipId, {
      skipResearch: true,
      testResearchFn: async () => {
        researchCalls += 1;
        return { researchedAt: new Date().toISOString() } as PartnershipResearch;
      },
      testSkipPageFetch: true,
    });
    assert.equal(researchCalls, 0);
    const [row] = await db
      .select({ researchStatus: creatorPartnerships.researchStatus })
      .from(creatorPartnerships)
      .where(eq(creatorPartnerships.id, partnershipId))
      .limit(1);
    assert.equal(row?.researchStatus, 'queued');
  });

  it('queued: 20 concurrent claims → exactly 1 winner', async () => {
    const partnershipId = await insertPartnershipFixture({ researchStatus: 'queued' });
    const results = await Promise.all(
      Array.from({ length: 20 }, () => claimPartnershipResearch(partnershipId, { trigger: 'test' })),
    );
    const winners = results.filter((r) => r.claimed);
    assert.equal(winners.length, 1);
    assert.equal(results.filter((r) => !r.claimed).length, 19);
    assert.ok(winners[0]?.researchRunId);
  });

  it('fresh researching lease: 20 concurrent claims → 0 winners', async () => {
    const partnershipId = await insertPartnershipFixture({
      researchStatus: 'researching',
      metadata: {
        researchRunId: '00000000-0000-0000-0000-0000000000aa',
        researchStartedAt: new Date().toISOString(),
      },
    });
    await runConcurrentClaimsExpect(partnershipId, 20, { winners: 0, throws: 0 });
  });

  it('expired researching lease (valid ISO): 20 concurrent claims → exactly 1 winner with new run id', async () => {
    const priorRunId = '00000000-0000-0000-0000-0000000000bb';
    const partnershipId = await insertPartnershipFixture({
      researchStatus: 'researching',
      metadata: {
        researchRunId: priorRunId,
        researchStartedAt: new Date(Date.now() - RESEARCH_LEASE_MS - 60_000).toISOString(),
      },
    });
    const results = await Promise.all(
      Array.from({ length: 20 }, () => claimPartnershipResearch(partnershipId, { trigger: 'test' })),
    );
    const winners = results.filter((r) => r.claimed);
    assert.equal(winners.length, 1);
    assert.equal(winners[0]?.recovery, true);
    assert.notEqual(winners[0]?.researchRunId, priorRunId);
  });

  for (const testCase of [
    { label: 'random garbage', startedAt: 'definitely-not-a-timestamp' },
    { label: 'ISO invalid month/day/time', startedAt: '2026-99-99T25:61:61' },
    { label: 'impossible calendar date', startedAt: '2026-02-31T12:00:00' },
  ]) {
    it(`unparseable lease (${testCase.label}): 20 claims → 0 throws, 1 winner`, async () => {
      const partnershipId = await insertPartnershipFixture({
        researchStatus: 'researching',
        metadata: {
          researchRunId: '00000000-0000-0000-0000-000000000099',
          researchStartedAt: testCase.startedAt,
        },
      });
      await runConcurrentClaimsExpect(partnershipId, 20, { winners: 1, throws: 0 });
    });
  }

  it('missing researchStartedAt: 20 claims → 0 throws, 1 winner', async () => {
    const partnershipId = await insertPartnershipFixture({
      researchStatus: 'researching',
      metadata: {
        researchRunId: '00000000-0000-0000-0000-000000000088',
      },
    });
    await runConcurrentClaimsExpect(partnershipId, 20, { winners: 1, throws: 0 });
  });

  it('stale Run A success terminal write after Run B recovery → 0 rows', async () => {
    const runA = '00000000-0000-0000-0000-0000000000d1';
    const runB = '00000000-0000-0000-0000-0000000000d2';
    const partnershipId = await insertPartnershipFixture({
      researchStatus: 'researching',
      metadata: { researchRunId: runA, researchStartedAt: new Date().toISOString() },
    });
    await setPartnershipState(partnershipId, {
      researchStatus: 'researching',
      metadata: { researchRunId: runB, researchStartedAt: new Date().toISOString() },
    });
    const result = await completePartnershipResearchFenced({
      partnershipId,
      researchRunId: runA,
      patch: {
        researchStatus: 'complete',
        research: { researchedAt: new Date().toISOString() },
      },
    });
    assert.equal(result.applied, false);
    const [row] = await db
      .select({
        researchStatus: creatorPartnerships.researchStatus,
        runId: sql<string | null>`${creatorPartnerships.metadata}->>'researchRunId'`,
      })
      .from(creatorPartnerships)
      .where(eq(creatorPartnerships.id, partnershipId))
      .limit(1);
    assert.equal(row?.researchStatus, 'researching');
    assert.equal(row?.runId, runB);
  });

  it('stale Run A failure terminal write after Run B recovery → 0 rows', async () => {
    const runA = '00000000-0000-0000-0000-0000000000e1';
    const runB = '00000000-0000-0000-0000-0000000000e2';
    const partnershipId = await insertPartnershipFixture({
      researchStatus: 'researching',
      metadata: { researchRunId: runA, researchStartedAt: new Date().toISOString() },
    });
    await setPartnershipState(partnershipId, {
      researchStatus: 'researching',
      metadata: { researchRunId: runB, researchStartedAt: new Date().toISOString() },
    });
    const result = await failPartnershipResearchFenced({
      partnershipId,
      researchRunId: runA,
      error: 'stale failure should not apply',
    });
    assert.equal(result.applied, false);
    const [row] = await db
      .select({ researchStatus: creatorPartnerships.researchStatus })
      .from(creatorPartnerships)
      .where(eq(creatorPartnerships.id, partnershipId))
      .limit(1);
    assert.equal(row?.researchStatus, 'researching');
  });

  it('runPartnershipResearch: 20 parallel attempts → at most one research execution', async () => {
    const partnershipId = await insertPartnershipFixture({ researchStatus: 'queued' });
    let researchCalls = 0;
    await Promise.all(
      Array.from({ length: 20 }, () =>
        runPartnershipResearch(partnershipId, {
          trigger: 'test',
          testSkipPageFetch: true,
          testResearchFn: async () => {
            researchCalls += 1;
            return {
              researchedAt: new Date().toISOString(),
              needsVerification: [],
              citations: [],
              localLocations: [],
              researchSummary: 'fixture',
              companySummary: { value: 'x', status: 'inferred', source: 'test' },
              audienceFitRationale: { value: 'x', status: 'inferred', source: 'test' },
              creatorProgram: { value: null, status: 'unavailable', source: null },
              programBenefits: { value: null, status: 'unavailable', source: null },
              programRequirements: { value: null, status: 'unavailable', source: null },
              socialAccounts: { value: null, status: 'unavailable', source: null },
              recentCollaborations: { value: null, status: 'unavailable', source: null },
              retailerRelationships: { value: null, status: 'unavailable', source: null },
              localFilmingPotential: { value: null, status: 'unavailable', source: null },
              creatorContactPath: { value: null, status: 'unavailable', source: null },
              productsPricingHooks: { value: null, status: 'unavailable', source: null },
              organicBeforeApproval: { value: null, status: 'unavailable', source: null },
              storyAngleCandidates: [],
              nextActionInputs: [],
            } satisfies PartnershipResearch;
          },
        }),
      ),
    );
    assert.equal(researchCalls, 1);
  });

  it('submitCreatorPartnership with skipResearch does not leave queued partnerships executing research', async () => {
    const url = `https://example.com/${FIXTURE_PREFIX}skip_${Date.now()}`;
    const result = await submitCreatorPartnership(
      { url, text: url, sourceScreen: 'test' },
      { skipResearch: true },
    );
    partnershipIds.push(result.partnershipId);
    const [row] = await db
      .select({ researchStatus: creatorPartnerships.researchStatus })
      .from(creatorPartnerships)
      .where(eq(creatorPartnerships.id, result.partnershipId))
      .limit(1);
    assert.equal(row?.researchStatus, 'queued');
  });

  it('e2e: 20 parallel submitCreatorPartnership → one partnership, one researchRun, ≤6 searchWeb', async () => {
    const url = `https://example.com/${FIXTURE_PREFIX}e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const partnershipId = await insertPartnershipFixture({
      researchStatus: 'queued',
      submittedUrl: url,
    });

    let searchCount = 0;
    const mockSearch = async () => {
      searchCount += 1;
      return { ok: true, summary: 'fixture', citations: [] };
    };

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        submitCreatorPartnership(
          { url, text: url, sourceScreen: 'test_e2e' },
          { testSearchWeb: mockSearch, testSkipPageFetch: true },
        ),
      ),
    );

    const partnershipIdSet = new Set(results.map((r) => r.partnershipId));
    assert.equal(partnershipIdSet.size, 1);
    assert.equal([...partnershipIdSet][0], partnershipId);
    assert.equal(results.every((r) => r.duplicate), true);

    const terminal = await waitForResearchTerminal(partnershipId);
    assert.ok(
      terminal.researchStatus === 'complete' ||
        terminal.researchStatus === 'needs_verification' ||
        terminal.researchStatus === 'failed',
    );
    assert.ok(terminal.runId);
    assert.equal(searchCount, PARTNERSHIP_RESEARCH_SEARCH_TARGET_COUNT);
    assert.ok(searchCount <= 6);
  });

  it('e2e expired lease: 20 parallel submit touch → one recovery, one researchRun, ≤6 searchWeb', async () => {
    const runA = '00000000-0000-0000-0000-0000000000aa';
    const url = `https://example.com/${FIXTURE_PREFIX}expired_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const partnershipId = await insertPartnershipFixture({
      researchStatus: 'researching',
      submittedUrl: url,
      metadata: {
        researchRunId: runA,
        researchStartedAt: new Date(Date.now() - RESEARCH_LEASE_MS - 60_000).toISOString(),
      },
    });

    let searchCount = 0;
    let researchExecutions = 0;
    let claimWinners = 0;
    let recoveryWinners = 0;
    const mockSearch = async () => {
      searchCount += 1;
      return { ok: true, summary: 'fixture', citations: [] };
    };

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        submitCreatorPartnership(
          { url, text: url, sourceScreen: 'test_expired_lease_e2e' },
          {
            testSearchWeb: mockSearch,
            testSkipPageFetch: true,
            testOnClaim: (claim) => {
              if (claim.claimed) claimWinners += 1;
              if (claim.recovery) recoveryWinners += 1;
            },
            testResearchFn: async (input, deps) => {
              researchExecutions += 1;
              return researchCreatorPartnership(input, { searchWeb: mockSearch, ...deps });
            },
          },
        ),
      ),
    );

    const partnershipIdSet = new Set(results.map((r) => r.partnershipId));
    assert.equal(partnershipIdSet.size, 1);
    assert.equal([...partnershipIdSet][0], partnershipId);
    assert.equal(results.every((r) => r.duplicate), true);

    const terminal = await waitForResearchTerminal(partnershipId);
    assert.ok(terminal.runId);
    assert.notEqual(terminal.runId, runA);
    assert.equal(claimWinners, 1);
    assert.equal(recoveryWinners, 1);
    assert.equal(researchExecutions, 1);
    assert.equal(searchCount, PARTNERSHIP_RESEARCH_SEARCH_TARGET_COUNT);
    assert.ok(searchCount <= 6);

    const staleWrite = await completePartnershipResearchFenced({
      partnershipId,
      researchRunId: runA,
      patch: {
        researchStatus: 'complete',
        research: { researchedAt: new Date().toISOString() },
      },
    });
    assert.equal(staleWrite.applied, false);

    const [row] = await db
      .select({
        researchStatus: creatorPartnerships.researchStatus,
        runId: sql<string | null>`${creatorPartnerships.metadata}->>'researchRunId'`,
      })
      .from(creatorPartnerships)
      .where(eq(creatorPartnerships.id, partnershipId))
      .limit(1);
    assert.equal(row?.runId, terminal.runId);
    assert.ok(
      row?.researchStatus === 'complete' ||
        row?.researchStatus === 'needs_verification' ||
        row?.researchStatus === 'failed',
    );
  });
});
