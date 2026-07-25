import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { COVERAGE_FORMATS, COVERAGE_FORMAT_LABELS, parseCoverageFormat } from './constants.js';
import { recommendCoverageFormat } from './recommend.js';

describe('coverage format constants', () => {
  it('parses every coverage format value', () => {
    for (const value of COVERAGE_FORMATS) {
      assert.equal(parseCoverageFormat(value), value);
    }
  });

  it('returns null for unknown values', () => {
    assert.equal(parseCoverageFormat('unknown'), null);
    assert.equal(parseCoverageFormat(null), null);
    assert.equal(parseCoverageFormat(undefined), null);
  });

  it('preserves backward compatibility for unassigned opportunities', () => {
    assert.equal(parseCoverageFormat(''), null);
  });

  it('labels every coverage format for UI display', () => {
    for (const value of COVERAGE_FORMATS) {
      assert.ok(COVERAGE_FORMAT_LABELS[value]);
    }
  });
});

describe('recommendCoverageFormat', () => {
  it('recommends green_screen for press release announcements', () => {
    const rec = recommendCoverageFormat({
      title: 'New coffee shop press release announced for Brookside',
      summary: 'Grand opening announcement with date confirmed by the business.',
      category: 'coffee_opening',
      eventStartsAt: new Date('2026-08-01'),
    });
    assert.equal(rec, 'green_screen_then_visit');
  });

  it('recommends field_visit when experience is the story', () => {
    const rec = recommendCoverageFormat({
      title: 'Hidden gem taco spot review POV',
      summary: 'Best taste test and atmosphere walkthrough downtown.',
    });
    assert.equal(rec, 'field_visit');
  });
});
