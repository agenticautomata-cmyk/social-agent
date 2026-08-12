import { and, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems } from '../schema.js';
import { computeLifecycleStatus } from '../creator-agent/lifecycle.js';
import { evaluateTemporalState } from '../creator-agent/temporal-state.js';
import {
  hasStaleCurrentnessClaim,
  sanitizeStaleTemporalProse,
} from '../creator-agent/stale-temporal-prose.js';
import { evaluateHomeEligibility } from '../inventory/home-eligibility.js';
import { normalizeInventoryItem } from '../inventory/normalize.js';
import { computeOperationalHomeData } from '../pre-alpha/operational-home.js';

async function main() {
  const now = new Date();
  const remaining = await db
    .select({
      id: contentItems.id,
      topic: contentItems.topic,
      lifecycleStatus: contentItems.lifecycleStatus,
      eventStartsAt: contentItems.eventStartsAt,
      eventEndsAt: contentItems.eventEndsAt,
    })
    .from(contentItems)
    .where(
      and(
        inArray(contentItems.lifecycleStatus, ['upcoming', 'active', 'expiring_soon']),
        or(isNotNull(contentItems.eventStartsAt), isNotNull(contentItems.eventEndsAt)),
        sql`COALESCE(${contentItems.eventEndsAt}, ${contentItems.eventStartsAt}) < NOW()`,
      ),
    )
    .limit(20);

  const styleIds = [
    '51738b24-5a79-4448-ae92-73f1217faaab',
    'd1101683-c88b-4221-a1e3-ccfebb0063fd',
  ];
  const fixtures = [];
  for (const id of styleIds) {
    const [row] = await db.select().from(contentItems).where(eq(contentItems.id, id)).limit(1);
    if (!row) continue;
    const normalized = normalizeInventoryItem(row, 'smoke', 'manual');
    fixtures.push({
      id: row.id,
      topic: row.topic,
      lifecycleStatus: row.lifecycleStatus,
      rowStillExists: true,
      temporal: evaluateTemporalState({
        startsAt: row.eventStartsAt,
        endsAt: row.eventEndsAt,
        now,
      }).state,
      staleClaim: hasStaleCurrentnessClaim(row.script, {
        startsAt: row.eventStartsAt,
        endsAt: row.eventEndsAt,
        now,
      }),
      sanitizedHasNextEvent: /\bnext event\b/i.test(
        sanitizeStaleTemporalProse({
          text: row.script,
          startsAt: row.eventStartsAt,
          endsAt: row.eventEndsAt,
          now,
        }).text,
      ),
      homeEligible: evaluateHomeEligibility(normalized).eligible,
    });
  }

  const [futureCurrent] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contentItems)
    .where(
      and(
        inArray(contentItems.lifecycleStatus, ['upcoming', 'active', 'expiring_soon']),
        or(isNotNull(contentItems.eventStartsAt), isNotNull(contentItems.eventEndsAt)),
        sql`COALESCE(${contentItems.eventEndsAt}, ${contentItems.eventStartsAt}) >= NOW()`,
      ),
    );

  const [expiredStillPresent] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contentItems)
    .where(eq(contentItems.lifecycleStatus, 'expired'));

  let homeOk = false;
  let homeError: string | null = null;
  let topTitles: string[] = [];
  let styleInHome = false;
  try {
    const home = await computeOperationalHomeData();
    homeOk = true;
    const blob = JSON.stringify(home).toLowerCase();
    styleInHome =
      blob.includes('51738b24-5a79-4448-ae92-73f1217faaab') ||
      blob.includes('d1101683-c88b-4221-a1e3-ccfebb0063fd') ||
      /next event is scheduled for august 8/i.test(blob);
    topTitles = [
      ...(home.topOpportunities ?? []).map((c) => c.title),
      ...(home.dailyBriefing?.topEvents ?? []).map((c) => c.title),
    ].slice(0, 8);
  } catch (err) {
    homeError = err instanceof Error ? err.message : String(err);
  }

  console.log(
    JSON.stringify(
      {
        now: now.toISOString(),
        remainingPastDatedOperatorCurrent: remaining.map((r) => ({
          ...r,
          temporal: evaluateTemporalState({
            startsAt: r.eventStartsAt,
            endsAt: r.eventEndsAt,
            now,
          }).state,
          computed: computeLifecycleStatus(
            {
              title: r.topic,
              eventStartsAt: r.eventStartsAt,
              eventEndsAt: r.eventEndsAt,
            },
            now,
          ),
        })),
        fixtures,
        futureDatedOperatorCurrent: futureCurrent?.count ?? 0,
        expiredRowsStillQueryable: expiredStillPresent?.count ?? 0,
        homeOk,
        homeError,
        styleEncoreOrStaleNextEventInHome: styleInHome,
        topTitles,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
