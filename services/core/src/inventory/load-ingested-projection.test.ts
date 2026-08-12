import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ContentItem } from '../schema.js';
import {
  INVENTORY_LOAD_OMITTED_CONTENT_COLUMNS,
  inventoryLoadContentItemSelect,
} from './inventory-load-projection.js';
import { normalizeInventoryItem } from './normalize.js';
import { evaluateHomeEligibility } from './home-eligibility.js';
import { isEmploymentOpportunity } from '../creator-agent/employment-intent.js';
import { isAudienceFreshContent, contentPublishedAt } from './content-freshness.js';
import { isOperatorTemporallyCurrent } from '../creator-agent/stale-temporal-prose.js';

const now = new Date('2026-08-11T12:00:00.000Z');

function fullFixtureRow(): ContentItem {
  return {
    id: '00000000-0000-4000-8000-000000000099',
    campaignId: '00000000-0000-4000-8000-000000000001',
    industryId: null,
    personaId: null,
    type: 'short_video',
    language: 'en',
    state: 'planned',
    topic: 'River Market Coffee grand opening',
    topicEmbedding: 'large-embedding-vector-should-not-be-required',
    hook: 'New cafe opens Saturday in River Market.',
    script: 'The next River Market Coffee opens this Saturday — patio seating and local roasts.',
    cta: 'Visit this weekend',
    durationSeconds: 45,
    captionInstagram: 'Long instagram caption '.repeat(50),
    captionTiktok: 'Long tiktok caption '.repeat(50),
    hashtagsInstagram: ['kc', 'coffee'],
    hashtagsTiktok: ['kc', 'coffee'],
    heygenVideoId: 'heygen-123',
    heygenVideoUrl: 'https://cdn.heygen.com/video.mp4',
    finalVideoUrl: 'https://cdn.example.com/final.mp4',
    plannedForDate: '2026-08-15',
    scheduledFor: now,
    publishedAt: null,
    scriptApprovedAt: null,
    scriptApprovedBy: null,
    scriptRejectionReason: null,
    lastError: null,
    retryCount: 0,
    metadata: {
      opportunityCategory: 'coffee_opening',
      ingest: 'scrape_listing',
      businessName: 'River Market Coffee',
      openingFlag: true,
      timezone: 'America/Chicago',
      pitchDining: { publishedAt: '2026-08-09T08:00:00.000Z' },
    },
    sourceId: '00000000-0000-4000-8000-000000000002',
    sourceExternalId: 'ext-123',
    sourceUrl: 'https://rivermarketcoffee.example/opening',
    discoveredAt: new Date('2026-08-09T10:00:00.000Z'),
    relevanceScore: '0.82',
    urgencyScore: '0.55',
    eventStartsAt: new Date('2026-08-16T14:00:00.000Z'),
    eventEndsAt: new Date('2026-08-16T22:00:00.000Z'),
    locationName: 'River Market',
    locationLat: '39.0997',
    locationLng: '-94.5786',
    locationStatus: 'resolved',
    googlePlaceId: 'place-123',
    formattedAddress: '123 Main St, Kansas City, MO',
    googleMapsUrl: 'https://maps.google.com/?q=river+market',
    locationWebsiteUrl: 'https://rivermarketcoffee.example',
    locationConfidence: '0.9',
    locationSource: 'google_places',
    locationCandidates: [{ placeId: 'x', latitude: 39, longitude: -94, displayName: 'Huge' }],
    locationVerifiedAt: new Date('2026-08-08T12:00:00.000Z'),
    locationResolutionError: null,
    rawPayload: { extracted: { body: 'massive raw scrape payload '.repeat(200) } },
    firstSeenAt: new Date('2026-08-01T12:00:00.000Z'),
    lastSeenAt: new Date('2026-08-10T12:00:00.000Z'),
    sourceLastCheckedAt: new Date('2026-08-10T11:00:00.000Z'),
    stale: false,
    freshnessBucket: 'fresh',
    coverageFormat: 'field_visit',
    suggestedCoverageFormat: 'field_visit',
    firsthandVisited: false,
    creatorValueStatus: 'creator_candidate',
    lifecycleStatus: 'upcoming',
    creatorRelevanceExplanation: [{ reason: 'local opening' }],
    contentCategory: 'coffee_opening',
    classificationVerifiedAt: null,
    canonicalEntityId: null,
    creatorNextAction: null,
    topPickValidatedAt: null,
    createdAt: new Date('2026-08-09T10:00:00.000Z'),
    updatedAt: new Date('2026-08-10T12:00:00.000Z'),
  } as ContentItem;
}

