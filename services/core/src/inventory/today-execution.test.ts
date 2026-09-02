import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PlannerItemRecord } from '../content-planner/items.js';
import {
  BEST_MOVE_EMPTY,
  EMPTY_TODAY_MESSAGE,
  MAX_BEST_MOVES,
  MAX_PRIORITIES,
  classifyPlannerPlacement,
  computeTodayExecution,
  dateOnlyInZone,
  isTodayListName,
  type TodayCalendarRow,
  type TodayExecutionInput,
  type TodayInventoryRecord,
  type TodayResearchRow,
  type TodayWatchlistRow,
} from './today-execution.js';

const NOW = new Date('2026-09-02T17:00:00.000Z');
const TODAY = dateOnlyInZone(NOW);

function planner(overrides: Partial<PlannerItemRecord> & { contentItemId: string }): PlannerItemRecord {
  return {
    listName: 'Saved For Later',
    notes: null,
    priority: 2,
    plannedDate: null,
    dueDate: null,
    contentAngle: null,
    status: 'saved',
    followUpAt: null,
    draftCaption: null,
    postedUrl: null,
    postedAt: null,
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
    ...overrides,
  };
}

function inventory(overrides: Partial<TodayInventoryRecord> & { id: string; title: string }): TodayInventoryRecord {
  return {
    sourceName: 'Visit KC',
    venue: null,
    locationName: 'Kansas City',
    sourceUrl: `https://example.com/${overrides.id}`,
    summary: 'A local event.',
    eventDate: '2026-09-10',
    eventEndDate: null,
    category: 'event',
    metadata: {},
    businessName: null,
    ...overrides,
  };
}

function input(partial: Partial<TodayExecutionInput> = {}): TodayExecutionInput {
  return {
    now: NOW,
    planner: [],
    inventory: new Map(),
    research: [],
    calendar: [],
    watchlist: [],
    ...partial,
  };
}

function withInventory(
  records: TodayInventoryRecord[],
  rest: Partial<TodayExecutionInput> = {},
): TodayExecutionInput {
  return input({
    inventory: new Map(records.map((row) => [row.id, row])),
    ...rest,
  });
}

