import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeLessonCategory } from './normalize-category.js';

describe('normalizeLessonCategory', () => {
  it('passes through valid categories', () => {
    assert.equal(normalizeLessonCategory('performance'), 'performance');
    assert.equal(normalizeLessonCategory('POSTING'), 'posting');
  });

  it('maps common model inventions to valid categories', () => {
    assert.equal(normalizeLessonCategory('event'), 'content');
    assert.equal(normalizeLessonCategory('events'), 'content');
    assert.equal(normalizeLessonCategory('discovery'), 'content');
    assert.equal(normalizeLessonCategory('calendar'), 'timing');
    assert.equal(normalizeLessonCategory('pitch'), 'sponsor');
    assert.equal(normalizeLessonCategory('tiktok'), 'performance');
  });

  it('falls back to content for unknown values', () => {
    assert.equal(normalizeLessonCategory('banana'), 'content');
    assert.equal(normalizeLessonCategory(''), 'content');
  });
});
