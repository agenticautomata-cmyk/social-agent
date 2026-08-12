import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectObituaryOrDeathContent, isObituaryOrDeathContent } from './obituary-gate.js';
import { normalizeArticleOpening } from '../providers/business-openings-shared.js';

// Exact visible-text pattern reported from production: Charles Edward Carson
// obituary was misclassified as BOUTIQUE_OPENING.
const CARSON_OBITUARY_TEXT = `Charles Edward Carson, 78, of Overland Park, passed away peacefully on July 28, 2026, with
his family by his side. He was born on March 2, 1948, in Kansas City, Missouri. Charles is survived
by his wife, three children, and five grandchildren. A celebration of life will be held at 14485
Ridgeview Rd. Visitation will be held the evening prior. In lieu of flowers, the family asks for
donations to the American Heart Association. Condolences may be shared with the family online.`;

describe('obituary hard gate', () => {
  it('detects the exact production obituary text as obituary content', () => {
    const result = detectObituaryOrDeathContent(CARSON_OBITUARY_TEXT);
    assert.equal(result.isObituary, true);
    for (const indicator of ['passed_away', 'survived_by', 'celebration_of_life', 'condolences']) {
      assert.ok(result.matchedIndicators.includes(indicator), `expected ${indicator} to be matched`);
    }
  });

  it('flags common obituary phrasing variants', () => {
    assert.equal(isObituaryOrDeathContent('John Smith Obituary'), true);
    assert.equal(isObituaryOrDeathContent('Jane Doe died peacefully at home'), true);
    assert.equal(isObituaryOrDeathContent('Funeral service scheduled for next week'), true);
    assert.equal(isObituaryOrDeathContent('He was preceded in death by his parents'), true);
    assert.equal(isObituaryOrDeathContent('Memorial service to be held Friday'), true);
  });

  it('does not flag ordinary business-opening text', () => {
    assert.equal(isObituaryOrDeathContent('New boutique opens on the Plaza this weekend'), false);
    assert.equal(isObituaryOrDeathContent('Grand opening celebration for new coffee shop'), false);
  });

  it('never lets classifyOpeningCategory receive obituary text via normalizeArticleOpening', () => {
    const result = normalizeArticleOpening({
      title: 'Charles Edward Carson',
      link: 'https://johnsoncountypost.com/2026/07/30/charles-edward-carson-292891/',
      pubDate: 'Thu, 30 Jul 2026 17:17:54 GMT',
      content: CARSON_OBITUARY_TEXT,
      rawContent: CARSON_OBITUARY_TEXT,
    });
    assert.equal(result, null);
  });

  it('still allows a legitimate boutique opening article through', () => {
    const result = normalizeArticleOpening({
      title: 'New vintage clothing boutique opens on the Plaza',
      link: 'https://example.com/plaza-boutique-opens',
      pubDate: 'Thu, 30 Jul 2026 17:17:54 GMT',
      content: 'The new vintage clothing shop opens its doors this Saturday at the Country Club Plaza.',
      rawContent: 'The new vintage clothing shop opens its doors this Saturday at the Country Club Plaza.',
    });
    assert.ok(result);
    assert.equal(result?.category, 'boutique_opening');
  });
});
