import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { eq, inArray } from 'drizzle-orm';
import { assertSafeTestDatabase, db } from '../test-db.js';
import { campaigns, contentItems, creatorPreferences } from '../schema.js';
import { expressCreatorInterest, listOpenDiscoveries } from './actions.js';
import { extractDiscoverTraits, scoreDiscoverCandidate } from './discover-card.js';
import {
  applyDiscoverTasteVote,
  DISCOVER_TASTE_NOTE_KEY,
  getDiscoverTasteWeights,
  nextDiscoverTasteWeights,
} from '../creator-preferences/discover-taste.js';

const PREFIX = 'ZZZ_TEST_FIXTURE_discover_quality_';
const FUTURE = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);

const fixtureIds: Record<string, string> = {};
let campaignId: string;
let savedTaste: string | undefined;

async function insertCard(
  key: string,
  topic: string,
  extras: Partial<typeof contentItems.$inferInsert> & { discoveredAt?: Date },
): Promise<string> {
  const [row] = await db
    .insert(contentItems)
    .values({
      campaignId,
      type: 'industry_insight',
      language: 'en',
      state: 'planned',
      topic: `${PREFIX}${topic}`,
      eventStartsAt: FUTURE,
      creatorValueStatus: 'creator_candidate',
      locationName: 'Kansas City',
      sourceUrl: `https://example.com/kc/${key}`,
      script: extras.script ?? `${topic} in Kansas City.`,
      discoveredAt: extras.discoveredAt ?? new Date(),
      metadata: extras.metadata ?? {
        opportunityCategory: 'Nightlife / Music',
        ingest: 'ask_benson_link',
      },
      ...Object.fromEntries(
        Object.entries(extras).filter(([k]) => k !== 'discoveredAt' && k !== 'script' && k !== 'metadata'),
      ),
    })
    .returning({ id: contentItems.id });
  assert.ok(row);
  fixtureIds[key] = row.id;
  return row.id;
}

describe('discover taste ranking', () => {
  it('repeated votes cap instead of exploding', () => {
    let weights = {};
    for (let i = 0; i < 12; i += 1) {
      weights = nextDiscoverTasteWeights(weights, ['food_drink'], 'more');
    }
    assert.equal(weights.food_drink, 3);
    for (let i = 0; i < 12; i += 1) {
      weights = nextDiscoverTasteWeights(weights, ['literary_event'], 'less');
    }
    assert.equal(weights.literary_event, -3);
  });

  it('less-like-this does not learn the broad event trait', () => {
    const next = nextDiscoverTasteWeights({}, ['event', 'literary_event'], 'less');
    assert.equal(next.event, undefined);
    assert.equal(next.literary_event, -1);
  });

  it('preference fit moves similar scores up and unrelated stay flat', () => {
    const now = new Date();
    const food = {
      title: 'Westport pasta night tasting menu',
      locationName: 'Westport',
      category: 'Food & Drink',
      eventStartsAt: FUTURE,
      discoveredAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      sourceUrl: 'https://example.com/pasta',
    };
    const night = {
      title: 'DJ night at Outsiders Social Club Kansas City',
      locationName: 'Kansas City',
      category: 'Nightlife / Music',
      eventStartsAt: FUTURE,
      discoveredAt: now,
      sourceUrl: 'https://example.com/dj',
    };
    const beforeFood = scoreDiscoverCandidate(food, {}, now);
    const beforeNight = scoreDiscoverCandidate(night, {}, now);
    assert.ok(beforeNight > beforeFood, 'newer nightlife should beat older food before taste');

    const afterFood = scoreDiscoverCandidate(food, { food_drink: 1 }, now);
    const afterNight = scoreDiscoverCandidate(night, { food_drink: 1 }, now);
    assert.ok(afterFood > afterNight, 'food preference must reorder ranking');
    assert.equal(afterNight, beforeNight);
  });
});

