import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { eq, like } from 'drizzle-orm';
import { assertSafeTestDatabase, db } from '../test-db.js';
import { campaigns, contentItems, sources, type NewContentItem } from '../schema.js';
import { persistIngestedContentItemResult } from './ingest-persist.js';
import { buildListingContainerChildExternalId } from '../ask-benson/container-child-persist.js';

const FIXTURE_PREFIX = 'ZZZ_TEST_FIXTURE_container_child_persist_';
const HUB = 'https://www.downtownop.org/events?utm_source=openai&benson_test=container_child';
const OTHER_URL = 'https://example.test/single-event-page';

let campaignId: string;
let sourceId: string;
const insertedIds: string[] = [];

function childRow(overrides: Partial<NewContentItem> & { topic: string; sourceExternalId: string }): NewContentItem {
  return {
    campaignId,
    type: 'industry_insight',
    language: 'en',
    state: 'planned',
    hook: 'Downtown OP fixture',
    sourceId,
    sourceUrl: HUB,
    eventStartsAt: new Date('2026-09-12T23:00:00.000Z'),
    locationName: 'Clock Tower Plaza',
    metadata: {
      ingest: 'scrape_listing',
      listingSourceUrl: HUB,
      parentArticleUrl: HUB,
      containerChild: true,
      calendarEligible: true,
    },
    ...overrides,
  };
}

