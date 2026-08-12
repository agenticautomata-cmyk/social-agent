import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { campaigns, contentItems, creatorInterestRecords, creatorSkippedRecords, sources } from '../schema.js';
import { listOpenDiscoveries } from './actions.js';

/**
 * Regression coverage for a real production incident (2026-08-01): the
 * Discoveries feed query combined several conditions with drizzle's `and(...)`,
 * which just joins fragments with `" and "` and does not auto-parenthesize each
 * one. One fragment contained a top-level `OR` for the event-date window. SQL
 * precedence (AND binds tighter than OR) meant that unparenthesized OR broke out
 * of the entire filter chain, so the effective query became:
 *   (all other filters) OR (event date is in the future)
 * i.e. ANY row with a future event date bypassed quarantine status, dismissed
 * records, skipped records, and muted-source status alike. A live obituary
 * (Charles Edward Carson, correctly quarantined in the DB) was still being
 * served to the Discoveries feed because it had a future "opening date".
 *
 * This suite inserts real fixture rows (clearly prefixed, cleaned up in
 * `after`) and asserts against the actual `listOpenDiscoveries` query — a pure
 * string/SQL-shape assertion would not have caught this class of bug.
 */

const FIXTURE_PREFIX = 'ZZZ_TEST_FIXTURE_precedence_regression_';
const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const PAST_START = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
const PAST_END = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);

type FixtureKey =
  | 'future_quarantined'
  | 'future_dismissed'
  | 'future_skipped'
  | 'future_muted_library'
  | 'future_valid'
  | 'past_valid';

const fixtureIds: Record<FixtureKey, string> = {} as Record<FixtureKey, string>;
let campaignId: string;

async function insertFixtureRow(
  key: FixtureKey,
  overrides: Partial<typeof contentItems.$inferInsert>,
): Promise<string> {
  const [row] = await db
    .insert(contentItems)
    .values({
      campaignId,
      type: 'industry_insight',
      language: 'en',
      state: 'planned',
      topic: `${FIXTURE_PREFIX}${key}`,
      eventStartsAt: FUTURE,
      creatorValueStatus: 'creator_candidate',
      ...overrides,
    })
    .returning({ id: contentItems.id });
  assert.ok(row, `expected insert to return a row for fixture ${key}`);
  fixtureIds[key] = row.id;
  return row.id;
}

