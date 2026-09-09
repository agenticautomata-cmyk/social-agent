import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MEDIA_ACCESS_DEFAULT_DISCLAIMER,
  askTypeIsPaid,
  normalizeCompensationForRoute,
  CONTACT_INTELLIGENCE_UX_STUB,
} from './index.js';

describe('contact-intelligence UX contracts', () => {
  it('only paid_collaboration is a paid ask', () => {
    assert.equal(askTypeIsPaid('paid_collaboration'), true);
    assert.equal(askTypeIsPaid('event_credential'), false);
    assert.equal(askTypeIsPaid('unknown'), false);
  });

  it('downgrades paid compensation on media_access routes', () => {
    assert.equal(
      normalizeCompensationForRoute('media_access', 'paid'),
      'media_access_not_paid',
    );
    assert.equal(normalizeCompensationForRoute('affiliate_program', 'paid'), 'paid');
  });

  it('store is no longer a stub', () => {
    assert.equal(CONTACT_INTELLIGENCE_UX_STUB, false);
  });

  it('media access disclaimer stays explicit', () => {
    assert.match(MEDIA_ACCESS_DEFAULT_DISCLAIMER, /not guaranteed/i);
    assert.match(MEDIA_ACCESS_DEFAULT_DISCLAIMER, /not the same as paid/i);
  });
});