describe('persistIngestedContentItem — shared hub URL children', () => {
  before(async () => {
    assertSafeTestDatabase();
    const [campaign] = await db.select({ id: campaigns.id }).from(campaigns).limit(1);
    assert.ok(campaign, 'expected a campaign');
    campaignId = campaign.id;
    const [source] = await db
      .insert(sources)
      .values({
        campaignId,
        type: 'scrape',
        name: `${FIXTURE_PREFIX}source`,
        config: { listingUrl: HUB },
        active: false,
      })
      .returning({ id: sources.id });
    assert.ok(source);
    sourceId = source.id;
  });

  after(async () => {
    if (insertedIds.length) {
      await db.delete(contentItems).where(like(contentItems.topic, `${FIXTURE_PREFIX}%`));
    }
    if (sourceId) {
      await db.delete(contentItems).where(eq(contentItems.sourceId, sourceId));
      await db.delete(sources).where(eq(sources.id, sourceId));
    }
  });

  it('same hub URL + different child title/date creates two rows and keeps Farmers Market', async () => {
    const farmersExternal = `${FIXTURE_PREFIX}farmers-legacy-0`;
    const farmers = await persistIngestedContentItemResult(
      sourceId,
      farmersExternal,
      () =>
        childRow({
          topic: `${FIXTURE_PREFIX}Overland Park Farmers Market`,
          sourceExternalId: farmersExternal,
          eventStartsAt: new Date('2026-04-18T12:30:00.000Z'),
          locationName: 'Matt Ross Community Center',
        }),
      { sourceUrl: HUB },
    );
    assert.equal(farmers.outcome, 'created');
    assert.ok(farmers.contentItemId);
    insertedIds.push(farmers.contentItemId!);

    const movieExternal = buildListingContainerChildExternalId({
      ingest: 'scrape_listing',
      listingUrl: HUB,
      title: `${FIXTURE_PREFIX}Movie Night`,
      eventDate: '2026-09-12T23:00:00.000Z',
      venue: 'Clock Tower Plaza',
    });
    const movie = await persistIngestedContentItemResult(
      sourceId,
      movieExternal,
      () =>
        childRow({
          topic: `${FIXTURE_PREFIX}Movie Night`,
          sourceExternalId: movieExternal,
        }),
      {
        sourceUrl: HUB,
        sharedHubProvenance: true,
        childMatch: {
          title: `${FIXTURE_PREFIX}Movie Night`,
          eventStartsAt: new Date('2026-09-12T23:00:00.000Z'),
          eventDate: '2026-09-12T23:00:00.000Z',
          venue: 'Clock Tower Plaza',
          listingUrl: HUB,
        },
      },
    );
    assert.equal(movie.outcome, 'created');
    assert.ok(movie.contentItemId);
    assert.notEqual(movie.contentItemId, farmers.contentItemId);
    insertedIds.push(movie.contentItemId!);

    const [farmersRow] = await db
      .select({
        topic: contentItems.topic,
        sourceUrl: contentItems.sourceUrl,
        eventStartsAt: contentItems.eventStartsAt,
        metadata: contentItems.metadata,
      })
      .from(contentItems)
      .where(eq(contentItems.id, farmers.contentItemId!));
    assert.equal(farmersRow?.topic, `${FIXTURE_PREFIX}Overland Park Farmers Market`);
    assert.equal(farmersRow?.sourceUrl, HUB);
    assert.equal(farmersRow?.eventStartsAt?.toISOString(), '2026-04-18T12:30:00.000Z');

    const [movieRow] = await db
      .select({
        topic: contentItems.topic,
        sourceUrl: contentItems.sourceUrl,
        metadata: contentItems.metadata,
      })
      .from(contentItems)
      .where(eq(contentItems.id, movie.contentItemId!));
    assert.equal(movieRow?.topic, `${FIXTURE_PREFIX}Movie Night`);
    assert.equal(movieRow?.sourceUrl, HUB);
    const meta = (movieRow?.metadata ?? {}) as Record<string, unknown>;
    assert.equal(meta.listingSourceUrl, HUB);
    assert.equal(meta.parentArticleUrl, HUB);
  });

  it('same hub + same normalized title/day/venue reconciles one row (idempotent re-ingest)', async () => {
    const bourbonExternal = buildListingContainerChildExternalId({
      ingest: 'scrape_listing',
      listingUrl: HUB,
      title: `${FIXTURE_PREFIX}Bourbon, Bacon & Brews`,
      eventDate: '2026-10-09T21:00:00.000Z',
      venue: 'Downtown Overland Park',
    });
    const first = await persistIngestedContentItemResult(
      sourceId,
      bourbonExternal,
      () =>
        childRow({
          topic: `${FIXTURE_PREFIX}Bourbon, Bacon & Brews`,
          sourceExternalId: bourbonExternal,
          eventStartsAt: new Date('2026-10-09T21:00:00.000Z'),
          locationName: 'Downtown Overland Park',
        }),
      {
        sourceUrl: HUB,
        sharedHubProvenance: true,
        childMatch: {
          title: `${FIXTURE_PREFIX}Bourbon, Bacon & Brews`,
          eventStartsAt: new Date('2026-10-09T21:00:00.000Z'),
          eventDate: '2026-10-09T21:00:00.000Z',
          venue: 'Downtown Overland Park',
          listingUrl: HUB,
        },
      },
    );
    assert.equal(first.outcome, 'created');
    insertedIds.push(first.contentItemId!);

    const second = await persistIngestedContentItemResult(
      sourceId,
      `${bourbonExternal}-reingest-alt-external`,
      () =>
        childRow({
          topic: `${FIXTURE_PREFIX}Bourbon, Bacon & Brews`,
          sourceExternalId: `${bourbonExternal}-reingest-alt-external`,
          eventStartsAt: new Date('2026-10-09T21:00:00.000Z'),
          locationName: 'Downtown Overland Park',
        }),
      {
        sourceUrl: HUB,
        sharedHubProvenance: true,
        childMatch: {
          title: `${FIXTURE_PREFIX}Bourbon Bacon and Brews`,
          eventStartsAt: new Date('2026-10-09T21:00:00.000Z'),
          eventDate: '2026-10-09T21:00:00.000Z',
          venue: 'Downtown Overland Park',
          listingUrl: HUB,
        },
      },
    );
    assert.equal(second.outcome, 'updated');
    assert.equal(second.contentItemId, first.contentItemId);
  });

  it('ordinary non-container exact-URL dedupe remains unchanged', async () => {
    const first = await persistIngestedContentItemResult(
      sourceId,
      `${FIXTURE_PREFIX}single-a`,
      () =>
        childRow({
          topic: `${FIXTURE_PREFIX}Official Festival Page`,
          sourceExternalId: `${FIXTURE_PREFIX}single-a`,
          sourceUrl: OTHER_URL,
          metadata: { ingest: 'scrape_listing', calendarEligible: true },
        }),
      { sourceUrl: OTHER_URL },
    );
    assert.equal(first.outcome, 'created');
    insertedIds.push(first.contentItemId!);

    const second = await persistIngestedContentItemResult(
      sourceId,
      `${FIXTURE_PREFIX}single-b`,
      () =>
        childRow({
          topic: `${FIXTURE_PREFIX}Different Title Should Not Create`,
          sourceExternalId: `${FIXTURE_PREFIX}single-b`,
          sourceUrl: OTHER_URL,
          metadata: { ingest: 'scrape_listing', calendarEligible: true },
        }),
      { sourceUrl: OTHER_URL },
    );
    assert.equal(second.outcome, 'updated');
    assert.equal(second.contentItemId, first.contentItemId);

    const [row] = await db
      .select({ topic: contentItems.topic })
      .from(contentItems)
      .where(eq(contentItems.id, first.contentItemId!));
    assert.equal(row?.topic, `${FIXTURE_PREFIX}Official Festival Page`);
  });

  it('legacy index-suffixed sourceExternalId still matches via shared-hub child identity', async () => {
    const title = `${FIXTURE_PREFIX}Inspiring Women in Public Administration Conference 2026`;
    const eventDate = '2026-08-21T08:00:00';
    const venue = 'Overland Park Convention Center';
    const listingUrl = 'https://opconventioncenter.com/events/';
    const stable = buildListingContainerChildExternalId({
      ingest: 'scrape_listing',
      listingUrl,
      title,
      eventDate,
      venue,
    });
    const legacyIndexId = `scrape_listing-5cd63116244d6030-7-${title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48)}`;

    const first = await persistIngestedContentItemResult(
      sourceId,
      legacyIndexId,
      () =>
        childRow({
          topic: title,
          sourceExternalId: legacyIndexId,
          sourceUrl: listingUrl,
          eventStartsAt: new Date('2026-08-21T13:00:00.000Z'),
          locationName: venue,
          metadata: {
            ingest: 'scrape_listing',
            listingSourceUrl: listingUrl,
            parentArticleUrl: listingUrl,
            containerChild: true,
            calendarEligible: true,
          },
          rawPayload: { extracted: { eventDate } },
        }),
      { sourceUrl: listingUrl, sharedHubProvenance: true },
    );
    assert.equal(first.outcome, 'created');
    insertedIds.push(first.contentItemId!);

    const second = await persistIngestedContentItemResult(
      sourceId,
      stable,
      () =>
        childRow({
          topic: title,
          sourceExternalId: stable,
          sourceUrl: listingUrl,
          eventStartsAt: new Date('2026-08-21T13:00:00.000Z'),
          locationName: venue,
          rawPayload: { extracted: { eventDate } },
        }),
      {
        sourceUrl: listingUrl,
        sharedHubProvenance: true,
        childMatch: {
          title,
          eventStartsAt: new Date('2026-08-21T13:00:00.000Z'),
          eventDate,
          venue,
          listingUrl,
        },
      },
    );
    assert.equal(second.outcome, 'updated');
    assert.equal(second.contentItemId, first.contentItemId);
  });
});
