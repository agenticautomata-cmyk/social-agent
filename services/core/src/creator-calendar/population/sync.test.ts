import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dedupePopulationCandidates, mergeCandidates } from './merge.js';
import {
  isProtectedCalendarSuggestion,
  planSuggestionUpsertAllDay,
} from './sync.js';
import type { PopulationCandidate } from './types.js';

function candidate(overrides: Partial<PopulationCandidate>): PopulationCandidate {
  return {
    sourceRecordType: 'curator_event_lead',
    sourceRecordId: '00000000-0000-4000-8000-000000000701',
    calendarIntent: 'public_event',
    itemType: 'public_event',
    planningStatus: 'suggested',
    title: 'Wine Down Sundays',
    startAt: '2026-08-16T19:00:00.000Z',
    location: 'Juke House',
    sourceUrl: 'https://www.instagram.com/p/abc/',
    occurrenceFingerprint: 'fp-ig',
    idempotencyKey: 'skip:wine-down',
    verificationState: 'PARTIALLY_VERIFIED',
    populationSource: 'instagram_watchlist',
    whyIncluded: 'Instagram Watchlist · @jasfoodjourney',
    metadata: { skipKey: 'wine-down', curatorLeadId: '00000000-0000-4000-8000-000000000701' },
    ...overrides,
  };
}

describe('calendar population dedupe', () => {
  it('merges Instagram + website copies into one candidate', () => {
    const ig = candidate({});
    const site = candidate({
      sourceRecordType: 'content_item',
      sourceRecordId: '00000000-0000-4000-8000-000000000801',
      title: 'Wine Down Sundays at Juke House',
      sourceUrl: 'https://jukehousekc.com/wine-down',
      occurrenceFingerprint: 'fp-site',
      verificationState: 'VERIFIED',
      populationSource: 'gmail_discoveries',
      whyIncluded: 'discoveries@',
      metadata: { skipKey: 'wine-down', ticketUrl: 'https://jukehousekc.com/tickets' },
    });
    const merged = dedupePopulationCandidates([ig, site]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]!.sourceRecordType, 'content_item');
    assert.equal(merged[0]!.verificationState, 'VERIFIED');
    assert.match(merged[0]!.whyIncluded ?? '', /Instagram Watchlist/);
    assert.match(merged[0]!.whyIncluded ?? '', /discoveries@/);
  });

  it('does not merge unrelated same-day cards that only share two title tokens', () => {
    const moroney = candidate({
      title: 'Megan Moroney Concert',
      location: 'Kansas City',
      occurrenceFingerprint: 'fp-mm',
      idempotencyKey: 'skip:mm',
      metadata: { skipKey: 'mm' },
    });
    const orlando = candidate({
      title: 'Rising country star Megan Moroney rolls into Orlando',
      location: 'Kansas City',
      occurrenceFingerprint: 'fp-orl',
      idempotencyKey: 'skip:orl',
      metadata: { skipKey: 'orl' },
    });
    const merged = dedupePopulationCandidates([moroney, orlando]);
    assert.equal(merged.length, 2);
  });

  it('merges Megan Moroney Cloud 9 Tour copies into one card', () => {
    const short = candidate({
      title: 'Megan Moroney Concert',
      location: 'Kansas City',
      occurrenceFingerprint: 'fp-mm-short',
      idempotencyKey: 'skip:mm-short',
      metadata: { skipKey: 'mm-short' },
    });
    const tour = candidate({
      title: 'Megan Moroney: The Cloud 9 Tour at T-Mobile Center',
      location: 'Kansas City, MO',
      occurrenceFingerprint: 'fp-mm-tour',
      idempotencyKey: 'skip:mm-tour',
      sourceRecordType: 'content_item',
      sourceRecordId: '00000000-0000-4000-8000-000000000901',
      metadata: { skipKey: 'mm-tour' },
    });
    const merged = dedupePopulationCandidates([short, tour]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]!.sourceRecordType, 'content_item');
  });

  it('merges Cloud 9 Tour copies across UTC midnight vs Chicago evening', () => {
    const evening = candidate({
      title: "Megan Moroney's The Cloud 9 Tour",
      startAt: '2026-08-16T05:00:00.000Z',
      location: 'Kansas City',
      occurrenceFingerprint: 'fp-mm-eve',
      idempotencyKey: 'skip:mm-eve',
      metadata: { skipKey: 'mm-eve' },
    });
    const midnight = candidate({
      title: 'Megan Moroney: The Cloud 9 Tour at T-Mobile Center',
      startAt: '2026-08-17T00:00:00.000Z',
      location: 'Kansas City, MO',
      occurrenceFingerprint: 'fp-mm-mid',
      idempotencyKey: 'skip:mm-mid',
      sourceRecordType: 'content_item',
      sourceRecordId: '00000000-0000-4000-8000-000000000902',
      metadata: { skipKey: 'mm-mid' },
    });
    const guests = candidate({
      title: 'Megan Moroney: The Cloud 9 Tour with JP Saxe and Solon Holt',
      startAt: '2026-08-17T00:00:00.000Z',
      location: 'Kansas City, MO',
      occurrenceFingerprint: 'fp-mm-g',
      idempotencyKey: 'skip:mm-g',
      metadata: { skipKey: 'mm-g' },
    });
    const merged = dedupePopulationCandidates([evening, midnight, guests]);
    assert.equal(merged.length, 1);
  });

  it('keeps distinct events on the same day', () => {
    const wine = candidate({});
    const pickle = candidate({
      title: 'BPCofKC Pickleball Meet-up',
      location: 'KC Pickle Club',
      occurrenceFingerprint: 'fp-pickle',
      idempotencyKey: 'skip:pickle',
      metadata: { skipKey: 'pickle' },
    });
    const merged = dedupePopulationCandidates([wine, pickle]);
    assert.equal(merged.length, 2);
  });

  it('upgrades verification when official evidence arrives', () => {
    const out = mergeCandidates(
      candidate({ verificationState: 'SOCIAL_LEAD' }),
      candidate({
        sourceRecordType: 'content_item',
        sourceRecordId: '00000000-0000-4000-8000-000000000801',
        verificationState: 'VERIFIED',
        sourceUrl: 'https://official.example/event',
      }),
    );
    assert.equal(out.verificationState, 'VERIFIED');
    assert.equal(out.sourceRecordType, 'content_item');
  });
});

