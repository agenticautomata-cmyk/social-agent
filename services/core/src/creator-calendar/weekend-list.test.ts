import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildWeekendList,
  cityFromItem,
  conciseDescription,
  formatFlyerBrief,
  itemBelongsOnCurrentWeekendList,
  startTimeLabel,
  venueFromItem,
  weekendOccurrenceDayKeys,
  type WeekendListSource,
} from './weekend-list.js';
import { getChicagoWeekendDayKeys } from './weekend-things-to-do.js';
import type { InventoryTemporalEvidence } from '../inventory/normalize.js';

function source(overrides: Partial<WeekendListSource>): WeekendListSource {
  return {
    id: overrides.id ?? '00000000-0000-4000-8000-000000000401',
    title: overrides.title ?? '816 Day',
    eventDate: overrides.eventDate ?? '2026-08-14T23:00:00.000Z', // Fri Aug 14, 6:00 PM CDT
    eventEndDate: overrides.eventEndDate ?? null,
    venue: overrides.venue ?? 'Kansas City Power & Light District',
    businessName: overrides.businessName ?? null,
    locationName: overrides.locationName ?? 'Kansas City, MO',
    neighborhood: overrides.neighborhood ?? null,
    address: overrides.address ?? null,
    formattedAddress: overrides.formattedAddress ?? 'Kansas City Power & Light District, Kansas City, MO',
    summary: overrides.summary ?? 'Cultural/community event celebrating 816 Day.',
    whyItMatters: overrides.whyItMatters ?? 'Strong fit for the weekend roundup.',
    category: overrides.category ?? 'community_event',
    sourceName: overrides.sourceName ?? '816 Day',
    sourceUrl: overrides.sourceUrl ?? 'https://www.816day.org/',
    locationStatus: overrides.locationStatus ?? 'resolved',
    locationVerifiedAt: overrides.locationVerifiedAt ?? '2026-08-12T12:00:00.000Z',
    notes: overrides.notes ?? null,
    temporalEvidence: overrides.temporalEvidence,
  };
}

const NOW = new Date('2026-08-13T17:00:00.000Z'); // Thursday afternoon CT
const TZ = 'America/Chicago';

function evidence(partial: Partial<InventoryTemporalEvidence>): InventoryTemporalEvidence {
  return {
    eventDate: partial.eventDate ?? null,
    eventEndDate: partial.eventEndDate ?? null,
    startTime: partial.startTime ?? null,
  };
}

