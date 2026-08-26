import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyInstagramWatchInspection,
  formatInstagramWatchInspectionSummary,
  instagramWatchInspectionSucceeded,
  isInstagramAccountWatchSource,
} from './watch-inspection.js';
import {
  collectInstagramPostUrls,
  extractInstagramPostHrefsFromHtml,
  extractInstagramShortcodesFromJsonBlob,
  instagramPostIdentityKeys,
  instagramShortcode,
  isInstagramPostOrReelUrl,
} from './instagram-url.js';

describe('Instagram watch inspection accounting', () => {
  it('does not treat empty discovery as a successful inspection', () => {
    const inspection = emptyInstagramWatchInspection({
      profileOpened: true,
      postsDiscovered: 0,
    });
    assert.equal(instagramWatchInspectionSucceeded(inspection), false);
    assert.match(
      formatInstagramWatchInspectionSummary(inspection),
      /opened the profile but found no recent posts to inspect/i,
    );
  });

  it('treats already-processed posts as a real successful check', () => {
    const inspection = emptyInstagramWatchInspection({
      profileOpened: true,
      postsDiscovered: 12,
      alreadyKnown: 12,
      newlyInspected: 0,
      skipped: Array.from({ length: 12 }, (_, i) => ({
        url: `https://www.instagram.com/p/ABC${i}/`,
        reason: 'already_processed',
      })),
    });
    assert.equal(instagramWatchInspectionSucceeded(inspection), true);
    assert.equal(
      formatInstagramWatchInspectionSummary(inspection),
      'Checked 12 recent posts · 12 already processed · 0 new',
    );
  });

  it('does not treat all-capture-failures as success', () => {
    const inspection = emptyInstagramWatchInspection({
      profileOpened: true,
      postsDiscovered: 4,
      failed: [
        { url: 'https://www.instagram.com/reel/Dbvpv76C13F/', reason: 'Timeout 35000ms exceeded' },
        { url: 'https://www.instagram.com/p/AAA/', reason: 'capture_failed' },
        { url: 'https://www.instagram.com/p/BBB/', reason: 'capture_failed' },
        { url: 'https://www.instagram.com/p/CCC/', reason: 'capture_failed' },
      ],
    });
    assert.equal(instagramWatchInspectionSucceeded(inspection), false);
    assert.match(formatInstagramWatchInspectionSummary(inspection), /4 failed/);
  });

  it('closed profile is not a successful inspection', () => {
    const inspection = emptyInstagramWatchInspection();
    assert.equal(instagramWatchInspectionSucceeded(inspection), false);
    assert.match(formatInstagramWatchInspectionSummary(inspection), /could not open/i);
  });
});

describe('Instagram post URL collection', () => {
  it('collects handle-prefixed and reel URLs and dedupes by shortcode', () => {
    const urls = collectInstagramPostUrls(
      [
        'https://www.instagram.com/kclifestylegirl/reel/Dbvpv76C13F/',
        '/p/Dbvpv76C13F/',
        'https://www.instagram.com/reel/Dbvpv76C13F/?igsh=abc',
        'https://www.instagram.com/kclifestylegirl/p/OTHERCODE11/',
      ],
      12,
    );
    assert.equal(urls.length, 2);
    assert.ok(urls.some((u) => instagramShortcode(u) === 'Dbvpv76C13F'));
    assert.ok(urls.some((u) => instagramShortcode(u) === 'OTHERCODE11'));
  });

  it('extracts post paths from HTML when anchor hrefs are missing', () => {
    const hrefs = extractInstagramPostHrefsFromHtml(
      '<a href="/jasfoodjourney/p/DbLYAWGnLPD/">x</a><link href="https://www.instagram.com/reel/Db4GduPJ_ah/">',
    );
    const urls = collectInstagramPostUrls(hrefs, 12);
    assert.equal(urls.length, 2);
  });

  it('extracts shortcodes from GraphQL-like JSON', () => {
    const codes = extractInstagramShortcodesFromJsonBlob(
      '{"data":{"code":"Dbvpv76C13F","shortcode":"DbLYAWGnLPD"}}',
    );
    assert.deepEqual(codes.sort(), ['DbLYAWGnLPD', 'Dbvpv76C13F'].sort());
  });

  it('rejects profile Reels tab URLs that are not posts', () => {
    assert.equal(isInstagramPostOrReelUrl('https://www.instagram.com/reels/'), false);
    assert.equal(isInstagramPostOrReelUrl('https://www.instagram.com/kclifestylegirl/reels/'), false);
    assert.equal(collectInstagramPostUrls(['https://www.instagram.com/reels/', '/kclifestylegirl/reels/'], 12).length, 0);
  });

  it('treats /p/ and /reel/ of the same shortcode as the same post', () => {
    const a = instagramPostIdentityKeys('https://www.instagram.com/p/Dbvpv76C13F/');
    const b = instagramPostIdentityKeys('https://www.instagram.com/reel/Dbvpv76C13F/');
    assert.ok(a.includes('Dbvpv76C13F'));
    assert.ok(b.includes('Dbvpv76C13F'));
  });
});

describe('Instagram account watch-source identity', () => {
  it('identifies Watchlist Instagram accounts so HTML early-signals cannot fake a successful check', () => {
    assert.equal(
      isInstagramAccountWatchSource({
        platform: 'instagram',
        adapterType: 'social_account',
        watcherKind: 'generic',
        monitoringMode: 'WATCH_ACCOUNT',
      }),
      true,
    );
    assert.equal(
      isInstagramAccountWatchSource({
        platform: 'instagram',
        adapterType: 'html_watch',
        monitoringMode: 'WATCH_PAGE',
      }),
      false,
    );
    assert.equal(
      isInstagramAccountWatchSource({
        platform: 'web',
        adapterType: 'html_watch',
        monitoringMode: 'WATCH_PAGE',
      }),
      false,
    );
  });
});
