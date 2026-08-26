import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  homeTopPickPrimaryAction,
  isUsableTopPickSourceUrl,
  shapeHomeTopPicks,
} from './top-pick-actions.js';
import type { TopOpportunity } from '../opportunity-scoring/index.js';

function opp(overrides: Partial<TopOpportunity>): TopOpportunity {
  return {
    id: overrides.id ?? '00000000-0000-4000-8000-000000000001',
    title: overrides.title ?? 'Time Travelers Vintage Expo',
    category: overrides.category ?? 'Event',
    location: overrides.location ?? 'KCI Expo Center',
    eventDate: overrides.eventDate ?? '2026-09-25T00:00:00.000Z',
    composite: overrides.composite ?? 82,
    rationale: overrides.rationale ?? 'Highly visual vintage market with strong local-shopping/content potential.',
    sourceUrl: Object.prototype.hasOwnProperty.call(overrides, 'sourceUrl')
      ? (overrides.sourceUrl ?? null)
      : 'https://example.com/vintage-expo',
  };
}

describe('Home Top Pick actionability', () => {
  it('requires a real http(s) source URL', () => {
    assert.equal(isUsableTopPickSourceUrl('https://rockislandkc.com/events'), true);
    assert.equal(isUsableTopPickSourceUrl('http://example.com/x'), true);
    assert.equal(isUsableTopPickSourceUrl(null), false);
    assert.equal(isUsableTopPickSourceUrl(''), false);
    assert.equal(isUsableTopPickSourceUrl('not-a-url'), false);
    assert.equal(isUsableTopPickSourceUrl('javascript:alert(1)'), false);
  });

  it('live fixtures get Add to Things To Do when dated/event-like', () => {
    for (const title of [
      'This got wild, orange parade',
      'New Media Tech Museum opening this Monday at 1600 Baltimore in the Crossroads',
      'Time Travelers Vintage Expo',
    ]) {
      const action = homeTopPickPrimaryAction({
        title,
        category: 'Event',
        eventDate: '2026-09-25T00:00:00.000Z',
      });
      assert.equal(action.key, 'add_to_today');
      assert.equal(action.label, 'Add to Things To Do');
    }
  });

  it('live Home metadata still maps to a useful primary CTA', () => {
    assert.equal(
      homeTopPickPrimaryAction({
        title: 'This got wild, orange parade',
        category: 'festival',
        eventDate: null,
      }).label,
      'Add to Things To Do',
    );
    assert.equal(
      homeTopPickPrimaryAction({
        title: 'New Media Tech Museum opening this Monday at 1600 Baltimore in the Crossroads',
        category: 'restaurant_opening',
        eventDate: null,
      }).label,
      'Add to Things To Do',
    );
    assert.equal(
      homeTopPickPrimaryAction({
        title: 'Time Travelers Vintage Expo',
        category: 'Vintage Market',
        eventDate: '2026-09-26T00:00:00.000Z',
      }).label,
      'Add to Things To Do',
    );
  });

  it('suppresses source-less recommendations instead of keeping them as Top Picks', () => {
    const shaped = shapeHomeTopPicks(
      [
        opp({ id: 'a', title: 'No source parade', sourceUrl: null }),
        opp({ id: 'b', title: 'Time Travelers Vintage Expo', sourceUrl: 'https://example.com/expo' }),
      ],
      new Map(),
      3,
    );
    assert.equal(shaped.length, 1);
    assert.equal(shaped[0]!.id, 'b');
    assert.ok(shaped[0]!.sourceUrl);
    assert.equal(shaped[0]!.primaryAction.label, 'Add to Things To Do');
  });

  it('does not invent a mismatched shopping CTA for an event pick', () => {
    const action = homeTopPickPrimaryAction({
      title: 'This got wild, orange parade',
      category: 'Shopping Find',
      eventDate: '2026-08-20T00:00:00.000Z',
    });
    assert.equal(action.label, 'Add to Things To Do');
    assert.notEqual(action.label, 'Review details');
  });

  it('creator program and existing planner items get matching CTAs', () => {
    assert.equal(
      homeTopPickPrimaryAction({
        title: 'Amazon Influencer Program',
        category: 'creator_partnership',
        eventDate: null,
      }).label,
      'Open program',
    );
    assert.equal(
      homeTopPickPrimaryAction({
        title: 'Time Travelers Vintage Expo',
        category: 'Event',
        eventDate: '2026-09-25T00:00:00.000Z',
        plannerListName: 'Today',
      }).label,
      'Open plan',
    );
  });

  it('keeps scoring order: first sourced items win, unsourced are skipped', () => {
    const shaped = shapeHomeTopPicks(
      [
        opp({ id: '1', title: 'High score no url', composite: 99, sourceUrl: null }),
        opp({ id: '2', title: 'Orange parade', composite: 90, sourceUrl: 'https://example.com/parade' }),
        opp({ id: '3', title: 'Museum opening', composite: 80, sourceUrl: 'https://example.com/museum' }),
      ],
      new Map(),
      3,
    );
    assert.deepEqual(
      shaped.map((row) => row.id),
      ['2', '3'],
    );
  });
});