describe('operator Weekend List', () => {
  it('current window is Fri Aug 14 through Sun Aug 16', () => {
    const w = getChicagoWeekendDayKeys(NOW);
    assert.equal(w.friday, '2026-08-14');
    assert.equal(w.sunday, '2026-08-16');
  });

  it('Monday after the weekend advances to the next Fri–Sun window', () => {
    const monday = getChicagoWeekendDayKeys(new Date('2026-08-17T17:00:00.000Z'));
    assert.equal(monday.friday, '2026-08-21');
    assert.equal(monday.sunday, '2026-08-23');
  });

  it('groups 816 Day on Friday and Hike on Saturday in chronological order', () => {
    const hike = source({
      id: '00000000-0000-4000-8000-000000000402',
      title: 'Hike with a Naturalist',
      eventDate: '2026-08-15T15:30:00.000Z', // Sat 10:30 AM CDT
      venue: 'Lakeside Nature Center',
      formattedAddress: '4701 E Gregory Blvd, Kansas City, MO 64132',
      locationName: 'Kansas City, MO',
      summary: 'Guided weekend hike.',
      sourceUrl: 'https://kcparks.org/hike-with-a-naturalist/',
      category: 'outdoor',
    });
    const list = buildWeekendList([source({}), hike], NOW);
    assert.equal(list.selectedCount, 2);
    assert.equal(list.days[0]!.heading, 'FRIDAY');
    assert.equal(list.days[0]!.items[0]!.title, '816 Day');
    assert.equal(list.days[1]!.items[0]!.title, 'Hike with a Naturalist');
    assert.equal(list.days[1]!.items[0]!.startTimeLabel, '10:30 AM');
    assert.match(list.flyerBrief, /FRIDAY[\s\S]*816 Day[\s\S]*SATURDAY[\s\S]*Hike with a Naturalist/);
    assert.match(list.flyerBrief, /https:\/\/www\.816day\.org\//);
    assert.match(list.flyerBrief, /https:\/\/kcparks\.org\/hike-with-a-naturalist\//);
    assert.doesNotMatch(list.flyerBrief, /strong fit/i);
    assert.doesNotMatch(list.flyerBrief, /00000000-0000-4000/);
    assert.doesNotMatch(list.flyerBrief, /composite/i);
  });

  it('does not put a September event into this weekend and does not duplicate re-adds', () => {
    const sept = source({
      id: '00000000-0000-4000-8000-000000000403',
      title: 'Time Travelers Vintage Expo',
      eventDate: '2026-09-26T17:00:00.000Z',
      sourceUrl: 'https://kciexpo.com/event/time-travelers-vintage-expo-4/',
    });
    const twice = [source({}), source({}), sept];
    const list = buildWeekendList(twice, NOW);
    assert.equal(list.selectedCount, 1);
    assert.equal(list.outsideWindowCount, 1);
    assert.equal(list.days.flatMap((d) => d.items).filter((i) => i.title === '816 Day').length, 1);
  });

  it('represents a multi-day event once without duplicate selections', () => {
    const fest = source({
      id: '00000000-0000-4000-8000-000000000404',
      title: 'Plaza Art Fair',
      eventDate: '2026-08-14T17:00:00.000Z',
      eventEndDate: '2026-08-16T22:00:00.000Z',
      venue: 'Country Club Plaza',
      sourceUrl: 'https://plazaartfair.com/',
    });
    const list = buildWeekendList([fest], NOW);
    assert.equal(list.selectedCount, 1);
    assert.equal(list.days[0]!.items.length, 1);
    assert.equal(list.days[1]!.items.length, 0);
    assert.equal(list.days[2]!.items.length, 0);
    assert.match(list.days[0]!.items[0]!.spanNote ?? '', /Saturday/i);
  });

  it('keeps past-weekend selections available without deleting them', () => {
    const lastWeek = source({
      id: '00000000-0000-4000-8000-000000000405',
      title: 'Last Saturday market',
      eventDate: '2026-08-08T17:00:00.000Z',
      sourceUrl: 'https://example.com/last-week',
    });
    const list = buildWeekendList([source({}), lastWeek], NOW);
    assert.equal(list.selectedCount, 1);
    assert.equal(list.pastWeekends.length, 1);
    assert.equal(list.pastWeekends[0]!.friday, '2026-08-07');
    assert.equal(list.pastWeekends[0]!.selectedCount, 1);
  });

  it('empty state names the current weekend and does not auto-fill', () => {
    const list = buildWeekendList([], NOW);
    assert.equal(list.selectedCount, 0);
    assert.match(list.emptyMessage, /No picks yet for Aug 14–16/);
    assert.match(list.emptyMessage, /Add to weekend list/);
    assert.equal(list.days.every((d) => d.items.length === 0), true);
  });

  it('treats Power & Light as venue and Kansas City, MO as city', () => {
    const item = source({
      venue: null,
      locationName: 'Kansas City Power & Light District',
      formattedAddress: '50 E 13th St, Kansas City, MO 64106',
    });
    assert.equal(cityFromItem(item), 'Kansas City, MO');
    assert.equal(venueFromItem(item), 'Kansas City Power & Light District');
  });

  it('omits midnight UTC timestamps as a start time and strips research metadata', () => {
    assert.equal(startTimeLabel('2026-08-15T00:00:00.000Z', 'America/Chicago'), null);
    assert.equal(startTimeLabel('2026-08-15T15:30:00.000Z', 'America/Chicago'), '10:30 AM');
    assert.equal(
      conciseDescription('Guided hike at the nature center.\nWeb research: ignore this appendix'),
      'Guided hike at the nature center.',
    );
    assert.equal(cityFromItem(source({})), 'Kansas City, MO');
  });

  it('Woman of Influence date-only: encoded Aug 28 day, no time label', () => {
    const temporalEvidence = evidence({ eventDate: '2026-08-28', startTime: null });
    const days = weekendOccurrenceDayKeys(
      '2026-08-28T00:00:00.000Z',
      null,
      TZ,
      temporalEvidence,
    );
    assert.deepEqual(days, ['2026-08-28']);
    assert.equal(startTimeLabel('2026-08-28T00:00:00.000Z', TZ, temporalEvidence), null);
    const list = buildWeekendList(
      [
        source({
          title: 'Woman of Influence',
          eventDate: '2026-08-28T00:00:00.000Z',
          temporalEvidence,
        }),
      ],
      new Date('2026-08-27T17:00:00.000Z'),
    );
    assert.equal(list.selectedCount, 1);
    assert.equal(list.days[0]!.dateKey, '2026-08-28');
    assert.equal(list.days[0]!.items[0]!.startTimeLabel, null);
  });

  it('Big 12 Session 2 timed T00Z: Mar 9 + 6:00 PM', () => {
    const temporalEvidence = evidence({
      eventDate: '2027-03-09T18:00:00',
      startTime: '18:00:00',
    });
    assert.deepEqual(
      weekendOccurrenceDayKeys('2027-03-10T00:00:00.000Z', null, TZ, temporalEvidence),
      ['2027-03-09'],
    );
    assert.equal(startTimeLabel('2027-03-10T00:00:00.000Z', TZ, temporalEvidence), '6:00 PM');
  });

  it('Big 12 Session 4 timed T00Z: Mar 10 + 6:00 PM', () => {
    const temporalEvidence = evidence({
      eventDate: '2027-03-10T18:00:00',
      startTime: '18:00:00',
    });
    assert.deepEqual(
      weekendOccurrenceDayKeys('2027-03-11T00:00:00.000Z', null, TZ, temporalEvidence),
      ['2027-03-10'],
    );
    assert.equal(startTimeLabel('2027-03-11T00:00:00.000Z', TZ, temporalEvidence), '6:00 PM');
  });

  it('Come From Away timed T00Z: Sep 1 + 7:00 PM', () => {
    const temporalEvidence = evidence({
      eventDate: '2026-09-01T19:00:00',
      startTime: '19:00:00',
    });
    assert.deepEqual(
      weekendOccurrenceDayKeys('2026-09-02T00:00:00.000Z', null, TZ, temporalEvidence),
      ['2026-09-01'],
    );
    assert.equal(startTimeLabel('2026-09-02T00:00:00.000Z', TZ, temporalEvidence), '7:00 PM');
  });

  it('ordinary non-midnight timed event keeps existing day + time behavior', () => {
    assert.deepEqual(
      weekendOccurrenceDayKeys('2026-08-15T15:30:00.000Z', null, TZ, null),
      ['2026-08-15'],
    );
    assert.equal(startTimeLabel('2026-08-15T15:30:00.000Z', TZ, null), '10:30 AM');
  });

  it('date-only multi-day start/end retain encoded intended days', () => {
    const temporalEvidence = evidence({
      eventDate: '2026-08-28',
      eventEndDate: '2026-08-30',
      startTime: null,
    });
    assert.deepEqual(
      weekendOccurrenceDayKeys(
        '2026-08-28T00:00:00.000Z',
        '2026-08-30T00:00:00.000Z',
        TZ,
        temporalEvidence,
      ),
      ['2026-08-28', '2026-08-29', '2026-08-30'],
    );
  });

  it('missing temporal evidence keeps conservative UTC-midnight / Chicago fallback', () => {
    assert.deepEqual(
      weekendOccurrenceDayKeys('2026-08-28T00:00:00.000Z', null, TZ, null),
      ['2026-08-28'],
    );
    assert.equal(startTimeLabel('2026-08-28T00:00:00.000Z', TZ, null), null);
  });

  it('itemBelongsOnCurrentWeekendList uses evidence-aware day keys', () => {
    const dateOnly = evidence({ eventDate: '2026-08-28', startTime: null });
    // Aug 28 2026 is Friday — belongs on that weekend when now is Thu Aug 27.
    assert.equal(
      itemBelongsOnCurrentWeekendList(
        '2026-08-28T00:00:00.000Z',
        null,
        new Date('2026-08-27T17:00:00.000Z'),
        dateOnly,
      ),
      true,
    );
    // Blind Chicago would have used Aug 27 (Thursday) and failed this weekend window.
    assert.equal(
      itemBelongsOnCurrentWeekendList(
        '2026-08-28T00:00:00.000Z',
        null,
        new Date('2026-08-27T17:00:00.000Z'),
        null,
      ),
      true,
    );
    const timed = evidence({ eventDate: '2027-03-09T18:00:00', startTime: '18:00:00' });
    // Mar 9 2027 is Tuesday — not in Fri–Sun; membership false.
    assert.equal(
      itemBelongsOnCurrentWeekendList(
        '2027-03-10T00:00:00.000Z',
        null,
        new Date('2027-03-12T17:00:00.000Z'),
        timed,
      ),
      false,
    );
  });

  it('full list includes address, source name, notes, and verification without DB jargon', () => {
    const list = buildWeekendList(
      [
        source({
          notes: 'Kellie liked this last year',
          formattedAddress: 'Power & Light District, Kansas City, MO',
        }),
      ],
      NOW,
    );
    assert.match(list.fullList, /Power & Light District, Kansas City, MO/);
    assert.match(list.fullList, /Source: 816 Day — https:\/\/www\.816day\.org\//);
    assert.match(list.fullList, /Note: Kellie liked this last year/);
    assert.doesNotMatch(list.fullList, /planned|skipped|creatorValueStatus|lifecycle/i);
    const flyer = formatFlyerBrief(list);
    assert.match(flyer, /THINGS TO DO THIS WEEKEND IN KC/);
  });
});
