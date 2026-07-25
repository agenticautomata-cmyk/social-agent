import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractUrlsFromHtml,
  extractUrlsFromText,
  extractVerificationCode,
  pickConfirmationLink,
  sanitizeUrlForDisplay,
} from './extract.js';

describe('extract confirmation content', () => {
  it('extracts plain-text confirmation links', () => {
    const urls = extractUrlsFromText('Confirm here: https://example.com/confirm?token=abc123.');
    assert.equal(urls[0], 'https://example.com/confirm?token=abc123');
  });

  it('extracts HTML confirmation button URLs', () => {
    const urls = extractUrlsFromHtml(
      '<a href="https://mail.example.com/activate?u=1">Verify email</a>',
    );
    assert.equal(urls[0], 'https://mail.example.com/activate?u=1');
  });

  it('prefers confirm links over unsubscribe links', () => {
    const link = pickConfirmationLink([
      'https://example.com/unsubscribe?id=1',
      'https://example.com/confirm?token=abc',
    ]);
    assert.match(link ?? '', /confirm/);
  });

  it('extracts one-time verification codes', () => {
    assert.equal(
      extractVerificationCode('Enter this verification code: 839201'),
      '839201',
    );
  });

  it('sanitizes tokens in display URLs', () => {
    const display = sanitizeUrlForDisplay('https://example.com/confirm?token=supersecret');
    assert.match(display, /token=\*\*\*/);
    assert.doesNotMatch(display, /supersecret/);
  });
});