describe('today execution contract', () => {
  it('treats Today list names case-insensitively as planned', () => {
    assert.equal(isTodayListName('Today'), true);
    assert.equal(isTodayListName('today'), true);
    assert.equal(isTodayListName('Saved For Later'), false);
  });

  it('shows an explicitly planned item on Today’s plan', () => {
    const item = inventory({ id: 'plan-1', title: 'Film Union Station', eventDate: '2026-09-02' });
    const workspace = computeTodayExecution(
      withInventory([item], {
        planner: [planner({ contentItemId: 'plan-1', listName: 'Today', status: 'planned', plannedDate: TODAY })],
      }),
    );
    assert.equal(workspace.plan.length, 1);
    assert.equal(workspace.plan[0]?.title, 'Film Union Station');
    assert.equal(workspace.plan[0]?.placement, 'planned');
    assert.deepEqual(workspace.plan[0]?.actions, [
      'open',
      'mark_done',
      'reschedule',
      'remove_from_today',
      'view_details',
    ]);
  });

  it('does not treat a saved-only item as planned', () => {
    const item = inventory({ id: 'saved-1', title: 'Plaza Art Fair', eventDate: '2026-09-20' });
    const workspace = computeTodayExecution(
      withInventory([item], {
        planner: [planner({ contentItemId: 'saved-1', listName: 'Saved For Later', status: 'saved' })],
      }),
    );
    assert.equal(workspace.plan.length, 0);
    assert.equal(workspace.plan.some((row) => row.id === 'saved-1'), false);
  });

  it('keeps a discovery-only item out of Today', () => {
    const item = inventory({ id: 'discover-1', title: 'New food-truck pop-up', eventDate: '2026-09-12' });
    const workspace = computeTodayExecution(withInventory([item]));
    assert.equal(workspace.plan.length, 0);
    assert.equal(workspace.review.some((row) => row.contentItemId === 'discover-1'), false);
    assert.equal(workspace.comingUp.some((row) => row.contentItemId === 'discover-1'), false);
    assert.equal(workspace.bestMove, null);
  });

  it('hides a general pitch unless it was explicitly placed on Today', () => {
    const hidden = inventory({
      id: 'pitch-1',
      title: 'Start sponsor pitch: Savers',
      category: 'thrift_store',
    });
    const placed = inventory({
      id: 'pitch-2',
      title: 'Start sponsor pitch: Local bakery',
      category: 'dining',
    });
    const without = computeTodayExecution(withInventory([hidden]));
    assert.equal(without.plan.length, 0);
    assert.equal(without.priorities.some((row) => /pitch|savers/i.test(row.label)), false);
    assert.equal(without.bestMove, null);

    const withPlan = computeTodayExecution(
      withInventory([placed], {
        planner: [planner({ contentItemId: 'pitch-2', listName: 'Today', status: 'planned', plannedDate: TODAY })],
      }),
    );
    assert.equal(withPlan.plan.some((row) => row.contentItemId === 'pitch-2'), true);
  });

  it('hides an outreach queue unless it was explicitly placed on Today', () => {
    const outreach = inventory({
      id: 'outreach-1',
      title: 'Approve outreach email (96 waiting)',
      category: 'sponsor',
    });
    const hidden = computeTodayExecution(withInventory([outreach]));
    assert.equal(hidden.priorities.some((row) => /outreach|96 waiting/i.test(row.label)), false);
    assert.equal(hidden.bestMove, null);

    const placed = computeTodayExecution(
      withInventory([outreach], {
        planner: [
          planner({
            contentItemId: 'outreach-1',
            listName: 'Today',
            status: 'planned',
            plannedDate: TODAY,
            notes: 'Approve the one email I drafted',
          }),
        ],
      }),
    );
    assert.equal(placed.plan.some((row) => row.contentItemId === 'outreach-1'), true);
  });

  it('orders due-today work ahead of other planned work', () => {
    const later = inventory({ id: 'later', title: 'Weekend shoot', eventDate: '2026-09-06' });
    const due = inventory({ id: 'due', title: 'Follow the florist', eventDate: '2026-09-04' });
    const workspace = computeTodayExecution(
      withInventory([later, due], {
        planner: [
          planner({
            contentItemId: 'later',
            listName: 'Today',
            status: 'planned',
            plannedDate: TODAY,
          }),
          planner({
            contentItemId: 'due',
            listName: 'Today',
            status: 'planned',
            plannedDate: TODAY,
            followUpAt: '2026-09-02T15:00:00.000Z',
            notes: 'Follow up',
          }),
        ],
      }),
    );
    assert.equal(workspace.plan[0]?.contentItemId, 'due');
    assert.equal(workspace.plan[0]?.dueToday, true);
    assert.equal(workspace.plan[1]?.contentItemId, 'later');
  });

  it('lets a user commitment outrank a Benson suggestion in priorities', () => {
    const planned = inventory({ id: 'mine', title: 'Edit the market reel', eventDate: TODAY });
    const savedSoon = inventory({ id: 'soon', title: 'Hyde Park Farmers Market', eventDate: '2026-09-03' });
    const workspace = computeTodayExecution(
      withInventory([planned, savedSoon], {
        planner: [
          planner({ contentItemId: 'mine', listName: 'Today', status: 'planned', plannedDate: TODAY }),
          planner({ contentItemId: 'soon', listName: 'Saved For Later', status: 'saved' }),
        ],
      }),
    );
    assert.match(workspace.priorities[0]?.label ?? '', /edit the market reel/i);
    assert.doesNotMatch(workspace.priorities[0]?.label ?? '', /^Best move/i);
  });

  it('returns at most one Best move', () => {
    const a = inventory({ id: 'a', title: 'First Friday', eventDate: '2026-09-03' });
    const b = inventory({ id: 'b', title: 'Second Saturday', eventDate: '2026-09-04' });
    const workspace = computeTodayExecution(
      withInventory([a, b], {
        planner: [
          planner({ contentItemId: 'a', status: 'saved', listName: 'Saved For Later' }),
          planner({ contentItemId: 'b', status: 'saved', listName: 'Saved For Later' }),
        ],
      }),
    );
    const moves = workspace.bestMove ? 1 : 0;
    assert.ok(moves <= MAX_BEST_MOVES);
  });

  it('caps priorities at three and does not invent filler', () => {
    const only = inventory({ id: 'only', title: 'One real task', eventDate: TODAY });
    const workspace = computeTodayExecution(
      withInventory([only], {
        planner: [planner({ contentItemId: 'only', listName: 'Today', status: 'planned', plannedDate: TODAY })],
      }),
    );
    assert.ok(workspace.priorities.length <= MAX_PRIORITIES);
    assert.equal(workspace.priorities.length, 1);
    assert.equal(workspace.priorities.some((row) => /editorial briefing|inventory/i.test(row.label)), false);
  });

  it('shows completed research under Ready for review', () => {
    const item = inventory({ id: 'hummingbird', title: 'Hummingbird Festival' });
    const research: TodayResearchRow = {
      contentItemId: 'hummingbird',
      interestId: 'int-1',
      jobId: 'job-1',
      requestedAssistance: ['research'],
      status: 'complete',
      enrichment: {
        canonicalName: { value: 'Hummingbird Festival' },
        website: { value: 'https://www.ci.independence.mo.us/hummingbird' },
        researchSummary: 'City of Independence lists dates and the official park location.',
      },
    };
    const workspace = computeTodayExecution(withInventory([item], { research: [research] }));
    assert.equal(workspace.review.length, 1);
    assert.equal(workspace.review[0]?.title, 'Hummingbird Festival');
    assert.doesNotMatch(workspace.review[0]?.title ?? '', /_\[|\]\(/);
    assert.match(workspace.review[0]?.why ?? '', /City of Independence|ready/i);
    assert.ok(workspace.review[0]?.verifiedFacts.some((fact) => /official/i.test(fact)));
    assert.deepEqual(workspace.review[0]?.actions, ['review', 'add_to_today', 'add_to_calendar', 'dismiss']);
    assert.equal(workspace.pendingResearch.length, 0);
  });

  it('uses the display-title contract for completed SantaCaliGon research', () => {
    const item = inventory({
      id: 'santa-raw',
      title: '_[SantaCaliGon Days]( takes over Historic Independence Square for its 54th year',
    });
    const workspace = computeTodayExecution(
      withInventory([item], {
        research: [
          {
            contentItemId: 'santa-raw',
            interestId: 'int-santa',
            jobId: 'job-santa',
            requestedAssistance: ['research'],
            status: 'needs_verification',
            enrichment: {
              canonicalName: {
                value: '_[SantaCaliGon Days]( takes over Historic Independence Square for its 54th year',
              },
              website: { value: 'https://www.santacaligon.com/' },
            },
          },
        ],
      }),
    );
    assert.equal(workspace.review[0]?.title, 'SantaCaliGon Days');
    assert.doesNotMatch(workspace.review[0]?.title ?? '', /HERE|_\[|\]\(/);
  });

  it('does not put save-for-later enrichment in Ready for review', () => {
    const item = inventory({ id: 'saved-research', title: 'Neighborhood guide' });
    const workspace = computeTodayExecution(
      withInventory([item], {
        research: [
          {
            contentItemId: 'saved-research',
            interestId: 'int-saved',
            jobId: 'job-saved',
            requestedAssistance: ['save_for_later'],
            status: 'complete',
            enrichment: { canonicalName: { value: 'Neighborhood guide' } },
          },
        ],
      }),
    );
    assert.equal(workspace.review.length, 0);
  });

  it('keeps pending research in an honest in-progress state', () => {
    const item = inventory({ id: 'santa', title: 'SantaCaliGon Days' });
    const research: TodayResearchRow = {
      contentItemId: 'santa',
      interestId: 'int-2',
      jobId: 'job-2',
      requestedAssistance: ['research'],
      status: 'researching',
    };
    const workspace = computeTodayExecution(withInventory([item], { research: [research] }));
    assert.equal(workspace.review.length, 0);
    assert.equal(workspace.pendingResearch.length, 1);
    assert.match(workspace.pendingResearch[0]?.why ?? '', /in progress/i);
    assert.doesNotMatch(workspace.pendingResearch[0]?.why ?? '', /research started/i);
  });

  it('removes reviewed research from the queue', () => {
    const item = inventory({ id: 'done-research', title: 'Hummingbird Festival' });
    const research: TodayResearchRow = {
      contentItemId: 'done-research',
      interestId: 'int-3',
      jobId: 'job-3',
      requestedAssistance: ['research'],
      status: 'complete',
      decision: 'add_to_today',
      reviewedAt: '2026-09-02T16:00:00.000Z',
      enrichment: { canonicalName: { value: 'Hummingbird Festival' } },
    };
    const workspace = computeTodayExecution(withInventory([item], { research: [research] }));
    assert.equal(workspace.review.length, 0);
  });

  it('shows a seven-day look-ahead for selected or dated commitments', () => {
    const saved = inventory({ id: 'fair', title: 'Plaza Art Fair', eventDate: '2026-09-06' });
    const calendar: TodayCalendarRow = {
      id: 'cal-1',
      contentItemId: 'renfest',
      title: 'Kansas City Renaissance Festival',
      startAt: '2026-09-07T17:00:00.000Z',
      location: 'Bonner Springs',
      planningStatus: 'confirmed',
      selected: true,
      sourceUrl: 'https://example.com/renfest',
    };
    const suggestion: TodayCalendarRow = {
      id: 'cal-sug',
      contentItemId: 'dump',
      title: 'Random suggested concert',
      startAt: '2026-09-05T17:00:00.000Z',
      planningStatus: 'suggested',
      selected: false,
    };
    const workspace = computeTodayExecution(
      withInventory([saved, inventory({ id: 'renfest', title: 'Kansas City Renaissance Festival' })], {
        planner: [planner({ contentItemId: 'fair', status: 'saved', listName: 'Saved For Later' })],
        calendar: [calendar, suggestion],
      }),
    );
    assert.equal(workspace.comingUp.some((row) => row.title.includes('Plaza Art Fair')), true);
    assert.equal(workspace.comingUp.some((row) => row.title.includes('Renaissance Festival')), true);
    assert.equal(workspace.comingUp.some((row) => /random suggested/i.test(row.title)), false);
  });

  it('suppresses expired items', () => {
    const expired = inventory({ id: 'old', title: 'Last month’s market', eventDate: '2026-08-01' });
    const workspace = computeTodayExecution(
      withInventory([expired], {
        planner: [planner({ contentItemId: 'old', listName: 'Today', status: 'planned', plannedDate: '2026-08-01' })],
      }),
    );
    assert.equal(classifyPlannerPlacement(
      planner({ contentItemId: 'old', listName: 'Today', status: 'planned', plannedDate: '2026-08-01' }),
      NOW,
      '2026-08-01',
    ), 'expired');
    assert.equal(workspace.plan.length, 0);
    assert.equal(workspace.comingUp.length, 0);
  });

  it('does not repeat the same opportunity across sections', () => {
    const item = inventory({ id: 'one', title: 'First Fridays', eventDate: '2026-09-03' });
    const workspace = computeTodayExecution(
      withInventory([item], {
        planner: [planner({ contentItemId: 'one', listName: 'Today', status: 'planned', plannedDate: TODAY })],
        calendar: [
          {
            id: 'cal-one',
            contentItemId: 'one',
            title: 'First Fridays',
            startAt: '2026-09-04T17:00:00.000Z',
            planningStatus: 'confirmed',
            selected: true,
          },
        ],
      }),
    );
    const ids = [
      ...workspace.plan.map((row) => row.contentItemId),
      ...workspace.review.map((row) => row.contentItemId),
      workspace.bestMove?.contentItemId,
      ...workspace.comingUp.map((row) => row.contentItemId),
    ].filter(Boolean);
    assert.equal(ids.filter((id) => id === 'one').length, 1);
  });

  it('never surfaces a dirty Hyde Park title', () => {
    const dirty = inventory({
      id: 'hyde',
      title: 'HERE ! Sep 6 Hyde Park Farmers Market',
      eventDate: '2026-09-06',
    });
    const workspace = computeTodayExecution(
      withInventory([dirty], {
        planner: [planner({ contentItemId: 'hyde', status: 'saved', listName: 'Saved For Later' })],
      }),
    );
    const titles = [
      ...workspace.plan.map((row) => row.title),
      ...workspace.review.map((row) => row.title),
      ...workspace.comingUp.map((row) => row.title),
      ...workspace.priorities.map((row) => row.label),
      workspace.bestMove?.title ?? '',
    ].join('\n');
    assert.doesNotMatch(titles, /HERE\s*!/i);
    assert.doesNotMatch(titles, /HERE ! Sep 6/i);
  });

  it('uses one compact empty state with Discover and Calendar actions', () => {
    const workspace = computeTodayExecution(input());
    assert.equal(workspace.empty, true);
    assert.equal(workspace.emptyMessage, EMPTY_TODAY_MESSAGE);
    assert.deepEqual(
      workspace.emptyActions.map((row) => row.label),
      ['Browse Discover', 'View Calendar'],
    );
    assert.equal(workspace.bestMove, null);
    assert.equal(workspace.bestMoveEmpty, BEST_MOVE_EMPTY);
    assert.equal(workspace.plan.length, 0);
    assert.equal(workspace.review.length, 0);
  });

  it('keeps plan actions compact for mobile cards', () => {
    const item = inventory({ id: 'mobile', title: 'Film the farmers market', eventDate: TODAY });
    const workspace = computeTodayExecution(
      withInventory([item], {
        planner: [planner({ contentItemId: 'mobile', listName: 'Today', status: 'planned', plannedDate: TODAY })],
      }),
    );
    assert.ok((workspace.plan[0]?.actions.length ?? 0) <= 5);
    assert.ok(workspace.plan[0]?.actions.includes('mark_done'));
    assert.ok(workspace.plan[0]?.actions.includes('remove_from_today'));
  });

  it('does not require Home briefing, Discover feed, or Watchlist health data', () => {
    const workspace = computeTodayExecution(input());
    assert.equal('videoGrowth' in workspace, false);
    assert.equal('categoryOptions' in workspace, false);
    assert.equal('sections' in workspace, false);
    assert.equal('discoveredToday' in workspace, false);
    const watch: TodayWatchlistRow = {
      id: 'wl-1',
      title: 'Quiet source with no date',
      summary: 'No concrete update',
      sourceUrl: null,
      eventDate: null,
      type: 'other_verified_update',
      currentlyActionable: false,
      confidence: 'low',
      dateStatus: 'uncertain',
      baselineKind: 'historical_baseline',
      evidence: '',
      watchedSource: 'ignored',
    };
    const withWatch = computeTodayExecution(input({ watchlist: [watch] }));
    assert.equal(withWatch.review.length, 0);
  });
});
