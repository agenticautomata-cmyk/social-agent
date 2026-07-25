import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectPlatform, inspectSubmittedUrl, watcherFingerprint } from './url-inspect.js';

describe('benson-scout url-inspect', () => {
  it('detects Instagram post as single item with account watch option', () => {
    const result = inspectSubmittedUrl('https://www.instagram.com/p/ABC123xyz/');
    assert.equal(result.platform, 'instagram');
    assert.equal(result.sourceType, 'social_post');
    assert.equal(result.isSingleItem, true);
    assert.ok(result.monitoringModes.includes('SINGLE_ITEM'));
    assert.ok(result.monitoringModes.includes('WATCH_ACCOUNT'));
    assert.equal(result.recommendedMode, 'SINGLE_ITEM');
    assert.equal(result.loginRequired, true);
  });

  it('detects Instagram profile as account watch', () => {
    const result = inspectSubmittedUrl('https://www.instagram.com/crossroadskc/');
    assert.equal(result.sourceType, 'social_account');
    assert.equal(result.recommendedMode, 'WATCH_ACCOUNT');
    assert.equal(result.isSingleItem, false);
  });

  it('detects RSS feed', () => {
    const result = inspectSubmittedUrl('https://example.com/events/feed.xml');
    assert.equal(result.platform, 'rss');
    assert.equal(result.extractionMethod, 'rss_adapter');
    assert.equal(result.loginRequired, false);
  });

  it('detects PDF document', () => {
    const result = inspectSubmittedUrl('https://kcmo.gov/files/planning-packet.pdf');
    assert.equal(result.platform, 'pdf');
    assert.equal(result.extractionMethod, 'document_queue');
  });

  it('offers page watch for generic web URLs', () => {
    const result = inspectSubmittedUrl('https://unionstation.org/events/');
    assert.equal(result.platform, 'web');
    assert.ok(result.monitoringModes.includes('WATCH_PAGE'));
    assert.equal(result.loginRequired, false);
  });

  it('rejects invalid URLs', () => {
    assert.throws(() => inspectSubmittedUrl('not-a-url'), /Invalid URL/);
    assert.throws(() => inspectSubmittedUrl('file:///etc/passwd'), /Only http and https/);
  });

  it('produces stable watcher fingerprints', () => {
    const a = watcherFingerprint('https://example.com/events', 'WATCH_PAGE');
    const b = watcherFingerprint('https://example.com/events', 'WATCH_PAGE');
    const c = watcherFingerprint('https://example.com/events', 'SINGLE_ITEM');
    assert.equal(a, b);
    assert.notEqual(a, c);
  });

  it('detectPlatform covers major platforms', () => {
    assert.equal(detectPlatform('https://facebook.com/kcplaza'), 'facebook');
    assert.equal(detectPlatform('https://tiktok.com/@kcmo'), 'tiktok');
    assert.equal(detectPlatform('https://news.com/rss.xml'), 'rss');
  });
});