function existingRow(
  overrides: Partial<{
    allDay: boolean;
    planningStatus: string;
    userEditedAt: Date | null;
    createdBy: string;
    populationSource: string | null;
  }> = {},
) {
  return {
    allDay: true,
    planningStatus: 'suggested',
    userEditedAt: null as Date | null,
    createdBy: 'benson_inventory',
    populationSource: 'content_item' as string | null,
    ...overrides,
  };
}

describe('upsertSuggestion allDay refresh on existing mutable rows', () => {
  it('updates suggested allDay=true → false from candidate (no create)', () => {
    const plan = planSuggestionUpsertAllDay(existingRow({ allDay: true }), { allDay: false });
    assert.deepEqual(plan, { outcome: 'updated', allDay: false, previousAllDay: true });
  });

  it('updates suggested allDay=false → true from candidate', () => {
    const plan = planSuggestionUpsertAllDay(existingRow({ allDay: false }), { allDay: true });
    assert.deepEqual(plan, { outcome: 'updated', allDay: true, previousAllDay: false });
  });

  it('is idempotent when existing already matches candidate', () => {
    const plan = planSuggestionUpsertAllDay(existingRow({ allDay: false }), { allDay: false });
    assert.deepEqual(plan, { outcome: 'updated', allDay: false, previousAllDay: false });
  });

  it('preserves confirmed rows (allDay not overwritten)', () => {
    const plan = planSuggestionUpsertAllDay(
      existingRow({ allDay: true, planningStatus: 'confirmed' }),
      { allDay: false },
    );
    assert.deepEqual(plan, { outcome: 'preserved', allDay: true });
    assert.equal(
      isProtectedCalendarSuggestion(existingRow({ planningStatus: 'confirmed' })),
      true,
    );
  });

  it('preserves user-edited rows', () => {
    const plan = planSuggestionUpsertAllDay(
      existingRow({ allDay: true, userEditedAt: new Date('2026-08-20T12:00:00.000Z') }),
      { allDay: false },
    );
    assert.deepEqual(plan, { outcome: 'preserved', allDay: true });
  });

  it('preserves operator/manual kellie rows without populationSource', () => {
    const plan = planSuggestionUpsertAllDay(
      existingRow({
        allDay: true,
        createdBy: 'kellie',
        populationSource: null,
      }),
      { allDay: false },
    );
    assert.deepEqual(plan, { outcome: 'preserved', allDay: true });
    assert.equal(
      isProtectedCalendarSuggestion(
        existingRow({ createdBy: 'kellie', populationSource: null }),
      ),
      true,
    );
  });

  it('creates with candidate allDay when no existing row (still no replacement semantics)', () => {
    const plan = planSuggestionUpsertAllDay(null, { allDay: false });
    assert.deepEqual(plan, { outcome: 'created', allDay: false });
  });

  it('tentative Benson rows remain refreshable', () => {
    const plan = planSuggestionUpsertAllDay(
      existingRow({ allDay: true, planningStatus: 'tentative' }),
      { allDay: false },
    );
    assert.deepEqual(plan, { outcome: 'updated', allDay: false, previousAllDay: true });
  });
});
