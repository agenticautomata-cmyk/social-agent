import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { InventoryItem } from './normalize.js';
import { computeCommandCenter } from './command-center.js';
import {
  buildTodayClarityFields,
  canonicalTodayTitle,
  evaluateSourceEntityConsistency,
  hasConcreteDerivedOpportunity,
  hasSpecificTodayReason,
  isEditorialArticleItem,
  isEligibleThingsToDoToday,
  isEligibleWeekendContent,
  isSeoSearchResultTitle,
  operatorFacingInventorySummary,
  passesTodayEligibility,
  recommendTodayPrimaryAction,
  resolveTodayLane,
  shouldShowMarkCovered,
  validViewSourceUrl,
} from './today-clarity.js';

function baseItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: '00000000-0000-4000-8000-000000000101',
    title: 'Union Station exhibit',
    summary: null,
    sourceName: 'Visit KC',
    sourceType: 'visitkc',
    category: 'event',
    state: 'planned',
    eventDate: '2026-08-15T18:00:00.000Z',
    eventEndDate: null,
    discoveredAt: '2026-08-12T12:00:00.000Z',
    createdAt: '2026-08-12T12:00:00.000Z',
    updatedAt: '2026-08-12T12:00:00.000Z',
    venue: 'Union Station',
    businessName: null,
    neighborhood: 'Downtown',
    address: null,
    locationName: 'Union Station Kansas City',
    locationStatus: 'resolved',
    formattedAddress: '30 W Pershing Rd, Kansas City, MO',
    locationLat: 39.0854,
    locationLng: -94.5859,
    googlePlaceId: 'union-station',
    googleMapsUrl: 'https://maps.google.com/?q=Union+Station',
    locationWebsiteUrl: null,
    locationConfidence: 0.86,
    locationSource: 'google',
    locationVerifiedAt: null,
    locationResolutionError: null,
    sourceUrl: 'https://www.visitkc.com/union-station',
    ingest: null,
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
    audienceScore: 8,
    whyItMatters: 'Free community event — high traffic, lower sponsor fit.',
    metadata: {},
    relevanceScore: '4',
    urgencyScore: '2',
    coverageFormat: null,
    suggestedCoverageFormat: null,
    firsthandVisited: false,
    creatorValueStatus: 'actionable',
    lifecycleStatus: 'active',
    ...overrides,
  } as InventoryItem;
}

/** Exact regression: Legends Live SEO title + Nordstrom Rack + generic shopping angle. */
function legendsNordstromMismatch(): InventoryItem {
  return baseItem({
    id: '00000000-0000-4000-8000-000000000Leg',
    title: 'legends live in kansas city mo 2026/27: tickets, info, reviews, videos and more',
    businessName: 'Nordstrom Rack Legends',
    sourceName: 'deal · nordstrom rack legends',
    category: 'deal',
    flags: {
      ...baseItem().flags,
      shopping: true,
      retail: true,
      freeEvent: false,
    },
    whyItMatters: 'Shopping/retail discovery — deal haul, store opening, or gift-card sponsorship angle.',
    sourceUrl: 'https://example.com/legends-live-seo',
    eventDate: '2026-08-16T18:00:00.000Z',
    audienceScore: 5,
  });
}

const NOW = new Date('2026-08-12T17:00:00.000Z'); // Wed — weekend is Aug 14–16

describe('today clarity — consistency + SEO', () => {
  it('flags SEO/search-result titles', () => {
    assert.equal(
      isSeoSearchResultTitle(
        'legends live in kansas city mo 2026/27: tickets, info, reviews, videos and more',
      ),
      true,
    );
  });

  it('source/title/entity mismatch cannot render (Legends / Nordstrom)', () => {
    const item = legendsNordstromMismatch();
    const consistency = evaluateSourceEntityConsistency(item);
    assert.equal(consistency.ok, false);
    assert.ok(consistency.reasons.length > 0);
    assert.equal(passesTodayEligibility(item, NOW).ok, false);
    assert.equal(isEligibleWeekendContent(item, NOW), false);
  });

  it('SEO title does not override canonical business title when coherent', () => {
    const item = baseItem({
      title: 'Costco Kansas City: tickets, info, reviews, videos and more',
      businessName: 'Costco',
      flags: { ...baseItem().flags, shopping: true, retail: true, freeEvent: false },
      whyItMatters: 'Warehouse haul — concrete Costco filming subject.',
    });
    assert.equal(canonicalTodayTitle(item), 'Costco');
  });

  it('invalid/mismatched source CTA cannot render', () => {
    assert.equal(validViewSourceUrl('not-a-url'), null);
    assert.equal(validViewSourceUrl('https://visitkc.com/x'), 'https://visitkc.com/x');
    const bad = legendsNordstromMismatch();
    const cc = computeCommandCenter([bad], { now: NOW, limit: 6 });
    for (const section of Object.values(cc.sections)) {
      assert.equal(
        section.items.find((c) => /legends live|nordstrom/i.test(c.title + c.whyItMatters)) ?? null,
        null,
      );
    }
  });
});

