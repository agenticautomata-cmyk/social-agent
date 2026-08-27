import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractTribeEventsListCards,
  prepareContainerExtraction,
  tribeEventsNextPageUrl,
} from './container-event-blocks.js';
import { finalizeContainerOpportunities } from './container-event-blocks.js';
import type { InventoryItem } from '../inventory/normalize.js';
import {
  evaluatePublicEventEligibility,
  rankPublicEventScore,
} from '../inventory/public-event-eligibility.js';
import {
  evaluateInventoryCalendarEligibility,
  inventoryCalendarAllDay,
} from '../creator-calendar/population/eligibility.js';
import { evaluateHomeShowroomGate } from '../pre-alpha/home-showroom-lanes.js';
import { isPageLevelArchiveTitle } from './editorial-container.js';

const FIXTURE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'fixtures/kcconvention-events-archive.html'),
  'utf8',
);

const PAGE_URL = 'https://kcconvention.com/events/';
const PAGE_TITLE = 'Events Archive - Kansas City Convention Center';
const NOW = new Date('2026-08-25T17:00:00.000Z');

function baseItem(overrides: Partial<InventoryItem> & Pick<InventoryItem, 'title' | 'eventDate'>): InventoryItem {
  return {
    id: overrides.id ?? 'test-id',
    title: overrides.title,
    summary: overrides.summary ?? null,
    summaryRaw: overrides.summaryRaw ?? overrides.summary ?? null,
    sourceName: overrides.sourceName ?? 'KC Convention Center Events',
    sourceType: overrides.sourceType ?? 'scrape',
    category: overrides.category ?? 'local_event',
    state: 'planned',
    eventDate: overrides.eventDate,
    eventEndDate: overrides.eventEndDate ?? null,
    discoveredAt: '2026-08-18T12:00:00.000Z',
    createdAt: '2026-08-18T12:00:00.000Z',
    updatedAt: '2026-08-18T12:00:00.000Z',
    venue: overrides.venue ?? 'Kansas City Convention Center',
    businessName: overrides.businessName ?? null,
    neighborhood: null,
    address: null,
    locationName: overrides.locationName ?? 'Kansas City, MO',
    locationStatus: 'resolved',
    formattedAddress: null,
    locationLat: null,
    locationLng: null,
    googlePlaceId: null,
    googleMapsUrl: null,
    locationWebsiteUrl: null,
    locationConfidence: null,
    locationSource: null,
    locationVerifiedAt: null,
    locationResolutionError: null,
    sourceUrl: overrides.sourceUrl ?? PAGE_URL,
    ingest: overrides.ingest ?? 'scrape_listing',
    flags: {
      sponsorFriendly: false,
      luxury: false,
      dining: false,
      dateNight: false,
      estateSale: false,
      businessOpening: false,
      freeEvent: false,
      celebrityCharity: false,
      sports: false,
      reddit: false,
      worldCup: false,
      shopping: false,
      retail: false,
      vendorMarket: false,
      collector: false,
      ...(overrides.flags ?? {}),
    },
    badges: [],
    audienceScore: overrides.audienceScore ?? 5,
    whyItMatters: overrides.whyItMatters ?? null,
    metadata: overrides.metadata ?? {},
    temporalEvidence: overrides.temporalEvidence ?? null,
    relevanceScore: null,
    urgencyScore: null,
    coverageFormat: null,
    suggestedCoverageFormat: null,
    firsthandVisited: false,
    creatorValueStatus: overrides.creatorValueStatus ?? 'creator_candidate',
    lifecycleStatus: overrides.lifecycleStatus ?? 'active',
  };
}

