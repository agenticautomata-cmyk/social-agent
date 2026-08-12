import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInstagramPostText,
  instagramHandleFromUrl,
  isInstagramUrl,
} from './instagram-intake.js';
import { inferBusinessName } from './url-entity-opportunity.js';
import type { CapturedSocialPost } from '../curator-watchlist/types.js';

function post(overrides: Partial<CapturedSocialPost> = {}): CapturedSocialPost {
  return {
    postUrl: 'https://www.instagram.com/p/DMabc123/',
    profileHandle: 'kcparksrec',
    publishedAt: '2026-07-27T15:00:00.000Z',
    caption: 'Free jazz in the park this Saturday at Loose Park, 6pm!',
    postType: 'single',
    sourceFingerprint: 'abc',
    outboundLinks: ['https://kcparks.org/events'],
    ephemeralSource: false,
    slideImageUrls: [],
    ...overrides,
  };
}

describe('instagram-intake', () => {
  it('recognizes instagram post, reel, and profile URLs', () => {
    assert.equal(isInstagramUrl('https://www.instagram.com/p/DMabc123/'), true);
    assert.equal(isInstagramUrl('https://instagram.com/reel/DMabc123/'), true);
    assert.equal(isInstagramUrl('https://www.instagram.com/kcparksrec/'), true);
    assert.equal(isInstagramUrl('https://www.silkroadkc.com/'), false);
    assert.equal(isInstagramUrl('not a url'), false);
  });

  it('pulls the account handle from post, reel, and profile URLs', () => {
    assert.equal(instagramHandleFromUrl('https://www.instagram.com/kcparksrec/'), 'kcparksrec');
    assert.equal(instagramHandleFromUrl('https://www.instagram.com/kcparksrec'), 'kcparksrec');
    assert.equal(
      instagramHandleFromUrl('https://www.instagram.com/jasfoodjourney/p/DbLYAWGnLPD/'),
      'jasfoodjourney',
    );
    // Short post URLs carry no handle in the path — resolved from the page at capture time.
    assert.equal(instagramHandleFromUrl('https://www.instagram.com/p/DMabc123/'), null);
    assert.equal(instagramHandleFromUrl('https://www.instagram.com/reel/DMabc123/'), null);
  });

  it('gives the extractor both post date and today so relative dates resolve', () => {
    const text = buildInstagramPostText(post(), [], new Date('2026-07-29T12:00:00.000Z'));
    assert.match(text, /Posted at: 2026-07-27/);
    assert.match(text, /Today's date: 2026-07-29/);
    assert.match(text, /this Saturday/);
    assert.match(text, /@kcparksrec/);
    assert.match(text, /kcparks\.org\/events/);
  });

  it('includes OCR text from carousel slides', () => {
    const text = buildInstagramPostText(
      post({ postType: 'carousel', slideImageUrls: ['a.jpg', 'b.jpg'] }),
      ['FRIDAY — First Fridays, Crossroads, 5pm', 'SATURDAY — Jazz in the Park, Loose Park'],
    );
    assert.match(text, /Slide 1 text:/);
    assert.match(text, /First Fridays/);
    assert.match(text, /Slide 2 text:/);
    assert.match(text, /Jazz in the Park/);
  });

  it('attributes instagram links to the account, not to "Instagram"', () => {
    assert.equal(
      inferBusinessName({
        domain: 'instagram.com',
        sourceUrl: 'https://www.instagram.com/kcparksrec/',
        pageTitle: null,
      }),
      '@kcparksrec',
    );
  });
});
