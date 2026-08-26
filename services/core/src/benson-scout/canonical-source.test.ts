import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizeWatchSource, canonicalWatchSourceKey, extractInstagramHandle } from './canonical-source.js';

describe('canonicalizeWatchSource — Instagram account identity', () => {
  const variants = [
    'instagram.com/jasfoodjourney',
    'www.instagram.com/jasfoodjourney/',
    'https://instagram.com/jasfoodjourney/',
    'https://www.instagram.com/jasfoodjourney/?hl=en',
    'https://www.instagram.com/jasfoodjourney',
    'https://www.instagram.com/JasFoodJourney/',
    'https://www.instagram.com/JASFOODJOURNEY',
    '@jasfoodjourney',
    'jasfoodjourney',
    'https://www.instagram.com/jasfoodjourney/?utm_source=ig_web_copy_link&igsh=abc123',
  ];

  it('resolves every real-world URL/handle variant to the same canonical key', () => {
    const keys = new Set(variants.map((v) => canonicalWatchSourceKey(v)));
    assert.equal(keys.size, 1, `expected one canonical key, got: ${JSON.stringify([...keys])}`);
    assert.equal([...keys][0], 'instagram:account:jasfoodjourney');
  });

  it('produces a clean canonical URL regardless of input shape', () => {
    for (const v of variants) {
      const result = canonicalizeWatchSource(v);
      assert.equal(result.canonicalUrl, 'https://www.instagram.com/jasfoodjourney/');
      assert.equal(result.kind, 'instagram_account');
      assert.equal(result.handle, 'jasfoodjourney');
    }
  });

  it('does not collapse two different accounts into the same key', () => {
    const a = canonicalWatchSourceKey('https://www.instagram.com/jasfoodjourney/');
    const b = canonicalWatchSourceKey('https://www.instagram.com/someoneelse/');
    assert.notEqual(a, b);
  });

  it('resolves kclifestylegirl URL variants including tracking params to one key', () => {
    const variants = [
      'https://instagram.com/kclifestylegirl',
      'https://www.instagram.com/kclifestylegirl/',
      'https://www.instagram.com/kclifestylegirl?igsh=abc123',
      '@kclifestylegirl',
    ];
    const keys = new Set(variants.map((v) => canonicalWatchSourceKey(v)));
    assert.equal(keys.size, 1);
    assert.equal([...keys][0], 'instagram:account:kclifestylegirl');
  });

  it('rejects Instagram post/reel/story paths as account handles', () => {
    assert.equal(extractInstagramHandle('https://www.instagram.com/p/ABC123/'), null);
    assert.equal(extractInstagramHandle('https://www.instagram.com/reel/ABC123/'), null);
    assert.equal(extractInstagramHandle('https://www.instagram.com/stories/someone/123/'), null);
  });
});

describe('canonicalizeWatchSource — TikTok / Facebook / generic web', () => {
  it('normalizes TikTok account handles', () => {
    const a = canonicalWatchSourceKey('https://www.tiktok.com/@kckellie');
    const b = canonicalWatchSourceKey('https://tiktok.com/@KCKellie/');
    assert.equal(a, b);
    assert.equal(a, 'tiktok:account:kckellie');
  });

  it('normalizes Facebook page handles', () => {
    const a = canonicalWatchSourceKey('https://www.facebook.com/somebusiness');
    const b = canonicalWatchSourceKey('https://facebook.com/somebusiness/');
    assert.equal(a, b);
  });

  it('normalizes generic web pages by host+path, ignoring www/query/trailing-slash/case', () => {
    const a = canonicalWatchSourceKey('https://www.example.com/events/');
    const b = canonicalWatchSourceKey('https://example.com/events?utm_source=x');
    const c = canonicalWatchSourceKey('HTTPS://EXAMPLE.COM/events');
    assert.equal(a, b);
    assert.equal(b, c);
  });

  it('treats different paths on the same host as different sources', () => {
    const a = canonicalWatchSourceKey('https://example.com/events');
    const b = canonicalWatchSourceKey('https://example.com/news');
    assert.notEqual(a, b);
  });
});