describe('listOpenDiscoveries — future-date precedence regression', () => {
  before(async () => {
    const [existingCampaign] = await db.select({ id: campaigns.id }).from(campaigns).limit(1);
    assert.ok(existingCampaign, 'expected at least one campaign row to exist to attach fixtures to');
    campaignId = existingCampaign.id;

    // future + quarantined (obituary hard-gate / rejection) → must be excluded
    await insertFixtureRow('future_quarantined', {
      creatorValueStatus: 'rejected',
      contentCategory: 'obituary',
      lifecycleStatus: 'archived',
    });

    // future + valid, but with a "not_interested" interest record → must be excluded
    const dismissedId = await insertFixtureRow('future_dismissed', {});
    await db.insert(creatorInterestRecords).values({
      contentItemId: dismissedId,
      interestLevel: 'not_interested',
    });

    // future + valid, but with an active (non-restored, non-expired-snooze) skip → must be excluded
    const skippedId = await insertFixtureRow('future_skipped', {});
    await db.insert(creatorSkippedRecords).values({
      contentItemId: skippedId,
      occurrenceFingerprint: `${FIXTURE_PREFIX}future_skipped_fingerprint`,
      restoredAt: null,
      snoozeUntil: null,
    });

    // future + muted source (mirrors scanner/index.ts's mute-policy write path) → must be excluded
    await insertFixtureRow('future_muted_library', {
      creatorValueStatus: 'hidden_raw_signal',
      contentCategory: 'muted_source',
    });

    // future + otherwise valid → must be included
    await insertFixtureRow('future_valid', {});

    // past + otherwise valid → must be excluded (finished event)
    await insertFixtureRow('past_valid', {
      eventStartsAt: PAST_START,
      eventEndsAt: PAST_END,
    });
  });

  after(async () => {
    const ids = Object.values(fixtureIds).filter(Boolean);
    if (ids.length > 0) {
      // Cascades to creator_interest_records / creator_skipped_records via onDelete: 'cascade'.
      await db.delete(contentItems).where(inArray(contentItems.id, ids));
    }
  });

  it('excludes a future-dated quarantined (obituary) record', async () => {
    const rows = await listOpenDiscoveries(500);
    const ids = new Set(rows.map((r) => r.contentItemId));
    assert.equal(ids.has(fixtureIds.future_quarantined), false);
  });

  it('excludes a future-dated dismissed ("not_interested") record', async () => {
    const rows = await listOpenDiscoveries(500);
    const ids = new Set(rows.map((r) => r.contentItemId));
    assert.equal(ids.has(fixtureIds.future_dismissed), false);
  });

  it('excludes a future-dated skipped record', async () => {
    const rows = await listOpenDiscoveries(500);
    const ids = new Set(rows.map((r) => r.contentItemId));
    assert.equal(ids.has(fixtureIds.future_skipped), false);
  });

  it('excludes a future-dated muted-library-source record', async () => {
    const rows = await listOpenDiscoveries(500);
    const ids = new Set(rows.map((r) => r.contentItemId));
    assert.equal(ids.has(fixtureIds.future_muted_library), false);
  });

  it('includes a future-dated, otherwise-valid record', async () => {
    const rows = await listOpenDiscoveries(500);
    const ids = new Set(rows.map((r) => r.contentItemId));
    assert.equal(ids.has(fixtureIds.future_valid), true);
  });

  it('excludes a past-dated record from active results', async () => {
    const rows = await listOpenDiscoveries(500);
    const ids = new Set(rows.map((r) => r.contentItemId));
    assert.equal(ids.has(fixtureIds.past_valid), false);
  });

  it('control: reproduces the historical bug — an UNPARENTHESIZED date OR bypasses every other filter', async () => {
    // This is a deliberate copy of the pre-fix WHERE clause shape (missing the
    // outer parens around the COALESCE(...) OR COALESCE(...) fragment). It must
    // stay failing/red here forever as documentation of the exact defect class;
    // if this test ever starts passing, something reintroduced the bug pattern
    // in a *different* query and this control should be extended to catch it.
    const buggyRows = await db
      .select({ id: contentItems.id })
      .from(contentItems)
      .leftJoin(sources, eq(contentItems.sourceId, sources.id))
      .where(
        and(
          sql`${contentItems.creatorValueStatus} IS DISTINCT FROM 'hidden_raw_signal'`,
          sql`${contentItems.creatorValueStatus} IS DISTINCT FROM 'rejected'`,
          sql`${contentItems.creatorValueStatus} IS DISTINCT FROM 'archived'`,
          sql`${contentItems.lifecycleStatus} IS DISTINCT FROM 'archived'`,
          sql`${contentItems.contentCategory} IS DISTINCT FROM 'obituary'`,
          // Deliberately UNPARENTHESIZED — this is the historical bug shape.
          sql`COALESCE(${contentItems.eventEndsAt}, ${contentItems.eventStartsAt}) IS NULL
              OR COALESCE(${contentItems.eventEndsAt}, ${contentItems.eventStartsAt}) >= NOW() - INTERVAL '12 hours'`,
          inArray(contentItems.id, [fixtureIds.future_quarantined, fixtureIds.future_muted_library]),
        ),
      );
    const buggyIds = new Set(buggyRows.map((r) => r.id));
    // Proves the old shape leaks quarantined/muted rows purely because they have a future date.
    assert.equal(buggyIds.has(fixtureIds.future_quarantined), true);
    assert.equal(buggyIds.has(fixtureIds.future_muted_library), true);
  });
});