describe('today clarity — lanes', () => {
  it('ordinary concert does not automatically become Weekend Content', () => {
    const concert = baseItem({
      title: 'Owen Pirch live at The Truman',
      category: 'concert',
      eventDate: '2026-08-15T20:00:00.000Z',
      flags: { ...baseItem().flags, freeEvent: false },
      whyItMatters: 'Local concert listing.',
      businessName: null,
      venue: 'The Truman',
    });
    assert.equal(isEligibleWeekendContent(concert, NOW), false);
  });

  it('ordinary concert may still qualify for Things To Do Weekly', () => {
    const concert = baseItem({
      title: 'Owen Pirch live at The Truman',
      category: 'concert',
      eventDate: '2026-08-15T20:00:00.000Z',
      flags: { ...baseItem().flags, freeEvent: false },
      whyItMatters: 'Local concert listing.',
      venue: 'The Truman',
    });
    assert.equal(isEligibleThingsToDoToday(concert, NOW), true, 'eligible');
    assert.equal(resolveTodayLane(concert, undefined, NOW), 'things_to_do_weekly', 'lane');
  });

  it('general news/source intelligence does not become Today task', () => {
    const news = baseItem({
      title: 'City council debates surveillance cameras',
      sourceName: 'Pitch Weekly',
      category: 'local_news',
      flags: { ...baseItem().flags, freeEvent: false },
      whyItMatters: 'Local politics coverage.',
      eventDate: null,
      creatorValueStatus: 'creator_candidate',
      audienceScore: 3,
    });
    assert.equal(passesTodayEligibility(news, NOW).ok, false);
  });

  it('generic shopping lead without concrete entity/angle is excluded', () => {
    const shopping = baseItem({
      title: 'Weekend deals around KC',
      businessName: null,
      category: 'deal',
      flags: { ...baseItem().flags, shopping: true, freeEvent: false },
      whyItMatters: 'Shopping/retail discovery — deal haul, store opening, or gift-card sponsorship angle.',
      eventDate: '2026-08-15T12:00:00.000Z',
    });
    assert.equal(isEligibleWeekendContent(shopping, NOW), false);
    assert.equal(passesTodayEligibility(shopping, NOW).ok, false);
  });

  it('Weekend Content requires current + filmable + weekend-relevant', () => {
    const good = baseItem({
      title: 'New boutique opening at Country Club Plaza',
      businessName: 'Luxe Collective',
      category: 'boutique_opening',
      eventDate: '2026-08-15T16:00:00.000Z',
      flags: {
        ...baseItem().flags,
        shopping: true,
        retail: true,
        businessOpening: true,
        freeEvent: false,
        sponsorFriendly: true,
      },
      whyItMatters: 'Grand opening — strong shopping film opportunity this weekend.',
      audienceScore: 7,
    });
    assert.equal(isEligibleWeekendContent(good, NOW), true);
    const fields = buildTodayClarityFields(good, 'postWeekend');
    assert.equal(fields.lane, 'weekend_content');
    assert.equal(fields.primaryAction.kind, 'plan_weekend');
    assert.doesNotMatch(fields.whySummary, /worth filming|concrete place to shoot/i);
  });
});

