import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeCommandCenter,
  filterPossiblePostTodayCandidates,
} from '../inventory/command-center.js';
import { loadIngestedInventoryItems } from '../inventory/load-ingested.js';
import type { InventoryItem } from '../inventory/normalize.js';
import {
  getCreatorTimezone,
  getLocalCalendarDay,
  localWallTimeToUtc,
} from '../datetime.js';
import { startOfLocalDayKey } from '../creator-agent/temporal-state.js';
import {
  commandCenterTimelySurvivesSqlWindow,
  creatorTimezonePostTodayDayWindow,
  loadPostTodayVoiceInventoryCandidates,
  postTodayVoiceSqlDayWindows,
  processLocalPostTodayDayWindow,
  timestampInAnyVoiceDayWindow,
} from './load-post-today-voice-candidates.js';
import { shapeWhatShouldKelliePostVoice } from './what-should-kellie-post.js';

const CHICAGO = 'America/Chicago';

function chicagoWall(ymd: string, clock: string, nowHint?: Date): string {
  const utc = localWallTimeToUtc(ymd, clock, CHICAGO);
  assert.ok(utc, `localWallTimeToUtc failed for ${ymd} ${clock}`);
  // Sanity: wall day matches
  if (nowHint) {
    assert.equal(getLocalCalendarDay(utc, CHICAGO), ymd);
  }
  return utc.toISOString();
}

function baseItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: '00000000-0000-4000-8000-000000000301',
    title: 'Crossroads painting workshop',
    summary: 'Hands-on luxury workshop',
    sourceName: 'Visit KC',
    sourceType: 'visitkc',
    category: 'workshop',
    state: 'planned',
    eventDate: null,
    eventEndDate: null,
    discoveredAt: null,
    createdAt: null,
    updatedAt: new Date().toISOString(),
    venue: 'Crossroads Arts District',
    businessName: 'Studio Luxe',
    neighborhood: 'Crossroads',
    address: null,
    locationName: 'Crossroads Arts District',
    locationStatus: 'resolved',
    formattedAddress: 'Kansas City, MO',
    locationLat: 39.09,
    locationLng: -94.58,
    googlePlaceId: 'x',
    googleMapsUrl: 'https://maps.google.com/?q=x',
    locationWebsiteUrl: null,
    locationConfidence: 0.9,
    locationSource: 'google',
    locationVerifiedAt: null,
    locationResolutionError: null,
    sourceUrl: 'https://example.com/workshop',
    ingest: null,
    flags: {
      sponsorFriendly: false,
      luxury: true,
      dining: false,
      dateNight: false,
      estateSale: false,
      businessOpening: true,
      freeEvent: false,
      celebrityCharity: false,
      sports: false,
      reddit: false,
      worldCup: false,
      shopping: true,
      retail: true,
      vendorMarket: false,
      collector: false,
    },
    badges: [],
    audienceScore: 8,
    whyItMatters: 'Grand opening painting workshop — strong shopping film opportunity today.',
    metadata: {},
    relevanceScore: '5',
    urgencyScore: '4',
    coverageFormat: 'field_visit',
    suggestedCoverageFormat: null,
    firsthandVisited: false,
    creatorValueStatus: 'actionable',
    lifecycleStatus: 'active',
    ...overrides,
  } as InventoryItem;
}

function postTodayIds(items: InventoryItem[], now: Date): string[] {
  return computeCommandCenter(items, { now, limit: 4 }).sections.postToday.items.map((c) => c.id);
}

function optimizedPostTodayIds(items: InventoryItem[], now: Date): string[] {
  const narrowed = filterPossiblePostTodayCandidates(items, now);
  return computeCommandCenter(narrowed, {
    now,
    limit: 4,
    sections: ['postToday'],
  }).sections.postToday.items.map((c) => c.id);
}

function assertParity(items: InventoryItem[], now: Date, label: string) {
  const oldIds = postTodayIds(items, now);
  const optIds = optimizedPostTodayIds(items, now);
  assert.deepEqual(optIds, oldIds, `${label}: postToday IDs/order`);
  for (const item of filterPossiblePostTodayCandidates(items, now)) {
    assert.equal(
      commandCenterTimelySurvivesSqlWindow(item, now, CHICAGO),
      true,
      `${label}: SQL must keep timely ${item.id}`,
    );
  }
}