function projectedRow(full: ContentItem) {
  const projected: Record<string, unknown> = {};
  for (const key of Object.keys(inventoryLoadContentItemSelect)) {
    projected[key] = full[key as keyof ContentItem];
  }
  return projected;
}

describe('inventory load projection', () => {
  it('selects only required columns and omits raw_payload and other large fields', () => {
    const selected = new Set(Object.keys(inventoryLoadContentItemSelect));
    for (const omitted of INVENTORY_LOAD_OMITTED_CONTENT_COLUMNS) {
      assert.equal(selected.has(omitted), false, `must not select ${omitted}`);
    }
    assert.equal(selected.has('rawPayload'), false);
    assert.equal(selected.has('locationCandidates'), false);
    assert.equal(selected.has('metadata'), true);
    assert.equal(selected.has('topic'), true);
    assert.equal(selected.has('script'), true);
    assert.equal(selected.has('hook'), true);
    assert.equal(selected.has('creatorValueStatus'), true);
    assert.equal(selected.has('lifecycleStatus'), true);
  });

  it('produces identical InventoryItem output for projected vs full row', () => {
    const full = fullFixtureRow();
    const fromFull = normalizeInventoryItem(full, 'KC Scrape', 'scrape');
    const fromProjected = normalizeInventoryItem(projectedRow(full), 'KC Scrape', 'scrape');
    assert.deepEqual(fromProjected, fromFull);
  });

  it('preserves metadata-dependent home eligibility', () => {
    const item = normalizeInventoryItem(projectedRow(fullFixtureRow()), 'KC Scrape', 'scrape');
    const eligibility = evaluateHomeEligibility(item);
    assert.equal(eligibility.eligible, true);
    assert.ok(eligibility.executableCta);
  });

  it('preserves employment intent rejection for jobs listings', () => {
    const full = fullFixtureRow();
    full.metadata = {
      ...full.metadata,
      opportunityCategory: 'employment',
    };
    full.topic = 'Barista jobs at River Market Coffee';
    full.script = 'Now hiring full-time baristas — apply online.';
    const item = normalizeInventoryItem(projectedRow(full), 'Jobs Board', 'scrape');
    assert.equal(
      isEmploymentOpportunity({
        title: item.title,
        category: item.category,
        sourceUrl: item.sourceUrl,
        summary: item.summary,
        metadata: item.metadata,
        whyItMatters: item.whyItMatters,
      }),
      true,
    );
    assert.equal(evaluateHomeEligibility(item).eligible, false);
  });

  it('preserves script/hook summary and summaryRaw behavior', () => {
    const item = normalizeInventoryItem(projectedRow(fullFixtureRow()), 'KC Scrape', 'scrape');
    assert.match(item.summary ?? '', /River Market Coffee opens/i);
    assert.equal(item.summaryRaw, fullFixtureRow().script);
  });

  it('preserves temporal/freshness behavior from metadata and dates', () => {
    const item = normalizeInventoryItem(projectedRow(fullFixtureRow()), 'KC Scrape', 'scrape');
    assert.ok(isAudienceFreshContent(item, now));
    assert.ok(contentPublishedAt(item));
    assert.ok(
      isOperatorTemporallyCurrent({
        startsAt: item.eventDate,
        endsAt: item.eventEndDate,
        summaryText: item.summaryRaw ?? item.summary,
        timezone: 'America/Chicago',
      }),
    );
  });

  it('populates source fields from join args', () => {
    const item = normalizeInventoryItem(projectedRow(fullFixtureRow()), 'Union Station Events', 'union_station');
    assert.equal(item.sourceName, 'Union Station Events');
    assert.equal(item.sourceType, 'union_station');
    assert.equal(item.sourceUrl, 'https://rivermarketcoffee.example/opening');
  });
});
