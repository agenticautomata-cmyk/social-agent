import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAllowedConfirmationDestination,
  validateConfirmationUrl,
} from './safe-fetch.js';

describe('safe confirmation URL validation', () => {
  it('rejects HTTP links', () => {
    assert.equal(validateConfirmationUrl('http://example.com/confirm'), 'http_not_allowed');
  });

  it('rejects localhost and private hosts', () => {
    assert.equal(validateConfirmationUrl('https://localhost/confirm'), 'private_host');
    assert.equal(validateConfirmationUrl('https://127.0.0.1/confirm'), 'private_host');
    assert.equal(validateConfirmationUrl('https://192.168.1.10/confirm'), 'private_host');
  });

  it('rejects URL shorteners', () => {
    assert.equal(validateConfirmationUrl('https://bit.ly/abc123'), 'url_shortener');
  });

  it('rejects oauth and password paths', () => {
    assert.equal(
      validateConfirmationUrl('https://example.com/oauth/authorize?client_id=1'),
      'unsafe_path',
    );
    assert.equal(validateConfirmationUrl('https://example.com/password/reset'), 'unsafe_path');
    assert.equal(validateConfirmationUrl('https://example.com/checkout/payment'), 'unsafe_path');
  });

  it('allows matching signup domain', () => {
    assert.ok(
      isAllowedConfirmationDestination({
        linkUrl: 'https://news.kcshop.com/confirm',
        signupDomain: 'kcshop.com',
        senderDomain: 'mail.kcshop.com',
      }),
    );
  });

  it('rejects mismatched destination domains', () => {
    assert.equal(
      isAllowedConfirmationDestination({
        linkUrl: 'https://totally-other.com/confirm',
        signupDomain: 'kcshop.com',
        senderDomain: 'kcshop.com',
      }),
      false,
    );
  });

  it('allows recognized ESP domains', () => {
    assert.ok(
      isAllowedConfirmationDestination({
        linkUrl: 'https://us10.list-manage.com/subscribe/confirm',
        signupDomain: 'unknown.org',
        senderDomain: 'unknown.org',
      }),
    );
  });
});