describe('what-should-kellie-post timezone / non-empty parity', () => {
  const timezone = getCreatorTimezone();

  it('documents timezone authority and SQL window union', () => {
    assert.equal(timezone, CHICAGO);
    const now = new Date('2026-08-24T17:00:00.000Z');
    const windows = postTodayVoiceSqlDayWindows(now, CHICAGO);
    assert.equal(windows.length, 2);
    assert.equal(windows[0]!.label, 'process_local');
    assert.equal(windows[1]!.label, 'creator_timezone');
    // On a Chicago process (this CI/host), windows should coincide.
    if (Intl.DateTimeFormat().resolvedOptions().timeZone === CHICAGO) {
      assert.equal(windows[0]!.dayStart.toISOString(), windows[1]!.dayStart.toISOString());
    }
  });

  it('1 VALID TIMED ITEM — NORMAL DAY (daytime Chicago)', () => {
    const now = localWallTimeToUtc('2026-08-24', '14:00:00', CHICAGO)!;
    const item = baseItem({
      id: '00000000-0000-4000-8000-000000000311',
      title: 'Daytime Crossroads workshop',
      eventDate: chicagoWall('2026-08-24', '16:00:00'),
      discoveredAt: chicagoWall('2026-08-24', '09:00:00'),
      createdAt: chicagoWall('2026-08-24', '09:00:00'),
      audienceScore: 9,
    });
    assertParity([item], now, 'daytime');
    assert.deepEqual(postTodayIds([item], now), [item.id]);
  });

  it('2 UTC / CHICAGO DAY CROSSING near UTC midnight', () => {
    // 2026-08-25 01:30 UTC = Aug 24 20:30 CDT — still Chicago Aug 24.
    const now = new Date('2026-08-25T01:30:00.000Z');
    assert.equal(getLocalCalendarDay(now, CHICAGO), '2026-08-24');
    assert.equal(now.toISOString().slice(0, 10), '2026-08-25'); // UTC day differs

    const item = baseItem({
      id: '00000000-0000-4000-8000-000000000312',
      title: 'Evening workshop still Chicago today',
      eventDate: chicagoWall('2026-08-24', '20:00:00'),
      discoveredAt: chicagoWall('2026-08-24', '10:00:00'),
      createdAt: chicagoWall('2026-08-24', '10:00:00'),
    });
    assertParity([item], now, 'utc-crossing');
    assert.ok(commandCenterTimelySurvivesSqlWindow(item, now, CHICAGO));
  });

  it('3 JUST AFTER CHICAGO MIDNIGHT', () => {
    const now = localWallTimeToUtc('2026-08-24', '00:05:00', CHICAGO)!;
    const item = baseItem({
      id: '00000000-0000-4000-8000-000000000313',
      title: 'Just after midnight discovery',
      eventDate: chicagoWall('2026-08-24', '18:00:00'),
      discoveredAt: chicagoWall('2026-08-24', '00:02:00'),
      createdAt: chicagoWall('2026-08-24', '00:02:00'),
    });
    assertParity([item], now, 'after-midnight');
  });

  it('4 JUST BEFORE CHICAGO MIDNIGHT', () => {
    const now = localWallTimeToUtc('2026-08-24', '23:59:00', CHICAGO)!;
    const item = baseItem({
      id: '00000000-0000-4000-8000-000000000314',
      title: 'Late evening workshop',
      eventDate: chicagoWall('2026-08-24', '23:30:00'),
      discoveredAt: chicagoWall('2026-08-24', '12:00:00'),
      createdAt: chicagoWall('2026-08-24', '12:00:00'),
    });
    assertParity([item], now, 'before-midnight');
  });

  it('5 SERVER TIMEZONE DIFFERENCE — SQL union keeps process-local timely rows', () => {
    // Simulate "process thinks UTC day" vs creator Chicago without mutating process.env.TZ:
    // construct windows explicitly and prove a UTC-today / Chicago-yesterday edge is kept by UNION.
    const now = new Date('2026-08-25T02:00:00.000Z'); // Aug 24 21:00 CDT
    const processWindow = processLocalPostTodayDayWindow(now);
    const creatorWindow = creatorTimezonePostTodayDayWindow(now, CHICAGO);

    // Instant that is on process-local calendar day of `now` (whatever host TZ is).
    const processTodayIso = new Date(
      processWindow.dayStart.getTime() + 60 * 60 * 1000,
    ).toISOString();
    assert.equal(
      timestampInAnyVoiceDayWindow(processTodayIso, now, 'discovery', CHICAGO),
      true,
      'process-local today instant must match union',
    );

    // Instant on creator Chicago today even if it falls outside a UTC-only day window.
    const chicagoTodayIso = chicagoWall(getLocalCalendarDay(now, CHICAGO), '01:00:00');
    assert.equal(
      timestampInAnyVoiceDayWindow(chicagoTodayIso, now, 'discovery', CHICAGO),
      true,
      'creator-local today instant must match union',
    );

    // Prove creator window uses startOfLocalDayKey, not Date process midnight alone.
    assert.equal(
      creatorWindow.dayStart.toISOString(),
      startOfLocalDayKey(getLocalCalendarDay(now, CHICAGO), CHICAGO).toISOString(),
    );
  });

  it('6 DATE-ONLY EVENT on creator-local today', () => {
    const now = localWallTimeToUtc('2026-08-24', '15:00:00', CHICAGO)!;
    // UTC midnight date-only stamp for Chicago today.
    const dateOnly = '2026-08-24T00:00:00.000Z';
    const item = baseItem({
      id: '00000000-0000-4000-8000-000000000316',
      title: 'Date-only estate sale day',
      eventDate: dateOnly,
      discoveredAt: chicagoWall('2026-08-24', '08:00:00'),
      createdAt: chicagoWall('2026-08-24', '08:00:00'),
      flags: {
        ...baseItem().flags,
        estateSale: true,
        businessOpening: false,
      },
      whyItMatters: 'Estate sale opening — strong shopping film opportunity today.',
    });
    assertParity([item], now, 'date-only');
  });

  it('7 TIMED EVENT WHOSE UTC DAY IS TOMORROW (evening Chicago)', () => {
    const now = localWallTimeToUtc('2026-08-24', '18:00:00', CHICAGO)!;
    // 8pm CDT = 01:00 UTC next calendar day
    const eventIso = chicagoWall('2026-08-24', '20:00:00');
    assert.equal(eventIso.slice(0, 10), '2026-08-25');
    assert.equal(getLocalCalendarDay(new Date(eventIso), CHICAGO), '2026-08-24');
    const item = baseItem({
      id: '00000000-0000-4000-8000-000000000317',
      title: 'Evening workshop UTC tomorrow',
      eventDate: eventIso,
      discoveredAt: chicagoWall('2026-08-24', '11:00:00'),
      createdAt: chicagoWall('2026-08-24', '11:00:00'),
    });
    assertParity([item], now, 'evening-utc-tomorrow');
  });

  it('8 FUTURE WITHIN AUTHORITATIVE WINDOW (tomorrow event + audience)', () => {
    const now = localWallTimeToUtc('2026-08-24', '12:00:00', CHICAGO)!;
    const item = baseItem({
      id: '00000000-0000-4000-8000-000000000318',
      title: 'Tomorrow boutique opening',
      eventDate: chicagoWall('2026-08-25', '17:00:00'),
      discoveredAt: chicagoWall('2026-08-23', '10:00:00'), // not discovery-today
      createdAt: chicagoWall('2026-08-23', '10:00:00'),
      audienceScore: 5,
      whyItMatters: 'Boutique grand opening sale — visual shopping film tomorrow.',
    });
    // isWithinDays(event, 1) + audience>=2 → timely
    assert.ok(filterPossiblePostTodayCandidates([item], now).some((i) => i.id === item.id));
    assert.ok(commandCenterTimelySurvivesSqlWindow(item, now, CHICAGO));
    assertParity([item], now, 'within-window');
  });

  it('9 JUST OUTSIDE WINDOW — final postToday still matches', () => {
    const now = localWallTimeToUtc('2026-08-24', '12:00:00', CHICAGO)!;
    const outside = baseItem({
      id: '00000000-0000-4000-8000-000000000319',
      title: 'Next week market',
      eventDate: chicagoWall('2026-08-28', '17:00:00'),
      discoveredAt: chicagoWall('2026-08-20', '10:00:00'),
      createdAt: chicagoWall('2026-08-20', '10:00:00'),
      audienceScore: 9,
    });
    assert.equal(filterPossiblePostTodayCandidates([outside], now).length, 0);
    assertParity([outside], now, 'outside-window');
    // SQL may keep or reject; must not create a false positive into final postToday.
    assert.deepEqual(postTodayIds([outside], now), []);
  });

  it('10 DISCOVERY-TODAY UNDATED CONTENT', () => {
    const now = localWallTimeToUtc('2026-08-24', '15:00:00', CHICAGO)!;
    const undated = baseItem({
      id: '00000000-0000-4000-8000-000000000320',
      title: 'New boutique pop-up discovered today',
      eventDate: null,
      discoveredAt: chicagoWall('2026-08-24', '10:00:00'),
      createdAt: chicagoWall('2026-08-24', '10:00:00'),
      whyItMatters: 'Boutique opening sale — strong shopping film opportunity today.',
    });
    // Timely via discoveredAt today — authoritative may still reject for other Today reasons.
    assert.ok(filterPossiblePostTodayCandidates([undated], now).some((i) => i.id === undated.id));
    assert.ok(commandCenterTimelySurvivesSqlWindow(undated, now, CHICAGO));
    assertParity([undated], now, 'undated-discovery-today');
  });

  it('11 NON-EMPTY MULTI-CANDIDATE ORDER (3 items)', () => {
    const now = localWallTimeToUtc('2026-08-24', '14:00:00', CHICAGO)!;
    const a = baseItem({
      id: '00000000-0000-4000-8000-000000000321',
      title: 'Alpha luxury workshop',
      audienceScore: 9,
      eventDate: chicagoWall('2026-08-24', '16:00:00'),
      discoveredAt: chicagoWall('2026-08-24', '08:00:00'),
      createdAt: chicagoWall('2026-08-24', '08:00:00'),
      whyItMatters: 'Grand opening painting workshop — strong shopping film opportunity today.',
    });
    const b = baseItem({
      id: '00000000-0000-4000-8000-000000000322',
      title: 'Beta boutique pop-up',
      audienceScore: 6,
      eventDate: chicagoWall('2026-08-24', '17:00:00'),
      discoveredAt: chicagoWall('2026-08-24', '09:00:00'),
      createdAt: chicagoWall('2026-08-24', '09:00:00'),
      businessName: 'Beta Boutique',
      whyItMatters: 'Boutique opening sale — solid shopping film tonight.',
    });
    const c = baseItem({
      id: '00000000-0000-4000-8000-000000000323',
      title: 'Gamma thrift haul',
      audienceScore: 4,
      eventDate: chicagoWall('2026-08-24', '18:00:00'),
      discoveredAt: chicagoWall('2026-08-24', '10:00:00'),
      createdAt: chicagoWall('2026-08-24', '10:00:00'),
      businessName: 'Gamma Vintage',
      whyItMatters: 'Vintage market opening — visual discovery pick today.',
    });
    const items = [c, a, b]; // shuffled input
    const oldIds = postTodayIds(items, now);
    const optIds = optimizedPostTodayIds(items, now);
    assert.ok(oldIds.length >= 3, `expected >=3 postToday, got ${oldIds.length}: ${oldIds}`);
    assert.deepEqual(optIds, oldIds, 'multi-candidate order');
    assert.deepEqual(
      shapeWhatShouldKelliePostVoice(filterPossiblePostTodayCandidates(items, now), now).items.map(
        (i) => i.contentItemId,
      ),
      shapeWhatShouldKelliePostVoice(items, now).items.map((i) => i.contentItemId),
    );
  });

  it('12 CURRENT LIVE ZERO CONTROL', async () => {
    const now = new Date();
    const full = await loadIngestedInventoryItems();
    const oldIds = postTodayIds(full, now);
    const opt = await loadPostTodayVoiceInventoryCandidates(now);
    const optIds = computeCommandCenter(opt, {
      now,
      limit: 4,
      sections: ['postToday'],
    }).sections.postToday.items.map((c) => c.id);
    assert.deepEqual(optIds, oldIds);
    if (oldIds.length === 0) {
      assert.equal(optIds.length, 0);
    }
  });
});
