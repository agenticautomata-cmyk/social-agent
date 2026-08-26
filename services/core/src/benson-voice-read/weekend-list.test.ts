import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { buildWeekendList, type WeekendListSource } from '../creator-calendar/weekend-list.js';
import { loadWeekendListVoice, shapeWeekendListVoice } from './weekend-list.js';
import { WEEKEND_LIST_EMPTY_SPEECH } from './types.js';

const here = dirname(fileURLToPath(import.meta.url));
const NOW = new Date('2026-08-13T17:00:00.000Z');

function source(overrides: Partial<WeekendListSource> = {}): WeekendListSource {
  return {
    id: overrides.id ?? '00000000-0000-4000-8000-000000000401',
    title: overrides.title ?? '816 Day',
    eventDate: overrides.eventDate ?? '2026-08-14T23:00:00.000Z',
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
  };
}

describe('weekend list voice read', () => {
  it('reads existing Weekend planner state and speaks selected items', async () => {
    const hike = source({
      id: '00000000-0000-4000-8000-000000000402',
      title: 'Hike with a Naturalist',
      eventDate: '2026-08-15T15:30:00.000Z',
      venue: 'Lakeside Nature Center',
      sourceUrl: 'https://kcparks.org/hike-with-a-naturalist/',
    });
    const result = await loadWeekendListVoice(NOW, async () => buildWeekendList([source({}), hike], NOW));
    assert.equal(result.operation, 'weekend_list');
    assert.equal(result.count, 2);
    assert.equal(result.items[0]?.title, '816 Day');
    assert.equal(result.items[1]?.title, 'Hike with a Naturalist');
    assert.match(result.speech, /There are 2 items on the weekend list/);
    assert.match(result.speech, /816 Day at Kansas City Power & Light District/);
    assert.match(result.speech, /Hike with a Naturalist at Lakeside Nature Center/);
    assert.doesNotMatch(result.speech, /https?:\/\/|00000000-0000|strong fit/i);
  });

  it('speaks the empty list copy and does not invent items', () => {
    const result = shapeWeekendListVoice(buildWeekendList([], NOW));
    assert.equal(result.count, 0);
    assert.deepEqual(result.items, []);
    assert.equal(result.speech, WEEKEND_LIST_EMPTY_SPEECH);
  });

  it('source does not write Weekend List membership', () => {
    const src = readFileSync(resolve(here, 'weekend-list.ts'), 'utf8');
    assert.match(src, /loadWeekendList/);
    assert.doesNotMatch(src, /setWeekendListMembership/);
    assert.doesNotMatch(src, /insert\(|update\(|delete\(/);
  });
});
