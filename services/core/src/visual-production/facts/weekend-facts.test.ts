import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { lockWeekendFactSheet, packWeekendSlides } from './weekend-facts.js';
import type { WeekendListResponse } from '../../creator-calendar/weekend-list.js';

function listFixture(): WeekendListResponse {
  return {
    title: 'THINGS TO DO THIS WEEKEND IN KC',
    rangeLabel: 'Sep 11–13',
    rangeLabelFull: 'September 11–13, 2026',
    friday: '2026-09-11',
    saturday: '2026-09-12',
    sunday: '2026-09-13',
    timezone: 'America/Chicago',
    selectedCount: 7,
    emptyMessage: '',
    outsideWindowCount: 0,
    flyerBrief: 'brief',
    fullList: 'full',
    pastWeekends: [],
    days: [
      {
        key: 'friday',
        heading: 'FRIDAY',
        dateKey: '2026-09-11',
        items: [
          {
            id: '1',
            title: 'Live Music Fridays',
            dayKey: 'friday',
            dateLabel: 'Friday, Sep 11',
            startTimeLabel: '6:00 PM',
            venue: 'Power & Light',
            city: 'Kansas City, MO',
            address: null,
            description: 'Weekly outdoor set.',
            category: 'music',
            sourceName: 'VisitKC',
            sourceUrl: 'https://example.com/1',
            verificationNote: 'Location confirmed.',
            notes: null,
            spanNote: null,
            sortAt: '2026-09-11T23:00:00.000Z',
          },
        ],
      },
      {
        key: 'saturday',
        heading: 'SATURDAY',
        dateKey: '2026-09-12',
        items: Array.from({ length: 6 }, (_, i) => ({
          id: `s${i}`,
          title: `Saturday Event ${i + 1} with a longer title for density`,
          dayKey: 'saturday' as const,
          dateLabel: 'Saturday, Sep 12',
          startTimeLabel: `${10 + i}:00 AM`,
          venue: `Venue ${i + 1}`,
          city: 'Kansas City, MO',
          address: null,
          description: 'A longer description that spends character budget for packing heuristics.',
          category: 'event',
          sourceName: 'Source',
          sourceUrl: `https://example.com/s${i}`,
          verificationNote: null,
          notes: null,
          spanNote: null,
          sortAt: `2026-09-12T${String(15 + i).padStart(2, '0')}:00:00.000Z`,
        })),
      },
      {
        key: 'sunday',
        heading: 'SUNDAY',
        dateKey: '2026-09-13',
        items: [],
      },
    ],
  };
}

describe('weekend fact sheet + density packer', () => {
  it('locks a stable facts hash for identical events', () => {
    const a = lockWeekendFactSheet(listFixture(), '2026-09-07T00:00:00.000Z');
    const b = lockWeekendFactSheet(listFixture(), '2026-09-07T12:00:00.000Z');
    assert.equal(a.factsHash, b.factsHash);
    assert.equal(a.events.length, 7);
  });

  it('packs 7 events into cover + multiple day slides + CTA', () => {
    const sheet = lockWeekendFactSheet(listFixture());
    const slides = packWeekendSlides(sheet);
    assert.equal(slides[0]?.role, 'cover');
    assert.equal(slides.at(-1)?.role, 'cta');
    const daySlides = slides.filter((s) => s.role === 'day');
    assert.ok(daySlides.length >= 3, `expected >=3 day slides, got ${daySlides.length}`);
    const packedEvents = daySlides.reduce((n, s) => n + s.events.length, 0);
    assert.equal(packedEvents, 7);
  });
});
