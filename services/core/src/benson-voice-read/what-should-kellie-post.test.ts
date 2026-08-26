import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import type { InventoryItem } from '../inventory/normalize.js';
import {
  formatWhatShouldKelliePostSpeech,
  shapeWhatShouldKelliePostVoice,
} from './what-should-kellie-post.js';
import { WHAT_SHOULD_KELLIE_POST_EMPTY_SPEECH } from './types.js';

const here = dirname(fileURLToPath(import.meta.url));
const NOW = new Date();
const laterIso = new Date(NOW.getTime() + 4 * 60 * 60 * 1000).toISOString();
const nowIso = NOW.toISOString();

function baseItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: '00000000-0000-4000-8000-000000000201',
    title: 'Bags and Shoes painting workshop',
    summary: 'Hands-on luxury workshop in Crossroads',
    sourceName: 'Visit KC',
    sourceType: 'visitkc',
    category: 'workshop',
    state: 'planned',
    eventDate: laterIso,
    eventEndDate: null,
    discoveredAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
    venue: 'Crossroads Arts District',
    businessName: 'Studio Luxe',
    neighborhood: 'Crossroads',
    address: null,
    locationName: 'Crossroads Arts District',
    locationStatus: 'resolved',
    formattedAddress: 'Kansas City, MO',
    locationLat: 39.09,
    locationLng: -94.58,
    googlePlaceId: 'crossroads-workshop',
    googleMapsUrl: 'https://maps.google.com/?q=Crossroads',
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
    audienceScore: 9,
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

describe('what-should-kellie-post voice read', () => {
  it('returns strongest current filmable/content opportunity from postToday', () => {
    const weaker = baseItem({
      id: '00000000-0000-4000-8000-000000000202',
      title: 'Plaza boutique pop-up',
      audienceScore: 5,
      whyItMatters: 'Boutique opening sale — solid shopping film tonight.',
      neighborhood: 'Plaza',
      venue: 'Country Club Plaza',
      locationName: 'Country Club Plaza',
      businessName: 'Plaza Collective',
    });
    const strongest = baseItem({
      id: '00000000-0000-4000-8000-000000000201',
      title: 'Bags and Shoes painting workshop',
      audienceScore: 9,
    });
    const shaped = shapeWhatShouldKelliePostVoice([weaker, strongest], NOW);
    assert.equal(shaped.operation, 'what_should_kellie_post');
    assert.ok(shaped.count >= 1);
    assert.equal(shaped.items[0]?.title, 'Bags and Shoes painting workshop');
    assert.equal(shaped.items[0]?.homeFilmable, true);
    assert.match(shaped.speech, /Bags and Shoes painting workshop/);
    assert.match(shaped.speech, /strongest post today/i);
    assert.doesNotMatch(shaped.speech, /https?:\/\/|confidence|score/i);
  });

  it('excludes business-only sponsor follow-up from postToday content lane', () => {
    const filmable = baseItem();
    const sponsorOnly = baseItem({
      id: '00000000-0000-4000-8000-000000000203',
      title: 'Send pitch to Midtown Hotel group',
      businessName: 'Midtown Hotel Group',
      category: 'sponsor',
      audienceScore: 10,
      flags: {
        ...baseItem().flags,
        shopping: false,
        retail: false,
        luxury: false,
        businessOpening: false,
        sponsorFriendly: true,
        dining: false,
      },
      whyItMatters: 'Reply to their email and send a sponsor pitch this week.',
      venue: null,
      locationName: null,
      neighborhood: null,
      eventDate: null,
      sourceUrl: 'https://example.com/sponsor',
    });
    const shaped = shapeWhatShouldKelliePostVoice([sponsorOnly, filmable], NOW);
    assert.ok(shaped.items.every((item) => !/sponsor pitch|reply to their email/i.test(item.title)));
    assert.ok(shaped.items.every((item) => !/sponsor pitch|reply to their email/i.test(item.reason)));
    assert.equal(shaped.items[0]?.title, 'Bags and Shoes painting workshop');
  });

  it('excludes stale/expired content', () => {
    const fresh = baseItem();
    const expired = baseItem({
      id: '00000000-0000-4000-8000-000000000204',
      title: 'Last month estate sale',
      lifecycleStatus: 'expired',
      eventDate: new Date(NOW.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString(),
      discoveredAt: new Date(NOW.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(NOW.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString(),
      audienceScore: 10,
      flags: { ...baseItem().flags, estateSale: true, shopping: true, businessOpening: false },
      whyItMatters: 'Estate sale opening — strong shopping film opportunity.',
    });
    const shaped = shapeWhatShouldKelliePostVoice([expired, fresh], NOW);
    assert.ok(!shaped.items.some((item) => /Last month estate sale/i.test(item.title)));
    assert.equal(shaped.items[0]?.title, 'Bags and Shoes painting workshop');
  });

  it('excludes ordinary non-filmable calendar clutter', () => {
    const filmable = baseItem();
    const concert = baseItem({
      id: '00000000-0000-4000-8000-000000000205',
      title: 'Generic downtown concert tonight',
      category: 'concert',
      audienceScore: 10,
      flags: {
        ...baseItem().flags,
        shopping: false,
        retail: false,
        luxury: false,
        businessOpening: false,
        freeEvent: true,
      },
      whyItMatters: 'Live music downtown — verify date before posting.',
      businessName: null,
    });
    const shaped = shapeWhatShouldKelliePostVoice([concert, filmable], NOW);
    assert.ok(!shaped.items.some((item) => /Generic downtown concert/i.test(item.title)));
  });

  it('caps at 3 items', () => {
    const items = [1, 2, 3, 4, 5].map((n) =>
      baseItem({
        id: `00000000-0000-4000-8000-00000000021${n}`,
        title: `Filmable pick ${n}`,
        audienceScore: 10 - n,
        businessName: `Studio ${n}`,
        whyItMatters: `Grand opening sale — visual discovery pick number ${n}.`,
      }),
    );
    const shaped = shapeWhatShouldKelliePostVoice(items, NOW);
    assert.ok(shaped.count <= 3);
    assert.ok(shaped.items.length <= 3);
  });

  it('formats deterministic concise speech with more-offer when needed', () => {
    const speech = formatWhatShouldKelliePostSpeech([
      {
        title: 'Bags and Shoes painting workshop',
        reason: 'Timely, visual, and fits her Kansas City discovery lane.',
        when: 'Today',
        area: 'Crossroads',
      },
      {
        title: 'Second pick',
        reason: 'Also filmable.',
        when: null,
        area: null,
      },
      {
        title: 'Third pick',
        reason: 'Also filmable.',
        when: null,
        area: null,
      },
    ]);
    assert.match(speech, /Bags and Shoes painting workshop/);
    assert.match(speech, /Timely, visual/);
    assert.match(speech, /I have two more if you want them/);
    assert.doesNotMatch(speech, /Second pick|Third pick/);
  });

  it('empty inventory yields empty speech', () => {
    const shaped = shapeWhatShouldKelliePostVoice([], NOW);
    assert.equal(shaped.count, 0);
    assert.equal(shaped.speech, WHAT_SHOULD_KELLIE_POST_EMPTY_SPEECH);
  });

  it('source module does not call LLM/web/search/scrape paths', () => {
    const src = readFileSync(resolve(here, 'what-should-kellie-post.ts'), 'utf8');
    assert.doesNotMatch(src, /openai|anthropic|webSearch|scrapeListing|listCalendarItems|ensureCalendar|gmail|instagram/i);
    assert.match(src, /computeCommandCenter/);
    assert.match(src, /postToday/);
  });
});
