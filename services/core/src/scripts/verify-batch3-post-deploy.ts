/**
 * Batch 3 post-deploy verification against the live DB / deployed code path.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { campaigns, contentItems, creatorAccounts, sources } from '../schema.js';
import { evaluateTemporalState } from '../creator-agent/temporal-state.js';
import { computeLifecycleStatus } from '../creator-agent/lifecycle.js';
import { sanitizeStaleTemporalProse } from '../creator-agent/stale-temporal-prose.js';
import { evaluateHomeEligibility } from '../inventory/home-eligibility.js';
import { normalizeInventoryItem } from '../inventory/normalize.js';
import { computeOperationalHomeData } from '../pre-alpha/operational-home.js';
import { runExpiredEventSweep } from '../inventory/expire-sweep.js';
import { runLifecycleRecompute } from '../inventory/lifecycle-recompute.js';
import { runEvidenceOrchestration } from '../ask-benson/evidence-orchestration/index.js';
import { isEmploymentOpportunity } from '../creator-agent/employment-intent.js';
import { randomUUID } from 'node:crypto';

const STYLE = {
  prose: '51738b24-5a79-4448-ae92-73f1217faaab',
  dated: 'd1101683-c88b-4221-a1e3-ccfebb0063fd',
  entityActive: '44396f4c-0768-4aab-8768-6e8271c443d3',
  job: '2188d040-12de-45dc-a640-4f9b65811954',
};

const CHICAGO = 'America/Chicago';
const NOW = new Date();

async function load(id: string) {
  const [row] = await db.select().from(contentItems).where(eq(contentItems.id, id)).limit(1);
  return row ?? null;
}

async function main() {
  const out: Record<string, unknown> = {
    now: NOW.toISOString(),
    db: (process.env.DATABASE_URL || '').replace(/:[^:@/]+@/, ':***@'),
  };

  // --- Style Encore ---
  const styleRows: Record<string, unknown> = {};
  for (const [key, id] of Object.entries(STYLE)) {
    const row = await load(id);
    if (!row) {
      styleRows[key] = { id, missing: true };
      continue;
    }
    const normalized = normalizeInventoryItem(row, 'verify', 'manual');
    const home = evaluateHomeEligibility(normalized);
    const sanitized = sanitizeStaleTemporalProse({
      text: row.script,
      startsAt: row.eventStartsAt,
      endsAt: row.eventEndsAt,
      now: NOW,
    });
    styleRows[key] = {
      id: row.id,
      topic: row.topic,
      exists: true,
      lifecycleStatus: row.lifecycleStatus,
      creatorValueStatus: row.creatorValueStatus,
      eventStartsAt: row.eventStartsAt,
      hasNextInRaw: /next event/i.test(row.script ?? ''),
      sanitizedHasNext: /\bnext event\b/i.test(sanitized.text),
      sanitizedHasCurrentUpcoming: /\b(current|upcoming)\s+(event|sale|promotion)\b/i.test(
        sanitized.text,
      ),
      sanitizedHasWatch: /worth watching|has run local promotions/i.test(sanitized.text),
      summaryHasNext: /\bnext event\b/i.test(normalized.summary ?? ''),
      homeEligible: home.eligible,
      homeReasons: home.reasons,
    };
  }
  out.styleEncore = styleRows;

  // --- Control fixtures (pure temporal) ---
  const todayKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: CHICAGO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(NOW);
  const [y, m, d] = todayKey.split('-').map(Number);
  const tomorrow = new Date(Date.UTC(y!, m! - 1, d! + 1));
  const yesterday = new Date(Date.UTC(y!, m! - 1, d! - 1));
  const todayDateOnly = new Date(Date.UTC(y!, m! - 1, d!));

  out.controls = {
    todayDateOnly: evaluateTemporalState({
      startsAt: todayDateOnly,
      timezone: CHICAGO,
      now: NOW,
    }).state,
    tomorrow: evaluateTemporalState({
      startsAt: tomorrow,
      timezone: CHICAGO,
      now: NOW,
    }).state,
    yesterdayEnded: evaluateTemporalState({
      startsAt: yesterday,
      endsAt: yesterday,
      timezone: CHICAGO,
      now: NOW,
    }).state,
    noDate: evaluateTemporalState({ startsAt: null, endsAt: null, now: NOW }).state,
    endWins: evaluateTemporalState({
      startsAt: new Date('2026-08-20T15:00:00.000Z'),
      endsAt: new Date('2026-08-09T22:00:00.000Z'),
      now: NOW,
    }).state,
    lifecycleToday: computeLifecycleStatus(
      { title: 'Today event', eventStartsAt: todayDateOnly },
      NOW,
    ),
    lifecycleNoDate: computeLifecycleStatus({ title: 'Undated thrift restock' }, NOW),
  };

  // --- Worker path: controlled past-dated active fixture ---
  const [campaign] = await db.select({ id: campaigns.id }).from(campaigns).limit(1);
  const [source] = await db.select({ id: sources.id }).from(sources).limit(1);
  const fixtureExternalId = `batch3-verify-past-${Date.now()}`;
  let controlled: Record<string, unknown> = { skipped: true };
  if (campaign && source) {
    const [inserted] = await db
      .insert(contentItems)
      .values({
        campaignId: campaign.id,
        type: 'industry_insight',
        language: 'en',
        state: 'planned',
        topic: 'Batch3 Verify Past KC Event',
        hook: 'Controlled fixture',
        script: 'A past local event for Batch 3 worker-path verification.',
        sourceId: source.id,
        sourceExternalId: fixtureExternalId,
        discoveredAt: NOW,
        eventStartsAt: new Date('2026-08-09T00:00:00.000Z'),
        eventEndsAt: new Date('2026-08-09T00:00:00.000Z'),
        creatorValueStatus: 'creator_candidate',
        lifecycleStatus: 'active',
        metadata: {
          ingest: 'batch3_verify',
          opportunityCategory: 'local_event',
          batch3Verify: true,
        },
      })
      .returning({ id: contentItems.id, lifecycleStatus: contentItems.lifecycleStatus });

    const before = inserted!.lifecycleStatus;
    // Same function the expired-event-sweep worker invokes (recompute before retention delete).
    const sweep1 = await runExpiredEventSweep({
      // Keep retention delete from eating this 2-day-old fixture
      daysPast: 30,
      limit: 50_000,
    });
    const [afterRow] = await db
      .select({
        id: contentItems.id,
        lifecycleStatus: contentItems.lifecycleStatus,
        topic: contentItems.topic,
      })
      .from(contentItems)
      .where(eq(contentItems.id, inserted!.id))
      .limit(1);

    const sweep2 = await runExpiredEventSweep({ daysPast: 30, limit: 50_000 });
    const recomputeIdempotent = await runLifecycleRecompute({ dryRun: true, limit: 50_000 });

    controlled = {
      id: inserted!.id,
      before,
      after: afterRow?.lifecycleStatus,
      stillExists: Boolean(afterRow),
      sweep1: {
        lifecycleUpdated: sweep1.lifecycleRecompute.updated,
        lifecycleScanned: sweep1.lifecycleRecompute.scanned,
        retentionDeleted: sweep1.deleted,
      },
      sweep2: {
        lifecycleUpdated: sweep2.lifecycleRecompute.updated,
        retentionDeleted: sweep2.deleted,
      },
      dryRecomputePendingUpdates: recomputeIdempotent.updated,
    };

    // Cleanup controlled fixture (not production evidence)
    await db.delete(contentItems).where(eq(contentItems.id, inserted!.id));
  }
  out.controlledWorkerPath = controlled;

  // --- Home ---
  const home = await computeOperationalHomeData();
  const blob = JSON.stringify(home).toLowerCase();
  const priorityTitles = (home.topOpportunities ?? []).map((c) => c.title);
  const eventTitles = (home.dailyBriefing?.topEvents ?? []).map((c) => c.title);
  const askTitles = (home.dailyBriefing?.askBensonToday ?? []).map((c) => c.title);
  out.home = {
    ok: true,
    priorityCount: priorityTitles.length,
    priorityTitles: priorityTitles.slice(0, 8),
    eventTitles: eventTitles.slice(0, 6),
    askTitles: askTitles.slice(0, 6),
    styleEncoreProseIdPresent: blob.includes(STYLE.prose),
    styleEncoreDatedIdPresent: blob.includes(STYLE.dated),
    staleNextEventAug8: /next event is scheduled for august 8/i.test(blob),
    jobOpportunitiesPresent:
      blob.includes('job opportunities') || blob.includes(STYLE.job),
    employmentTitleInPriorities: priorityTitles.some((t) =>
      /job opportunities|open interviews|career opportunities/i.test(t),
    ),
  };

  // Future-dated Home eligibility sample
  const [futureRow] = await db
    .select()
    .from(contentItems)
    .where(
      and(
        inArray(contentItems.lifecycleStatus, ['upcoming', 'active', 'expiring_soon']),
        sql`${contentItems.eventStartsAt} > NOW() + interval '2 days'`,
        eq(contentItems.creatorValueStatus, 'creator_candidate'),
      ),
    )
    .limit(1);
  if (futureRow) {
    const norm = normalizeInventoryItem(futureRow, 'verify', 'manual');
    out.futureEligibleSample = {
      id: futureRow.id,
      topic: futureRow.topic,
      lifecycle: futureRow.lifecycleStatus,
      homeEligible: evaluateHomeEligibility(norm).eligible,
    };
  }

  // --- Batch 1 canary (no external send) ---
  const [creator] = await db.select({ id: creatorAccounts.id }).from(creatorAccounts).limit(1);
  if (!creator) {
    out.batch1 = { ok: false, error: 'no creator account' };
  } else {
    const b1 = await runEvidenceOrchestration({
      message: `Plato's Closet Overland Park — batch3 post-deploy canary ${Date.now()}
Contact: batch3-verify@platos.example phone 913-555-0144
Address: 123 Main St Overland Park KS`,
      conversationId: randomUUID(),
      creatorId: creator.id,
      draftMode: 'template_only',
    });
    const b1Answer = String(b1.answer ?? '');
    out.batch1 = {
      ok: Boolean(b1?.handled),
      handled: b1.handled,
      keys: Object.keys(b1).slice(0, 16),
      deltaLike:
        /WHAT I DID|Persisted|contact|Created/i.test(b1Answer) || Boolean(b1.responseDelta),
      noSend:
        !/sent email|submitted form|external send/i.test(b1Answer) &&
        !(b1.safeActionsExecuted ?? []).some(
          (a) =>
            (a.type === 'send_email' || a.type === 'submit_form') && a.status === 'executed',
        ),
      mutations: (b1.mutations ?? []).map((m) => m.type).slice(0, 8),
      safeActions: (b1.safeActionsExecuted ?? []).map((a) => `${a.type}:${a.status}`).slice(0, 8),
    };
  }

  // --- Batch 2 employment ---
  const job = await load(STYLE.job);
  out.batch2 = {
    jobExists: Boolean(job),
    jobStatus: job?.creatorValueStatus ?? null,
    jobLifecycle: job?.lifecycleStatus ?? null,
    isEmployment: job
      ? isEmploymentOpportunity({
          title: job.topic,
          category: 'Employment',
          sourceUrl: job.sourceUrl,
          metadata: (job.metadata as Record<string, unknown>) ?? {},
        })
      : null,
    jobHomeEligible: job
      ? evaluateHomeEligibility(normalizeInventoryItem(job, 'Share Intake', 'manual')).eligible
      : null,
  };

  // Counts
  const [expiredCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contentItems)
    .where(eq(contentItems.lifecycleStatus, 'expired'));
  out.expiredEvidenceQueryable = expiredCount?.count ?? 0;

  console.log(JSON.stringify(out, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
