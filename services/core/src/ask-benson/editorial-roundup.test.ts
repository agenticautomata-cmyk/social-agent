import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  editorialRoundupPlace,
  editorialRoundupSeason,
  extractRoundupYear,
  isEditorialRoundupUrl,
  isStaleEditorialRoundup,
  looksLikeEditorialSlug,
} from './editorial-roundup.js';

const KC_STUDIO_URL = 'https://kcstudio.org/top-things-to-do-this-summer-2025/';
const AUG_2026 = new Date('2026-08-12T12:00:00.000Z');

describe('editorial roundup URL classification', () => {
  it('classifies KC Studio summer roundup as editorial, not a brand slug', () => {
    assert.equal(isEditorialRoundupUrl(KC_STUDIO_URL), true);
    assert.equal(looksLikeEditorialSlug('top-things-to-do-this-summer-2025'), true);
    assert.equal(extractRoundupYear(KC_STUDIO_URL), 2025);
    assert.equal(editorialRoundupPlace(KC_STUDIO_URL), 'KC');
    assert.equal(editorialRoundupSeason(KC_STUDIO_URL), 'summer');
    assert.equal(isStaleEditorialRoundup(KC_STUDIO_URL, null, AUG_2026), true);
  });

  it('does not treat commerce product slugs or event calendars as editorial roundups', () => {
    assert.equal(looksLikeEditorialSlug('what goes around comes around'), false);
    assert.equal(isEditorialRoundupUrl('https://www.scheels.com/c/all/b/what%20goes%20around%20comes%20around'), false);
    assert.equal(isEditorialRoundupUrl('https://www.theosc.co/events'), false);
    assert.equal(isEditorialRoundupUrl('https://www.jared.com/jewelry/handbags/c/7000001712'), false);
  });

  it('a current-year roundup is not stale', () => {
    const url = 'https://kcstudio.org/top-things-to-do-this-summer-2026/';
    assert.equal(isEditorialRoundupUrl(url), true);
    assert.equal(isStaleEditorialRoundup(url, null, AUG_2026), false);
  });
});
