import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import type { CreatorCalendarItem } from '../schema.js';
import type { CalendarItemView } from '../creator-calendar/types.js';
import {
  buildWeekendCalendarVoice,
  loadWeekendCalendarVoice,
} from './weekend-calendar.js';
import { WEEKEND_CALENDAR_EMPTY_SPEECH } from './types.js';

const here = dirname(fileURLToPath(import.meta.url));
const NOW = new Date('2026-08-15T17:00:00.000Z'); // Saturday afternoon CT → Aug 14–16

function view(overrides: Partial<CalendarItemView> = {}): CalendarItemView {
  return {
    id: overrides.id ?? '00000000-0000-4000-8000-000000000501',
    title: overrides.title ?? 'Melon Summer Smash',
    description: null,
    itemType: 'public_event',
    sourceRecordType: 'content_item',
    sourceRecordId: overrides.sourceRecordId ?? '00000000-0000-4000-8000-000000000601',
    sourceUrl: 'https://example.com/should-not-appear',
    internalDetailUrl: null,
    startAt: overrides.startAt ?? '2026-08-15T15:00:00.000Z',
    endAt: overrides.endAt ?? null,
    allDay: overrides.allDay ?? false,
    timezone: 'America/Chicago',
    location: overrides.location ?? 'the Kansas City Zoo',
    latitude: null,
    longitude: null,
    status: 'suggested',
    planningStatus: overrides.planningStatus ?? 'suggested',
    creatorAction: null,
    reminderSettings: {},
    contentFormat: null,
    verifiedFields: [],
    unverifiedFields: [],
    notes: 'operator notes must not leak',
    travelMinutes: null,
    createdBy: 'kellie',
    createdAt: '2026-08-10T12:00:00.000Z',
    updatedAt: '2026-08-10T12:00:00.000Z',
    completedAt: null,
    missedAt: null,
    expiredAt: null,
    calendarIntent: null,
    verificationState: overrides.verificationState ?? 'verified',
    whyIncluded: null,
    confidence: 0.87,
    selected: overrides.selected ?? false,
    fallsInWeekend: true,
    ticketUrl: null,
    organizerUrl: null,
    calendarCategory: overrides.calendarCategory ?? null,
    sync: null,
    recommendedAction: null,
    ...overrides,
  };
}

function row(overrides: Partial<CreatorCalendarItem> = {}): CreatorCalendarItem {
  return {
    id: '00000000-0000-4000-8000-000000000701',
    title: 'Hike with a Naturalist',
    description: null,
    itemType: 'public_event',
    sourceRecordType: 'content_item',
    sourceRecordId: '00000000-0000-4000-8000-000000000801',
    sourceUrl: 'https://kcparks.org/hike',
    internalDetailUrl: null,
    startAt: new Date('2026-08-15T15:30:00.000Z'),
    endAt: null,
    allDay: false,
    timezone: 'America/Chicago',
    location: 'Lakeside Nature Center',
    latitude: null,
    longitude: null,
    status: 'suggested',
    planningStatus: 'suggested',
    creatorAction: null,
    reminderSettings: {},
    contentFormat: null,
    verifiedFields: [],
    unverifiedFields: [],
    notes: null,
    travelMinutes: null,
    createdBy: 'kellie',
    isTest: false,
    testRunId: null,
    idempotencyKey: null,
    calendarIntent: null,
    occurrenceFingerprint: null,
    dismissReason: null,
    dismissedAt: null,
    confidence: null,
    verificationState: 'verified',
    userEditedAt: null,
    populationSource: 'inventory',
    metadata: {},
    createdAt: new Date('2026-08-10T12:00:00.000Z'),
    updatedAt: new Date('2026-08-10T12:00:00.000Z'),
    completedAt: null,
    missedAt: null,
    expiredAt: null,
    ...overrides,
  } as CreatorCalendarItem;
}

describe('weekend calendar voice read', () => {
  it('reads injected durable rows and does not invoke projection', async () => {
    let projectionCalls = 0;
    const result = await loadWeekendCalendarVoice(NOW, {
      loadRows: async () => [row()],
      loadWeekendSelectedIds: async () => new Set(),
      loadSnoozes: async () => {
        projectionCalls += 0;
        return [];
      },
    });
    assert.equal(result.operation, 'weekend_calendar');
    assert.equal(result.count, 1);
    assert.equal(result.ready, true);
    assert.equal(result.items[0]?.title, 'Hike with a Naturalist');
    assert.equal(result.items[0]?.venue, 'Lakeside Nature Center');
    assert.equal(result.items[0]?.day, 'Saturday');
    assert.equal(projectionCalls, 0);
    assert.match(result.speech, /Benson found 1 thing this weekend/);
    assert.match(result.speech, /The first is Hike with a Naturalist/);
    assert.doesNotMatch(result.speech, /strongest/i);
    assert.doesNotMatch(result.speech, /https?:\/\/|00000000-0000|87%/);
  });

  it('returns top 1–3 spoken items while keeping the full count', () => {
    const result = buildWeekendCalendarVoice(
      [
        view({ title: 'Melon Summer Smash', location: 'the Kansas City Zoo', startAt: '2026-08-14T23:00:00.000Z' }),
        view({
          id: '2',
          title: 'Panda Fest',
          location: 'Legends Field',
          startAt: '2026-08-15T15:00:00.000Z',
        }),
        view({
          id: '3',
          title: 'Hike with a Naturalist',
          location: 'Lakeside Nature Center',
          startAt: '2026-08-15T16:00:00.000Z',
        }),
        view({
          id: '4',
          title: 'Fourth Event',
          location: 'Union Station',
          startAt: '2026-08-16T17:00:00.000Z',
        }),
      ],
      [],
      NOW,
    );
    assert.equal(result.count, 4);
    assert.equal(result.items.length, 4);
    assert.equal(result.items[0]?.title, 'Melon Summer Smash');
    assert.equal(result.items[3]?.title, 'Fourth Event');
    assert.doesNotMatch(result.speech, /Fourth Event/);
    assert.match(result.speech, /Ask for more if you want the rest/);
  });

  it('returns truthful empty copy when no durable weekend rows exist', () => {
    const result = buildWeekendCalendarVoice([], [], NOW);
    assert.equal(result.count, 0);
    assert.equal(result.ready, false);
    assert.deepEqual(result.items, []);
    assert.equal(result.speech, WEEKEND_CALENDAR_EMPTY_SPEECH);
  });

  it('omits private payload fields from the compact voice item', () => {
    const result = buildWeekendCalendarVoice([view()], [], NOW);
    const item = result.items[0];
    assert.ok(item);
    assert.equal('id' in item, false);
    assert.equal('sourceUrl' in item, false);
    assert.equal('notes' in item, false);
    assert.equal('confidence' in item, false);
    assert.equal('sync' in item, false);
  });

  it('source does not call Calendar projection or listCalendarItems', () => {
    const src = readFileSync(resolve(here, 'weekend-calendar.ts'), 'utf8');
    assert.doesNotMatch(src, /\blistCalendarItems\s*\(/);
    assert.doesNotMatch(src, /\bensureCalendarInventoryProjections\b/);
    assert.doesNotMatch(src, /\bscheduleCalendarProjectionForRead\b/);
    assert.match(src, /creatorCalendarItems/);
  });

  it('source does not write calendar or planner state', () => {
    const src = readFileSync(resolve(here, 'weekend-calendar.ts'), 'utf8');
    assert.doesNotMatch(src, /createCalendarItem|updateCalendarItem|deleteCalendarItem/);
    assert.doesNotMatch(src, /setWeekendListMembership|emitDataChange|insert\(/);
  });
});
