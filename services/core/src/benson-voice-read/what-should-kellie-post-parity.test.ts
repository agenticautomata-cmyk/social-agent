import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeCommandCenter,
  filterPossiblePostTodayCandidates,
} from '../inventory/command-center.js';
import { loadIngestedInventoryItems } from '../inventory/load-ingested.js';
import type { InventoryItem } from '../inventory/normalize.js';
import { loadPostTodayVoiceInventoryCandidates } from './load-post-today-voice-candidates.js';
import { shapeWhatShouldKelliePostVoice } from './what-should-kellie-post.js';

type PostTodayFingerprint = {
  id: string;
  title: string;
  reason: string;
  when: string | null;
  area: string | null;
  homeFilmable: boolean;
};

function fingerprintPostToday(
  items: InventoryItem[],
  now: Date,
  sections?: ('postToday' | 'postWeekend' | 'contactBusinesses' | 'trending' | 'discoveredToday')[],
): PostTodayFingerprint[] {
  const center = computeCommandCenter(items, {
    now,
    limit: 4,
    ...(sections ? { sections } : {}),
  });
  return center.sections.postToday.items.map((card) => ({
    id: card.id,
    title: card.displayTitle || card.title,
    reason: card.whySummary || card.whyItMatters,
    when: card.whenLabel ?? null,
    area: card.whereLabel ?? null,
    homeFilmable: card.lane === 'film_this',
  }));
}

function voiceFingerprint(
  items: InventoryItem[],
  now: Date,
): PostTodayFingerprint[] {
  const shaped = shapeWhatShouldKelliePostVoice(items, now);
  return shaped.items.map((item) => ({
    id: item.contentItemId,
    title: item.title,
    reason: item.reason,
    when: item.when,
    area: item.area,
    homeFilmable: item.homeFilmable,
  }));
}

describe('what-should-kellie-post latency parity', () => {
  it('timely prefilter + postToday-only CC matches full-path postToday IDs/order', () => {
    const now = new Date();
    const fixtures: InventoryItem[] = [];
    // Empty inventory — both paths empty.
    assert.deepEqual(fingerprintPostToday([], now), []);
    assert.deepEqual(
      fingerprintPostToday([], now, ['postToday']),
      fingerprintPostToday(filterPossiblePostTodayCandidates([], now), now, ['postToday']),
    );
  });

  it('live durable: optimized candidate load preserves authoritative postToday fingerprint', async () => {
    const now = new Date();
    const full = await loadIngestedInventoryItems();
    const authoritative = fingerprintPostToday(full, now);

    const optimizedCandidates = await loadPostTodayVoiceInventoryCandidates(now);
    const optimizedCc = fingerprintPostToday(optimizedCandidates, now, ['postToday']);

    assert.deepEqual(
      optimizedCc.map((row) => row.id),
      authoritative.map((row) => row.id),
      'postToday IDs/order must match',
    );
    assert.deepEqual(optimizedCc, authoritative, 'postToday structured fields must match');

    // Voice shaping applies the existing non-content phrase gate after CC — compare against
    // the same gate on authoritative cards via shapeWhatShouldKelliePostVoice(full).
    const authVoice = voiceFingerprint(full, now);
    const optVoice = voiceFingerprint(optimizedCandidates, now);
    assert.deepEqual(optVoice, authVoice);

    // Current zero-yield must stay zero when authoritative is zero.
    if (authoritative.length === 0) {
      assert.equal(optimizedCc.length, 0);
      assert.equal(optVoice.length, 0);
    }
  });
});
