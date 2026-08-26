import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { InventoryNormalizeSource } from '../../inventory/inventory-load-projection.js';
import { normalizeInventoryItem } from '../../inventory/normalize.js';
import { inventoryTemporalDayKey } from './eligibility.js';
import {
  temporalEvidenceFromCalendarRow,
} from './inventory-temporal-evidence.js';

/**
 * Production-shaped Calendar load: shared inventory columns + thin extracted aliases
 * (no full raw_payload on the row / InventoryItem).
 */
function calendarShapedNormalize(input: {
  id: string;
  topic: string;
  eventStartsAt: Date;
  eventEndsAt?: Date | null;
  calendarExtractedEventDate: string | null;
  calendarExtractedEventEndDate?: string | null;
  calendarExtractedStartTime: string | null;
  metadata?: Record<string, unknown>;
}) {
  const now = new Date('2026-08-12T12:00:00.000Z');
  const source: InventoryNormalizeSource = {
    id: input.id,
    topic: input.topic,
    hook: null,
    script: 'KC event.',
    metadata: input.metadata ?? {
      ingest: 'ask_benson_listing',
      // Listing-scrape rows typically lack metadata.extracted
    },
    state: 'new',
    eventStartsAt: input.eventStartsAt,
    eventEndsAt: input.eventEndsAt ?? null,
    discoveredAt: now,
    createdAt: now,
    updatedAt: now,
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
    sourceUrl: 'https://example.com/event',
    relevanceScore: null,
    urgencyScore: null,
    coverageFormat: null,
    suggestedCoverageFormat: null,
    firsthandVisited: false,
    creatorValueStatus: 'creator_candidate',
    lifecycleStatus: 'upcoming',
  };

  const temporalEvidence = temporalEvidenceFromCalendarRow({
    calendarExtractedEventDate: input.calendarExtractedEventDate,
    calendarExtractedEventEndDate: input.calendarExtractedEventEndDate ?? null,
    calendarExtractedStartTime: input.calendarExtractedStartTime,
  });

  const item = normalizeInventoryItem(source, 'Test Source', 'scrape', { temporalEvidence });
  assert.equal('rawPayload' in item.metadata, false);
  assert.equal(item.metadata.extracted, undefined);
  return item;
}

describe('Calendar inventory temporal evidence retention', () => {
  it('Woman of Influence shape: true date-only => encoded UTC day', () => {
    const item = calendarShapedNormalize({
      id: '00000000-0000-4000-8000-000000000501',
      topic: 'Woman of Influence',
      eventStartsAt: new Date('2026-08-28T00:00:00.000Z'),
      calendarExtractedEventDate: '2026-08-28',
      calendarExtractedStartTime: null,
    });
    assert.deepEqual(item.temporalEvidence, {
      eventDate: '2026-08-28',
      eventEndDate: null,
      startTime: null,
    });
    assert.equal(inventoryTemporalDayKey(item.eventDate, item, 'start'), '2026-08-28');
  });

  it('Big 12 Session 2 shape: timed T00Z => Chicago local day Mar 9', () => {
    const item = calendarShapedNormalize({
      id: '00000000-0000-4000-8000-000000000502',
      topic: 'Big 12 Session 2',
      eventStartsAt: new Date('2027-03-10T00:00:00.000Z'),
      calendarExtractedEventDate: '2027-03-09T18:00:00',
      calendarExtractedStartTime: '18:00:00',
    });
    assert.equal(item.temporalEvidence?.startTime, '18:00:00');
    assert.equal(inventoryTemporalDayKey(item.eventDate, item, 'start'), '2027-03-09');
  });

  it('Big 12 Session 4 equivalent: timed T00Z => Mar 10 not Mar 11', () => {
    const item = calendarShapedNormalize({
      id: '00000000-0000-4000-8000-000000000503',
      topic: 'Big 12 Session 4',
      eventStartsAt: new Date('2027-03-11T00:00:00.000Z'),
      calendarExtractedEventDate: '2027-03-10T18:00:00',
      calendarExtractedStartTime: '18:00:00',
    });
    assert.equal(inventoryTemporalDayKey(item.eventDate, item, 'start'), '2027-03-10');
  });

  it('Come From Away shape: timed T00Z => Sep 1', () => {
    const item = calendarShapedNormalize({
      id: '00000000-0000-4000-8000-000000000504',
      topic: 'Come From Away',
      eventStartsAt: new Date('2026-09-02T00:00:00.000Z'),
      calendarExtractedEventDate: '2026-09-01T19:00:00',
      calendarExtractedStartTime: '19:00:00',
    });
    assert.equal(inventoryTemporalDayKey(item.eventDate, item, 'start'), '2026-09-01');
  });

  it('ordinary non-midnight timed event unchanged', () => {
    const item = calendarShapedNormalize({
      id: '00000000-0000-4000-8000-000000000505',
      topic: 'Inspiring Women',
      eventStartsAt: new Date('2026-08-21T08:00:00.000Z'),
      calendarExtractedEventDate: '2026-08-21T03:00:00',
      calendarExtractedStartTime: '03:00:00',
    });
    assert.equal(inventoryTemporalDayKey(item.eventDate, item, 'start'), '2026-08-21');
  });

  it('date-only start/end pair retains encoded intended dates', () => {
    const item = calendarShapedNormalize({
      id: '00000000-0000-4000-8000-000000000506',
      topic: 'Multi-day date-only',
      eventStartsAt: new Date('2026-08-28T00:00:00.000Z'),
      eventEndsAt: new Date('2026-08-30T00:00:00.000Z'),
      calendarExtractedEventDate: '2026-08-28',
      calendarExtractedEventEndDate: '2026-08-30',
      calendarExtractedStartTime: null,
    });
    assert.equal(inventoryTemporalDayKey(item.eventDate, item, 'start'), '2026-08-28');
    assert.equal(inventoryTemporalDayKey(item.eventEndDate, item, 'end'), '2026-08-30');
  });

  it('missing temporal evidence entirely keeps conservative UTC-midnight fallback', () => {
    const item = calendarShapedNormalize({
      id: '00000000-0000-4000-8000-000000000507',
      topic: 'No extracted evidence',
      eventStartsAt: new Date('2026-08-28T00:00:00.000Z'),
      calendarExtractedEventDate: null,
      calendarExtractedStartTime: null,
    });
    assert.deepEqual(item.temporalEvidence, {
      eventDate: null,
      eventEndDate: null,
      startTime: null,
    });
    assert.equal(inventoryTemporalDayKey(item.eventDate, item, 'start'), '2026-08-28');
  });

  it('does not place full raw_payload on InventoryItem', () => {
    const item = calendarShapedNormalize({
      id: '00000000-0000-4000-8000-000000000508',
      topic: 'Session 2',
      eventStartsAt: new Date('2027-03-10T00:00:00.000Z'),
      calendarExtractedEventDate: '2027-03-09T18:00:00',
      calendarExtractedStartTime: '18:00:00',
    });
    assert.equal(Object.prototype.hasOwnProperty.call(item, 'rawPayload'), false);
    assert.equal(item.metadata.rawPayload, undefined);
    assert.ok(item.temporalEvidence);
    assert.equal(Object.keys(item.temporalEvidence!).sort().join(','), 'eventDate,eventEndDate,startTime');
  });
});
