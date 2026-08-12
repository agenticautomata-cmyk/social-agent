import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { InventoryItem } from '../inventory/normalize.js';
import { qualifiesFilmThis } from '../pre-alpha/home-showroom-lanes.js';
import {
  eventFallsInChicagoWeekend,
  getChicagoWeekendDayKeys,
  isEligibleThingsToDoWeekend,
  isPoliticalCivicBanquet,
  selectVariedWeekendPicks,
} from './weekend-things-to-do.js';
import { resolveCalendarActionContract } from './calendar-actions.js';
import type { CalendarItemView } from './types.js';
import { validViewSourceUrl } from '../inventory/today-clarity.js';

function baseItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: '00000000-0000-4000-8000-000000000201',
    title: '816 Day | Kansas City',
    summary: 'Citywide KC celebration.',
    sourceName: '816 Day',
    sourceType: 'scrape',
    category: 'community_event',
    state: 'new',
    eventDate: '2026-08-16T17:00:00.000Z', // Sat Aug 15 evening CT-ish depending; set via test now
    eventEndDate: null,
    discoveredAt: '2026-08-12T12:00:00.000Z',
    createdAt: '2026-08-12T12:00:00.000Z',
    updatedAt: '2026-08-12T12:00:00.000Z',
    venue: 'Kansas City',
    businessName: null,
    neighborhood: null,
    address: null,
    locationName: 'Kansas City, MO',
    locationStatus: 'resolved',
    formattedAddress: 'Kansas City, MO',
    locationLat: null,
    locationLng: null,
    googlePlaceId: null,
    googleMapsUrl: null,
    locationWebsiteUrl: null,
    locationConfidence: null,
    locationSource: null,
    locationVerifiedAt: null,
    locationResolutionError: null,
    sourceUrl: 'https://www.816day.org/',
    ingest: 'scrape',
    flags: {
      sponsorFriendly: false,
      luxury: false,
      dining: false,
      dateNight: false,
      estateSale: false,
      businessOpening: false,
      freeEvent: true,
      celebrityCharity: false,
      sports: false,
      reddit: false,
      worldCup: false,
      shopping: false,
      retail: false,
      vendorMarket: false,
      collector: false,
    },
    badges: [],
    audienceScore: 60,
    whyItMatters: 'Citywide KC celebration worth knowing for the weekend roundup.',
    metadata: {},
    relevanceScore: null,
    urgencyScore: null,
    coverageFormat: null,
    suggestedCoverageFormat: null,
    firsthandVisited: false,
    creatorValueStatus: 'relevant',
    lifecycleStatus: 'upcoming',
    ...overrides,
  };
}

function calendarItem(overrides: Partial<CalendarItemView> = {}): CalendarItemView {
  return {
    id: 'cal-1',
    title: 'Lynyrd Skynyrd x Foreigner',
    description: null,
    itemType: 'public_event',
    sourceRecordType: 'content_item',
    sourceRecordId: '00000000-0000-4000-8000-000000000301',
    sourceUrl: 'https://events.extrachill.com/events/lynyrd-skynyrd',
    internalDetailUrl: '/review/inventory?id=00000000-0000-4000-8000-000000000301',
    startAt: '2026-08-15T01:00:00.000Z',
    endAt: null,
    allDay: false,
    timezone: 'America/Chicago',
    location: 'Kansas City',
    status: 'suggested',
    planningStatus: 'suggested',
    creatorAction: null,
    reminderSettings: {},
    notes: null,
    calendarIntent: null,
    verificationState: 'unverified',
    whyIncluded: null,
    confidence: null,
    sync: {
      syncStatus: 'benson_only',
      googleEventId: null,
      autoUpdateEnabled: false,
      updateAvailable: false,
      lastSyncedAt: null,
      lastError: null,
    },
    recommendedAction: null,
    ...overrides,
  };
}

