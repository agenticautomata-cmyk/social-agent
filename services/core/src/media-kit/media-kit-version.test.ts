import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mediaKitContentHash, canonicalJson } from './content-hash.js';
import { renderMediaKitPdf } from './pdf.js';
import type { MediaKitContent } from './build.js';

describe('mediaKitContentHash', () => {
  it('is stable across key order', () => {
    const a = mediaKitContentHash({ b: 1, a: 2 });
    const b = mediaKitContentHash({ a: 2, b: 1 });
    assert.equal(a, b);
  });

  it('changes when snapshot content changes', () => {
    assert.notEqual(
      mediaKitContentHash({ followers: 100 }),
      mediaKitContentHash({ followers: 101 }),
    );
  });

  it('canonicalJson sorts nested keys', () => {
    assert.equal(canonicalJson({ z: 1, a: { d: 2, c: 3 } }), '{"a":{"c":3,"d":2},"z":1}');
  });
});

describe('renderMediaKitPdf', () => {
  const content: MediaKitContent = {
    variant: 'hotel',
    creatorName: 'Kellie',
    headline: 'Kansas City creator — overnight stays',
    bio: 'Short bio for the PDF test.',
    market: 'Kansas City metro',
    coverage: ['Kansas City, MO'],
    contentCategories: ['Hotels'],
    services: ['One in-feed video'],
    audience: {
      platform: 'TikTok',
      handle: '@kckellie',
      followersAvailable: true,
      followersCount: 6703,
      medianViewsPerPost: 918,
      totalViews: 1000000,
      totalEngagement: 50000,
      postsWithMetrics: 250,
      engagementRatePercent: null,
      lastSyncedAt: '2026-09-01T00:00:00.000Z',
      stale: false,
      usableClaims: ['6,703 TikTok followers'],
      unavailableReason: null,
    },
    examples: [
      {
        title: 'Rooftop stay',
        url: null,
        views: 5000,
        engagement: 200,
        postedAt: '2026-08-01T00:00:00.000Z',
      },
    ],
    examplesNote: 'Test',
    verifiedPartnerships: [],
    assignedAssets: [],
    contactEmail: null,
    disclosure: ['Disclosed as required.'],
    generatedAt: '2026-09-03T00:00:00.000Z',
  };

  it('produces a PDF starting with %PDF', () => {
    const pdf = renderMediaKitPdf(content);
    assert.ok(pdf.toString('utf8', 0, 5).startsWith('%PDF'));
    assert.ok(pdf.length > 400);
  });

  it('embeds JPEG bytes as DCTDecode XObject without stretch metadata loss', () => {
    // Minimal 1x1 JPEG
    const jpeg = Buffer.from(
      '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z',
      'base64',
    );
    const pdf = renderMediaKitPdf(content, [
      { bytes: jpeg, width: 100, height: 150, label: 'headshot' },
    ]);
    assert.ok(pdf.toString('utf8', 0, 5).startsWith('%PDF'));
    assert.ok(pdf.includes('/Subtype /Image'));
    assert.ok(pdf.includes('/Filter /DCTDecode'));
    assert.ok(pdf.includes('/Im0 '));
    // Aspect-preserving cm scale: 100×150 fit-inside 160×210, capped at 1 → 100×150
    assert.ok(pdf.includes('100.00 0 0 150.00'));
    assert.ok(pdf.length > jpeg.length + 400);
  });
});
