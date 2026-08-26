import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  correctionUserMessage,
  detectOperatorCorrection,
} from './operator-correction.js';

describe('operator correction detection', () => {
  it('treats a named taxonomy correction as an event reclassification', () => {
    const detected = detectOperatorCorrection('Panda fest is an event');
    assert.ok(detected);
    assert.equal(detected!.kind, 'taxonomy_event');
    assert.equal(detected!.referent?.toLowerCase(), 'panda fest');
  });

  it('treats this/that event corrections as referring to the active entity', () => {
    const detected = detectOperatorCorrection('that is an event');
    assert.ok(detected);
    assert.equal(detected!.kind, 'taxonomy_event');
    assert.equal(detected!.referent, null);
  });

  it('detects not-a-restaurant and sale taxonomy corrections', () => {
    assert.equal(detectOperatorCorrection('this is not a restaurant')?.kind, 'taxonomy_not_restaurant');
    assert.equal(detectOperatorCorrection("that's a sale, not an event")?.kind, 'taxonomy_sale');
  });

  it('detects date and location corrections without inventing facts', () => {
    assert.equal(detectOperatorCorrection('that date is wrong')?.kind, 'date_wrong');
    const loc = detectOperatorCorrection('this is in Kansas City');
    assert.equal(loc?.kind, 'location');
    assert.equal(loc?.locationScope?.toLowerCase(), 'kansas city');
  });

  it('does not treat a URL paste as a correction', () => {
    assert.equal(
      detectOperatorCorrection('https://www.example.com/events-1/slug is an event'),
      null,
    );
  });

  it('does not treat ordinary chat as a correction', () => {
    assert.equal(detectOperatorCorrection('what should I film this weekend?'), null);
    assert.equal(detectOperatorCorrection('look up Panda fest'), null);
  });

  it('asks intake to re-read official event evidence', () => {
    const msg = correctionUserMessage(
      { kind: 'taxonomy_event', referent: 'Panda fest', locationScope: null },
      'Panda fest is an event',
    );
    assert.match(msg, /official page is a dated event occurrence/i);
    assert.match(msg, /not a restaurant or generic food discovery/i);
  });
});