describe('today clarity — editorial article leakage', () => {
  it('article headline alone cannot qualify Today (Drink This Now)', () => {
    const item = baseItem({
      title: 'Drink This Now: Sex Work Is Real Work at Northside Social',
      businessName: 'Northside Social',
      venue: '444 Locust St., Lawrence, KS',
      sourceName: 'The Pitch Food & Drink',
      category: 'dining',
      flags: { ...baseItem().flags, dining: true, freeEvent: false },
      whyItMatters: 'Dining or food opening — timely restaurant/cafe content.',
      summary:
        'Long article body about cocktails and culture. '.repeat(40) +
        '\n\nSubscribe to our newsletter.\nRelated stories\nContinue reading',
      eventDate: '2026-08-15T19:00:00.000Z',
      audienceScore: 7,
    });
    assert.equal(isEditorialArticleItem(item), true);
    assert.equal(hasConcreteDerivedOpportunity(item, NOW), false);
    assert.equal(passesTodayEligibility(item, NOW).ok, false);
    assert.equal(isEligibleWeekendContent(item, NOW), false);
    const cc = computeCommandCenter([item], { now: NOW, limit: 6 });
    const blob = JSON.stringify(cc.sections);
    assert.doesNotMatch(blob, /Drink This Now/i);
    assert.doesNotMatch(blob, /worth filming/i);
  });

  it('In-betweeners editorial headline cannot qualify Today', () => {
    const item = baseItem({
      id: '00000000-0000-4000-8000-000000000ib1',
      title: 'The In-betweeners: Dining out or house party? It can be both',
      businessName: null,
      sourceName: 'The Pitch Food & Drink',
      category: 'dining',
      flags: { ...baseItem().flags, dining: true, dateNight: true, freeEvent: false },
      whyItMatters: 'Worth filming — strong Kellie audience fit with a concrete place to shoot.',
      eventDate: '2026-08-15T18:00:00.000Z',
    });
    assert.equal(isEditorialArticleItem(item), true);
    assert.equal(passesTodayEligibility(item, NOW).ok, false);
    assert.equal(isEligibleWeekendContent(item, NOW), false);
  });

  it('place mention alone cannot qualify Film This / Weekend from an article', () => {
    const item = baseItem({
      title: 'How Jennifer LeBlanc is ushering in Unforked’s next era as a neighborhood spot',
      businessName: 'Unforked',
      sourceName: 'The Pitch Food & Drink',
      category: 'dining',
      flags: { ...baseItem().flags, dining: true, freeEvent: false },
      whyItMatters: 'Dining or food opening — timely restaurant/cafe content.',
      eventDate: '2026-08-15T12:00:00.000Z',
    });
    assert.equal(isEligibleWeekendContent(item, NOW), false);
  });

  it('current concrete derived opportunity can qualify', () => {
    const item = baseItem({
      title: 'Northside Social summer cocktail menu',
      businessName: 'Northside Social',
      sourceName: 'The Pitch Food & Drink',
      category: 'dining',
      flags: { ...baseItem().flags, dining: true, freeEvent: false },
      whyItMatters: 'Northside Social launched a new summer cocktail menu — timely food/drink coverage.',
      eventDate: '2026-08-15T19:00:00.000Z',
      audienceScore: 7,
    });
    assert.equal(isEditorialArticleItem(item), true); // Pitch source
    assert.equal(hasConcreteDerivedOpportunity(item, NOW), true);
    assert.equal(passesTodayEligibility(item, NOW).ok, true);
    assert.equal(isEligibleWeekendContent(item, NOW), true);
    const fields = buildTodayClarityFields(item, 'postWeekend');
    assert.match(fields.whySummary, /summer cocktail menu/i);
    assert.doesNotMatch(fields.whySummary, /worth filming/i);
  });

  it('stale article does not imply current opportunity', () => {
    const item = baseItem({
      title: 'Northside Social summer cocktail menu',
      businessName: 'Northside Social',
      sourceName: 'The Pitch Food & Drink',
      flags: { ...baseItem().flags, dining: true, freeEvent: false },
      whyItMatters: 'Northside Social launched a new summer cocktail menu — timely food/drink coverage.',
      eventDate: '2025-06-01T19:00:00.000Z',
      lifecycleStatus: 'expired',
    });
    assert.equal(hasConcreteDerivedOpportunity(item, NOW), false);
    assert.equal(passesTodayEligibility(item, NOW).ok, false);
  });

  it('generic fallback worth filming cannot qualify', () => {
    const item = baseItem({
      title: 'Local patio hang',
      businessName: 'Some Patio',
      sourceName: 'Manual',
      flags: { ...baseItem().flags, dining: true, freeEvent: false },
      whyItMatters: 'Worth filming — strong Kellie audience fit with a concrete place to shoot.',
      eventDate: '2026-08-15T19:00:00.000Z',
    });
    assert.equal(hasSpecificTodayReason(item), false);
    assert.equal(passesTodayEligibility(item, NOW).ok, false);
  });

  it('Details uses concise Benson summary, not article body', () => {
    const body = ('Paragraph about cocktails and culture. '.repeat(50) + '\n\n').repeat(5);
    const summary = operatorFacingInventorySummary(
      body,
      'Northside Social launched a new summer cocktail menu — timely food/drink coverage.',
    );
    assert.ok(summary.length < 400);
    assert.doesNotMatch(summary, /Paragraph about cocktails and culture\. Paragraph/);
    assert.match(summary, /summer cocktail menu/i);
  });
});