describe('calendar action contract', () => {
  it('suggested item has Confirm plan primary CTA and valid View source', () => {
    const contract = resolveCalendarActionContract(calendarItem());
    assert.equal(contract.statusHeadline, 'Suggested by Benson');
    assert.match(contract.statusDetail ?? '', /Not on your calendar/i);
    assert.equal(contract.primaryKind, 'confirm_plan');
    assert.equal(contract.primaryLabel, 'Confirm plan');
    assert.equal(contract.calendarReady, true);
    assert.ok(validViewSourceUrl(contract.viewSourceUrl));
  });

  it('blocks calendar-ready without provenance', () => {
    const contract = resolveCalendarActionContract(calendarItem({ sourceUrl: null }));
    assert.equal(contract.calendarReady, false);
    assert.equal(contract.viewSourceUrl, null);
    assert.equal(contract.primaryKind, 'details');
  });
});

describe('Things To Do This Weekend', () => {
  it('weekend window is Fri–Sun Chicago keys', () => {
    // Wednesday Aug 12, 2026 18:00 UTC ≈ afternoon Central
    const now = new Date('2026-08-12T18:00:00.000Z');
    const w = getChicagoWeekendDayKeys(now);
    assert.equal(w.friday, '2026-08-14');
    assert.equal(w.saturday, '2026-08-15');
    assert.equal(w.sunday, '2026-08-16');
  });

  it('political banquet excluded from general weekend roundup', () => {
    const banquet = baseItem({
      title: 'Forever the Free State: Johnson County Democratic Banquet 2026',
      sourceUrl: 'https://opconventioncenter.com/events/forever-the-free-state',
      venue: 'Overland Park Convention Center',
      eventDate: '2026-08-15T23:00:00.000Z',
    });
    assert.equal(isPoliticalCivicBanquet(banquet), true);
    const now = new Date('2026-08-12T18:00:00.000Z');
    const gate = isEligibleThingsToDoWeekend(banquet, now);
    assert.equal(gate.ok, false);
    assert.equal(gate.reason, 'political_civic');
  });

  it('ordinary concert may qualify Things To Do but not Film This', () => {
    const now = new Date('2026-08-12T18:00:00.000Z');
    const concert = baseItem({
      id: '00000000-0000-4000-8000-000000000302',
      title: 'Lynyrd Skynyrd x Foreigner: Double Trouble Double Vision Tour at Morto',
      venue: 'Cable Dahmer Arena',
      locationName: 'Independence, MO',
      sourceUrl: 'https://events.extrachill.com/events/lynyrd-skynyrd-x-foreigner',
      eventDate: '2026-08-16T01:00:00.000Z',
      flags: {
        ...baseItem().flags,
        freeEvent: false,
        sports: false,
      },
      whyItMatters: 'Major classic-rock concert on the KC calendar.',
      category: 'concert',
    });
    assert.equal(eventFallsInChicagoWeekend(concert.eventDate, null, now), true);
    const gate = isEligibleThingsToDoWeekend(concert, now);
    assert.equal(gate.ok, true, gate.reason);
    assert.equal(qualifiesFilmThis(concert), false);
  });

  it('stale past event excluded', () => {
    const now = new Date('2026-08-12T18:00:00.000Z');
    const stale = baseItem({
      eventDate: '2026-07-01T17:00:00.000Z',
      lifecycleStatus: 'expired',
    });
    const gate = isEligibleThingsToDoWeekend(stale, now);
    assert.equal(gate.ok, false);
  });

  it('variety selection caps entertainment dominance', () => {
    const concerts = Array.from({ length: 8 }, (_, i) =>
      Object.assign(baseItem({ id: `c-${i}`, title: `Concert ${i}` }), {
        bucket: 'entertainment' as const,
      }),
    );
    const festivals = [
      Object.assign(baseItem({ id: 'f-1', title: '816 Day' }), { bucket: 'festival' as const }),
      Object.assign(baseItem({ id: 'f-2', title: 'Food Fest' }), { bucket: 'food_drink' as const }),
    ];
    const picked = selectVariedWeekendPicks([...concerts, ...festivals], 6);
    const entertainment = picked.filter((p) => p.bucket === 'entertainment').length;
    assert.ok(entertainment <= 2);
    assert.ok(picked.some((p) => p.bucket === 'festival'));
  });
});
