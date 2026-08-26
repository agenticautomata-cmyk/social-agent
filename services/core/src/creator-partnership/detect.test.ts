import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isCreatorPartnershipIntake,
  looksLikeProductOrBrandUrl,
  inferNamesFromSubmission,
} from './detect.js';

describe('creator partnership intake detection', () => {
  it('opens creator-opportunity pipeline for commerce candidate URLs without requiring magic words', () => {
    const url = 'https://www.jared.com/jewelry/handbags/c/7000001712?icid=MM:J:ReklaimHandbags';
    assert.equal(looksLikeProductOrBrandUrl(url), true);
    // Bridge: commerce candidates open discovery pipeline; not a hard "is partnership" claim.
    assert.equal(isCreatorPartnershipIntake(url), true);
  });

  it('does not route plain Eventbrite links as partnership by default', () => {
    const url = 'https://www.eventbrite.com/e/some-concert-tickets-123';
    assert.equal(looksLikeProductOrBrandUrl(url), false);
    assert.equal(isCreatorPartnershipIntake(url), false);
  });

  it('detects explicit creator program language', () => {
    assert.equal(
      isCreatorPartnershipIntake('Research this brand creator program https://example.com/shop'),
      true,
    );
  });

  it('routes restaurant menu URL away from partnership', () => {
    assert.equal(isCreatorPartnershipIntake('https://local-cafe.example.com/menu'), false);
  });

  it('routes plural /menus restaurant URL away from partnership', () => {
    assert.equal(isCreatorPartnershipIntake('https://local-cafe.example.com/menus'), false);
    assert.equal(isCreatorPartnershipIntake('https://local-cafe.example.com/menus/'), false);
    assert.equal(isCreatorPartnershipIntake('https://local-cafe.example.com/menus?foo=bar'), false);
  });
});

describe('inferNamesFromSubmission', () => {
  it('infers retailer from jared.com', () => {
    const names = inferNamesFromSubmission({
      url: 'https://www.jared.com/jewelry/handbags/c/7000001712?icid=MM:J:ReklaimHandbags',
      pageTitle: 'Jared The Galleria Of Jewelry',
      userMessage: 'Check this creator partnership opportunity',
    });
    assert.equal(names.retailerName, 'Jared');
    assert.equal(names.brandName, 'REKLAIM');
    assert.match(names.title, /REKLAIM/i);
  });

  it('does not treat an Instagram shortcode path as brandName', () => {
    const names = inferNamesFromSubmission({
      url: 'https://www.instagram.com/p/Dbtacojzn1r/',
      pageTitle: null,
      userMessage: 'https://www.instagram.com/p/Dbtacojzn1r/',
    });
    assert.notEqual((names.brandName ?? '').toLowerCase(), 'dbtacojzn1r');
  });

  it('does not treat an editorial listicle page title as brandName', () => {
    const names = inferNamesFromSubmission({
      url: 'https://example.com/guides/summer',
      pageTitle: 'Top Things To Do This Summer 2025',
      userMessage: 'https://example.com/guides/summer',
    });
    assert.notEqual(names.brandName, 'Top Things To Do This Summer 2025');
  });
});