describe('today clarity — actions + UI contract fields', () => {
  it('card has exactly one primary action', () => {
    const item = baseItem({
      title: 'Date night tasting menu',
      businessName: 'The Ravenous',
      flags: { ...baseItem().flags, dining: true, dateNight: true, freeEvent: false },
      eventDate: '2026-08-15T19:00:00.000Z',
      whyItMatters: 'Date-night tasting menu this weekend — timely couples dining coverage.',
    });
    const fields = buildTodayClarityFields(item, 'postWeekend');
    assert.ok(fields.primaryAction.label);
    assert.equal(typeof fields.primaryAction.kind, 'string');
  });

  it('durable item does not show Save', () => {
    const fields = buildTodayClarityFields(baseItem());
    assert.equal(fields.showSave, false);
  });

  it('Mark covered only for real coverage workflow', () => {
    const concert = baseItem({
      title: 'Owen Pirch live',
      category: 'concert',
      eventDate: '2026-08-15T20:00:00.000Z',
    });
    assert.equal(shouldShowMarkCovered(concert, 'things_to_do_weekly'), false);
    const film = baseItem({
      title: 'Boutique opening',
      flags: { ...baseItem().flags, shopping: true, businessOpening: true, freeEvent: false },
      businessName: 'Luxe',
      coverageFormat: 'field_visit',
    });
    assert.equal(shouldShowMarkCovered(film, 'film_this'), true);
  });

  it('no internal Unassigned workflow leakage in clarity fields', () => {
    const fields = buildTodayClarityFields(
      baseItem({ coverageFormat: null, suggestedCoverageFormat: null, title: 'Generic meetup' }),
    );
    assert.notEqual(fields.coverageFormatLabel, 'Unassigned');
    if (fields.coverageFormatLabel) {
      assert.doesNotMatch(fields.coverageFormatLabel, /unassigned/i);
    }
  });

  it('View source appears when valid source exists', () => {
    const fields = buildTodayClarityFields(baseItem());
    assert.equal(fields.viewSourceUrl, 'https://www.visitkc.com/union-station');
  });

  it('stale/expired item cannot appear', () => {
    const stale = baseItem({
      lifecycleStatus: 'expired',
      eventDate: '2026-07-01T18:00:00.000Z',
    });
    assert.equal(passesTodayEligibility(stale, NOW).ok, false);
  });

  it('primary action for weekend is Plan for weekend', () => {
    const action = recommendTodayPrimaryAction(baseItem(), 'weekend_content');
    assert.equal(action.label, 'Plan for weekend');
    assert.equal(action.plannerAction, 'plan_weekend');
  });
});

describe('computeCommandCenter today contracts', () => {
  it('excludes Legends/Nordstrom mismatch from weekend and all sections', () => {
    const cc = computeCommandCenter([legendsNordstromMismatch()], { now: NOW, limit: 6 });
    assert.equal(cc.sections.postWeekend.items.length, 0);
    const blob = JSON.stringify(cc.sections);
    assert.doesNotMatch(blob, /legends live in kansas city/i);
    assert.doesNotMatch(blob, /gift-card sponsorship angle/i);
  });

  it('same logical item is not duplicated across Today sections', () => {
    const good = baseItem({
      id: '00000000-0000-4000-8000-000000000dup',
      title: 'Plaza boutique grand opening',
      businessName: 'Luxe Collective',
      category: 'boutique_opening',
      eventDate: '2026-08-15T16:00:00.000Z',
      discoveredAt: '2026-08-12T10:00:00.000Z',
      createdAt: '2026-08-12T10:00:00.000Z',
      flags: {
        ...baseItem().flags,
        shopping: true,
        retail: true,
        businessOpening: true,
        sponsorFriendly: true,
        freeEvent: false,
      },
      whyItMatters: 'Grand opening — film this weekend.',
      audienceScore: 8,
    });
    const cc = computeCommandCenter([good], { now: NOW, limit: 6 });
    const ids = Object.values(cc.sections).flatMap((s) => s.items.map((i) => i.id));
    assert.equal(ids.length, new Set(ids).size);
  });

  it('weekend cards expose one primary action and hide score dashboard', () => {
    const good = baseItem({
      title: 'Date night at The Ravenous',
      businessName: 'The Ravenous',
      eventDate: '2026-08-15T19:00:00.000Z',
      flags: { ...baseItem().flags, dining: true, dateNight: true, freeEvent: false },
      whyItMatters: 'Date-night tasting menu this weekend — timely couples dining coverage.',
      audienceScore: 8,
    });
    const cc = computeCommandCenter([good], { now: NOW, limit: 6 });
    const weekend = cc.sections.postWeekend.items;
    if (weekend.length > 0) {
      const card = weekend[0]!;
      assert.ok(card.primaryAction);
      assert.equal(card.hideScoreDashboard, true);
      assert.equal(card.showSave, false);
      assert.doesNotMatch(card.whyItMatters, /Unassigned|creator_candidate|ready_to_contact|worth filming/i);
    }
  });

  it('highestConfidence metadata section stays empty on Today', () => {
    const cc = computeCommandCenter([baseItem()], { now: NOW, limit: 6 });
    assert.equal(cc.sections.highestConfidence.items.length, 0);
  });
});