describe('listOpenDiscoveries — eligibility + vote ranking', () => {
  before(async () => {
    assertSafeTestDatabase();
    const [existingCampaign] = await db.select({ id: campaigns.id }).from(campaigns).limit(1);
    assert.ok(existingCampaign);
    campaignId = existingCampaign.id;

    const [pref] = await db
      .select({ categoryNotes: creatorPreferences.categoryNotes })
      .from(creatorPreferences)
      .where(eq(creatorPreferences.id, 'global'))
      .limit(1);
    savedTaste = (pref?.categoryNotes as Record<string, string> | undefined)?.[DISCOVER_TASTE_NOTE_KEY];
    if (pref) {
      const notes = { ...((pref.categoryNotes ?? {}) as Record<string, string>) };
      notes[DISCOVER_TASTE_NOTE_KEY] = '{}';
      await db
        .update(creatorPreferences)
        .set({ categoryNotes: notes, updatedAt: new Date() })
        .where(eq(creatorPreferences.id, 'global'));
    }

    const now = new Date();
    await insertCard('opaque', 'Dbtacojzn1r at Instagram', {
      sourceUrl: 'https://www.instagram.com/p/DbtacOJzN1R/',
      metadata: { opportunityCategory: 'creator_partnership', ingest: 'ask_benson_link' },
      discoveredAt: now,
    });
    await insertCard('tez', 'Tez Carter Events Official: TikTok, Instagram, Facebook — KANSAS CITY', {
      sourceUrl: 'https://linktr.ee/tezcarterevents',
      metadata: {
        opportunityCategory: 'restaurant_food_discovery',
        entityOpportunityType: 'restaurant_food_discovery',
        ingest: 'ask_benson_link',
      },
      discoveredAt: now,
    });
    await insertCard('bronx', 'Events & Tickets — Reading Rhythms | Reading Rhythms', {
      locationName: 'Bronx, New York',
      sourceUrl: 'https://www.readingrhythms.co/events',
      metadata: { opportunityCategory: 'Event', ingest: 'ask_benson_link' },
      script: 'Book club in the Bronx.',
      discoveredAt: now,
    });
    await insertCard('osc_la', 'Los Angeles Welcomes Workers with Open Arms as it Unveils a New', {
      metadata: { opportunityCategory: 'local_business', ingest: 'ask_benson_link' },
      discoveredAt: now,
    });

    await insertCard('food_vote', 'Westport pasta tasting menu at Local Trattoria', {
      metadata: { opportunityCategory: 'Food & Drink', ingest: 'ask_benson_link' },
      script: 'Pasta tasting menu in Westport, Kansas City.',
      discoveredAt: new Date(now.getTime() - 60 * 60 * 1000),
    });
    await insertCard('food_rank', 'River Market brunch cafe opening Kansas City', {
      metadata: { opportunityCategory: 'Food & Drink', ingest: 'ask_benson_link' },
      script: 'New brunch cafe in the River Market.',
      discoveredAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    });
    await insertCard('night_rank', 'DJ DOT WAV at Outsiders Social Club Kansas City', {
      metadata: { opportunityCategory: 'Nightlife / Music', ingest: 'ask_benson_link' },
      script: 'DJ-led event at Outsiders Social Club in Kansas City.',
      discoveredAt: now,
    });
    await insertCard('book_vote', 'Westport author reading and book signing Kansas City', {
      metadata: { opportunityCategory: 'Event', ingest: 'ask_benson_link' },
      script: 'Author reading and book signing in Westport.',
      discoveredAt: new Date(now.getTime() - 30 * 60 * 1000),
    });
    await insertCard('book_rank', 'Crossroads literary reading night Kansas City', {
      metadata: { opportunityCategory: 'Event', ingest: 'ask_benson_link' },
      script: 'Literary reading night in the Crossroads.',
      discoveredAt: now,
    });
    await insertCard('dismiss_me', 'Plaza vintage boutique restock Kansas City', {
      metadata: { opportunityCategory: 'Shopping Find', ingest: 'ask_benson_link' },
      script: 'Vintage boutique restock on the Plaza.',
      discoveredAt: now,
    });
  });

  after(async () => {
    const ids = Object.values(fixtureIds);
    if (ids.length > 0) {
      await db.delete(contentItems).where(inArray(contentItems.id, ids));
    }
    const [pref] = await db
      .select({ categoryNotes: creatorPreferences.categoryNotes })
      .from(creatorPreferences)
      .where(eq(creatorPreferences.id, 'global'))
      .limit(1);
    if (pref) {
      const notes = { ...((pref.categoryNotes ?? {}) as Record<string, string>) };
      if (savedTaste === undefined) delete notes[DISCOVER_TASTE_NOTE_KEY];
      else notes[DISCOVER_TASTE_NOTE_KEY] = savedTaste;
      await db
        .update(creatorPreferences)
        .set({ categoryNotes: notes, updatedAt: new Date() })
        .where(eq(creatorPreferences.id, 'global'));
    }
  });

  it('filters live garbage fixtures out of Discover', async () => {
    const rows = await listOpenDiscoveries(500);
    const ids = new Set(rows.map((r) => r.contentItemId));
    assert.equal(ids.has(fixtureIds.opaque), false);
    assert.equal(ids.has(fixtureIds.tez), false);
    assert.equal(ids.has(fixtureIds.bronx), false);
    assert.equal(ids.has(fixtureIds.osc_la), false);
  });

  it('more like this raises similar future ranking and survives reload', async () => {
    assert.ok(extractDiscoverTraits({
      title: 'Westport pasta tasting menu at Local Trattoria',
      category: 'Food & Drink',
      locationName: 'Westport',
    }).includes('food_drink'));

    const before = await listOpenDiscoveries(500);
    const beforeIds = before.map((r) => r.contentItemId);
    const foodBefore = beforeIds.indexOf(fixtureIds.food_rank);
    const nightBefore = beforeIds.indexOf(fixtureIds.night_rank);
    assert.ok(foodBefore >= 0 && nightBefore >= 0);
    assert.ok(nightBefore < foodBefore, 'newer nightlife should lead before the food vote');

    await applyDiscoverTasteVote(
      extractDiscoverTraits({
        title: 'Westport pasta tasting menu at Local Trattoria',
        summary: 'Pasta tasting menu in Westport, Kansas City.',
        category: 'Food & Drink',
        locationName: 'Westport',
        eventStartsAt: FUTURE,
      }),
      'more',
    );

    const after = await listOpenDiscoveries(500);
    const afterIds = after.map((r) => r.contentItemId);
    const foodAfter = afterIds.indexOf(fixtureIds.food_rank);
    const nightAfter = afterIds.indexOf(fixtureIds.night_rank);
    assert.ok(foodAfter >= 0 && nightAfter >= 0);
    assert.ok(foodAfter < nightAfter, 'food vote must move similar food above unrelated nightlife');

    const weights = await getDiscoverTasteWeights();
    assert.ok((weights.food_drink ?? 0) >= 1);

    const reload = await listOpenDiscoveries(500);
    const reloadIds = reload.map((r) => r.contentItemId);
    assert.ok(reloadIds.indexOf(fixtureIds.food_rank) < reloadIds.indexOf(fixtureIds.night_rank));
  });

  it('less like this lowers similar future ranking without hiding unrelated food', async () => {
    await applyDiscoverTasteVote(
      extractDiscoverTraits({
        title: 'Westport author reading and book signing Kansas City',
        summary: 'Author reading and book signing in Westport.',
        category: 'Event',
        locationName: 'Westport',
        eventStartsAt: FUTURE,
      }),
      'less',
    );
    const rows = await listOpenDiscoveries(500);
    const ids = rows.map((r) => r.contentItemId);
    const book = ids.indexOf(fixtureIds.book_rank);
    const food = ids.indexOf(fixtureIds.food_rank);
    assert.ok(book >= 0 && food >= 0);
    assert.ok(food < book, 'literary less-like-this should downrank similar readings, not food');
    const weights = await getDiscoverTasteWeights();
    assert.ok((weights.literary_event ?? 0) <= -1);
    assert.equal(weights.event, undefined);
  });

  it('not interested hides the item durably via expressCreatorInterest', async () => {
    await expressCreatorInterest({
      contentItemId: fixtureIds.dismiss_me,
      action: 'not_interested',
      sourceScreen: 'discoveries',
    });
    const first = await listOpenDiscoveries(500);
    assert.equal(first.some((r) => r.contentItemId === fixtureIds.dismiss_me), false);
    const reload = await listOpenDiscoveries(500);
    assert.equal(reload.some((r) => r.contentItemId === fixtureIds.dismiss_me), false);
  });
});
