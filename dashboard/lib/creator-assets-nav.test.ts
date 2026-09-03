import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MY_INFO_NAV_ITEMS } from './my-info-nav.ts';
import { MOBILE_DRAWER_PINNED } from './nav-config.ts';
import { generatedKitForbiddenCopy, isGeneratedKit } from './media-kit-library.ts';
import type { MediaKitRecord } from './sponsor-outreach-types.ts';

describe('More → My Info creator assets nav', () => {
  it('includes Creator Assets next to Media Kit Library', () => {
    const labels = MY_INFO_NAV_ITEMS.map((i) => i.label);
    assert.ok(labels.includes('Creator Assets'));
    assert.ok(labels.includes('Media Kit Library'));
    assert.ok(!labels.includes('Media kits'));
    const creatorIdx = MY_INFO_NAV_ITEMS.findIndex((i) => i.label === 'Creator Assets');
    const libraryIdx = MY_INFO_NAV_ITEMS.findIndex((i) => i.label === 'Media Kit Library');
    assert.equal(MY_INFO_NAV_ITEMS[creatorIdx]?.href, '/creator-assets');
    assert.ok(creatorIdx >= 0 && libraryIdx === creatorIdx + 1);
  });

  it('pins Creator Assets for mobile More drawer access', () => {
    assert.ok(MOBILE_DRAWER_PINNED.some((i) => i.href === '/creator-assets'));
  });
});

describe('generated kit library copy', () => {
  it('does not treat generated kits as missing uploaded collateral', () => {
    const kit: MediaKitRecord = {
      id: '1',
      name: 'Kellie — media kit (hotel)',
      description: null,
      targetAudience: null,
      fileUrl: null,
      originalFilename: null,
      mimeType: null,
      fileSize: null,
      storageFilename: null,
      version: '3',
      active: true,
      kitKind: 'generated_business',
      webSlug: 'kellie-hotel',
      webAvailable: true,
      pdfAvailable: true,
      createdAt: '2026-09-03T00:00:00.000Z',
      updatedAt: '2026-09-03T00:00:00.000Z',
    };
    assert.equal(isGeneratedKit(kit), true);
    assert.deepEqual(generatedKitForbiddenCopy(kit), []);
  });
});