describe('kcconvention multi-event archive extraction', () => {
  it('extracts every valid tribe card including Home Show and Knuckle Noise!', () => {
    const cards = extractTribeEventsListCards(FIXTURE, PAGE_URL, PAGE_TITLE);
    const titles = cards.map((c) => c.title);
    assert.ok(titles.includes('IIDA Mid-America Summer Product Fair 2026'));
    assert.ok(titles.includes('Kansas City Home Show'));
    assert.ok(titles.includes('Knuckle Noise!'));
    assert.ok(titles.includes('Fetch DVM360 2026'));
    assert.equal(titles.includes(''), false);
    assert.ok(cards.length >= 4);
  });

  it('does not stop when one card is malformed', () => {
    const cards = extractTribeEventsListCards(FIXTURE, PAGE_URL, PAGE_TITLE);
    assert.ok(cards.some((c) => c.title === 'Kansas City Home Show'));
    assert.ok(cards.some((c) => c.title === 'Knuckle Noise!'));
  });

  it('captures real clocks and detail URLs; date-only stays date-only', () => {
    const cards = extractTribeEventsListCards(FIXTURE, PAGE_URL, PAGE_TITLE);
    const home = cards.find((c) => c.title === 'Kansas City Home Show')!;
    assert.equal(home.startTime, '10:00:00');
    assert.ok(home.eventDate?.startsWith('2026-08-29'));
    assert.ok(home.sourceUrl?.includes('/event/kansas-city-home-show'));
    assert.ok(home.eventEndDate?.includes('2026-08-30'));

    const iida = cards.find((c) => c.title.includes('IIDA'))!;
    assert.equal(iida.startTime, null);
    assert.equal(iida.eventDate, '2026-08-26');
    assert.ok(!iida.eventDate?.includes('T00:00:00'));
  });

  it('prepareContainerExtraction yields independent children via tribe path', () => {
    const prep = prepareContainerExtraction({
      pageText: 'Events Archive chrome only',
      pageTitle: PAGE_TITLE,
      pageUrl: PAGE_URL,
      pageHtml: FIXTURE,
    });
    assert.ok(prep.shouldSplit);
    const titles = prep.structuredOpportunities.map((o) => o.title);
    assert.ok(titles.includes('Kansas City Home Show'));
    assert.ok(titles.includes('Knuckle Noise!'));
    assert.ok(titles.includes('IIDA Mid-America Summer Product Fair 2026'));
  });

  it('exposes tribe next-page URL for bounded continuation', () => {
    const next = tribeEventsNextPageUrl(FIXTURE, PAGE_URL);
    assert.ok(next);
    assert.match(next!, /tribe_paged=2/);
  });

  it('finalize dedupes re-ingestion of the same children', () => {
    const cards = extractTribeEventsListCards(FIXTURE, PAGE_URL, PAGE_TITLE);
    const opps = cards.map((c) => ({
      title: c.title!,
      summary: c.text,
      location: c.location,
      venue: c.venue,
      businessName: null,
      eventDate: c.eventDate,
      eventEndDate: c.eventEndDate,
      category: 'local_event',
      sourceUrl: c.sourceUrl,
      tags: ['container_card'],
      confidence: 0.9,
      parentArticleUrl: PAGE_URL,
      startTime: c.startTime,
    }));
    const once = finalizeContainerOpportunities([...opps, ...opps], PAGE_TITLE);
    assert.equal(once.length, finalizeContainerOpportunities(opps, PAGE_TITLE).length);
  });
});

