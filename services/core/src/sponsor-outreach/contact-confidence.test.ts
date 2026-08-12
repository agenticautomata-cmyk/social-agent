import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { contactConfidenceForStatus, noContactFoundMessage } from './contact-confidence.js';

describe('contactConfidenceForStatus', () => {
  it('treats verified statuses as high confidence and usable', () => {
    const result = contactConfidenceForStatus('verified_appropriate');
    assert.equal(result.tier, 'high');
    assert.equal(result.usable, true);
  });

  it('treats an official contact form as medium confidence and usable', () => {
    const result = contactConfidenceForStatus('contact_form');
    assert.equal(result.tier, 'medium');
    assert.equal(result.usable, true);
  });

  it('treats found-but-unverified as low confidence and NOT usable for a "has contact" badge', () => {
    // A person's name alone is not a contact — see north-star spec item 3.
    const result = contactConfidenceForStatus('found_unverified');
    assert.equal(result.tier, 'low');
    assert.equal(result.usable, false);
  });

  it('treats missing/invalid/unknown statuses as no confidence', () => {
    assert.equal(contactConfidenceForStatus('missing').tier, 'none');
    assert.equal(contactConfidenceForStatus('invalid').tier, 'none');
    assert.equal(contactConfidenceForStatus(null).tier, 'none');
    assert.equal(contactConfidenceForStatus(undefined).tier, 'none');
    assert.equal(contactConfidenceForStatus('some_unknown_future_value').tier, 'none');
  });
});

describe('noContactFoundMessage', () => {
  it('mentions the official website form when one is available', () => {
    assert.equal(
      noContactFoundMessage(true),
      'No verified media or PR contact found. Official website form available.',
    );
  });

  it('omits the form mention when there is no official website', () => {
    assert.equal(noContactFoundMessage(false), 'No verified media or PR contact found.');
  });
});