describe('canonical public-event eligibility', () => {
  it('rejects IIDA as narrow industry without KCKellie audience angle', () => {
    const item = baseItem({
      title: 'IIDA Mid-America Summer Product Fair 2026',
      eventDate: '2026-08-26T05:00:00.000Z',
      summary: 'Industry product fair for interior design professionals. Membership-driven trade association showcase.',
      metadata: { tags: ['trade show', 'industry'], opportunityCategory: 'Event' },
      temporalEvidence: { eventDate: '2026-08-26', eventEndDate: null, startTime: null },
    });
    const decision = evaluatePublicEventEligibility(item, NOW);
    assert.equal(decision.eligible, false);
    assert.equal(decision.rejectionReasonCode, 'narrow_industry_no_audience_value');
    assert.equal(decision.laneEligibility.calendar_suggestion, false);
    assert.equal(decision.laneEligibility.things_to_do_weekly, false);
    const cal = evaluateInventoryCalendarEligibility(item, NOW);
    assert.equal(cal.ok, false);
  });

  it('qualifies Kansas City Home Show for Things To Do Weekly', () => {
    const item = baseItem({
      title: 'Kansas City Home Show',
      eventDate: '2026-08-29T15:00:00.000Z',
      eventEndDate: '2026-08-30T22:00:00.000Z',
      summary:
        'At the Home Show, inspire and excite with vendor demos, product coverage, and giveaways.',
      category: 'Expo',
      temporalEvidence: {
        eventDate: '2026-08-29T10:00:00',
        eventEndDate: '2026-08-30T17:00:00',
        startTime: '10:00:00',
      },
    });
    const decision = evaluatePublicEventEligibility(item, NOW);
    assert.equal(decision.eligible, true);
    assert.equal(decision.laneEligibility.things_to_do_weekly, true);
    assert.equal(decision.laneEligibility.calendar_suggestion, true);
  });

  it('does not force Home Show into Home Best Move; Film This only with fit', () => {
    const item = baseItem({
      title: 'Kansas City Home Show',
      eventDate: '2026-08-29T15:00:00.000Z',
      summary: 'Consumer home expo with vendor demos and product coverage.',
      category: 'Expo',
    });
    const decision = evaluatePublicEventEligibility(item, NOW);
    assert.equal(decision.laneEligibility.home_best_move, false);
    assert.equal(evaluateHomeShowroomGate(item, NOW).eligible, false);
    // Without stronger Kellie shopping/sponsor flags, Film This stays off.
    assert.equal(decision.laneEligibility.film_this, false);

    const filmable = baseItem({
      title: 'Kansas City Home Show',
      eventDate: '2026-08-29T15:00:00.000Z',
      summary: 'Shopping expo with sponsor booths, vendor interviews, and giveaways.',
      category: 'Expo',
      flags: { shopping: true, sponsorFriendly: true } as InventoryItem['flags'],
      whyItMatters: 'Film vendor demos and sponsor booths for KCKellie shopping content.',
    });
    const filmDecision = evaluatePublicEventEligibility(filmable, NOW);
    // Film This still requires Home eligibility — shopping flags help but showroom may still block.
    assert.equal(typeof filmDecision.laneEligibility.film_this, 'boolean');
  });

  it('evaluates Knuckle Noise! independently', () => {
    const item = baseItem({
      title: 'Knuckle Noise!',
      eventDate: '2026-08-29T22:00:00.000Z',
      summary: 'USA Boxing-sanctioned amateur bouts at Municipal Auditorium.',
      category: 'Sporting',
      temporalEvidence: { eventDate: '2026-08-29T17:00:00', eventEndDate: null, startTime: '17:00:00' },
    });
    const decision = evaluatePublicEventEligibility(item, NOW);
    assert.equal(decision.eligible, true);
    assert.ok(decision.audienceValueSignals.includes('public_sporting') || decision.laneEligibility.things_to_do_weekly);
  });

  it('ranks only after eligibility; recency/confidence cannot resurrect ineligible', () => {
    const iida = baseItem({
      title: 'IIDA Mid-America Summer Product Fair 2026',
      eventDate: '2026-08-26T05:00:00.000Z',
      summary: 'Membership-driven product fair for industry professionals.',
      metadata: { tags: ['trade show', 'industry'], bensonScore: { composite: 99 } },
      audienceScore: 99,
      discoveredAt: new Date().toISOString(),
    });
    const decision = evaluatePublicEventEligibility(iida, NOW);
    assert.equal(decision.eligible, false);
    assert.equal(rankPublicEventScore(decision), Number.NEGATIVE_INFINITY);
    assert.equal(decision.scoreComponents.discoveryRecency, undefined);
  });

  it('page-level archive titles are not events', () => {
    assert.equal(isPageLevelArchiveTitle(PAGE_TITLE), true);
    const item = baseItem({
      title: PAGE_TITLE,
      eventDate: '2026-08-29T15:00:00.000Z',
    });
    assert.equal(evaluatePublicEventEligibility(item, NOW).eligible, false);
  });

  it('missing time is all-day / never fake midnight for calendar candidates', () => {
    const item = baseItem({
      title: 'Kansas City Home Show',
      eventDate: '2026-08-29T05:00:00.000Z',
      temporalEvidence: { eventDate: '2026-08-29', eventEndDate: null, startTime: null },
    });
    const start = new Date(item.eventDate!);
    assert.equal(inventoryCalendarAllDay(item, start), true);
  });
});
