import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { humanAssetRoleLabel, renderEditorialHotelKitHtml } from './editorial-hotel.js';
import { renderWeekendSlideHtml } from '../slides/weekend-slides.js';
import { lockWeekendFactSheet, packWeekendSlides } from '../facts/weekend-facts.js';
import type { WeekendListResponse } from '../../creator-calendar/weekend-list.js';
import { OffImageArtProvider, reportImageArtCapabilities } from '../image-art/index.js';

describe('visual production public labels', () => {
  it('never maps other/proof_still to a public caption', () => {
    assert.equal(humanAssetRoleLabel('other'), null);
    assert.equal(humanAssetRoleLabel('proof_still'), null);
    assert.equal(humanAssetRoleLabel('headshot'), 'Portrait');
  });
});

describe('weekend slide HTML', () => {
  it('renders cover with tagline and no purple Benson chrome', () => {
    const list: WeekendListResponse = {
      title: 't',
      rangeLabel: 'Sep 11–13',
      rangeLabelFull: 'September 11–13, 2026',
      friday: '2026-09-11',
      saturday: '2026-09-12',
      sunday: '2026-09-13',
      timezone: 'America/Chicago',
      selectedCount: 1,
      emptyMessage: '',
      outsideWindowCount: 0,
      flyerBrief: 'brief',
      fullList: 'full',
      pastWeekends: [],
      days: [
        {
          key: 'friday',
          heading: 'FRIDAY',
          dateKey: '2026-09-11',
          items: [
            {
              id: '1',
              title: '816 Night Market',
              dayKey: 'friday',
              dateLabel: 'Friday, Sep 11',
              startTimeLabel: '6:00 PM',
              venue: 'Crossroads',
              city: 'Kansas City, MO',
              address: null,
              description: 'Night market.',
              category: 'market',
              sourceName: null,
              sourceUrl: null,
              verificationNote: null,
              notes: null,
              spanNote: null,
              sortAt: '2026-09-11T23:00:00.000Z',
            },
          ],
        },
        { key: 'saturday', heading: 'SATURDAY', dateKey: '2026-09-12', items: [] },
        { key: 'sunday', heading: 'SUNDAY', dateKey: '2026-09-13', items: [] },
      ],
    };
    const sheet = lockWeekendFactSheet(list);
    const cover = packWeekendSlides(sheet).find((s) => s.role === 'cover')!;
    const html = renderWeekendSlideHtml({ sheet, slide: cover, format: 'carousel' });
    assert.match(html, /I’m putting you on/i);
    assert.match(html, /WEEKEND/);
    assert.doesNotMatch(html, /#7c3aed|purple|sparkle/i);
    assert.doesNotMatch(html, /benson studio/i);
  });
});

describe('editorial hotel kit HTML', () => {
  it('omits raw other labels and thrift filler when evidence is held', () => {
    const html = renderEditorialHotelKitHtml({
      creatorName: 'Kellie',
      market: 'Kansas City metro',
      headline: 'Overnight stays',
      positioning: 'Local-first stay stories.',
      partnershipConcept: {
        title: 'One evening stay story',
        body: 'Film the arc.',
        deliverables: ['In-feed video'],
      },
      audience: {
        platform: 'TikTok',
        handle: '@kckellie',
        followersCount: 6805,
        medianViewsPerPost: 915,
        totalViews: 1000,
        postsWithMetrics: 10,
        engagementRatePercent: 7.6,
        lastSyncedAt: '2026-09-07T00:00:00.000Z',
        followersAvailable: true,
      },
      examples: [],
      examplesStatus: 'needs_evidence_review',
      examplesNote: 'Fewer than 2 hotel-relevant evidenced posts.',
      collaborationTermsPublic: ['Paid and hosted collaborations considered.'],
      contactEmail: null,
      handle: 'TikTok @kckellie',
      portraitDataUrl: null,
      portraitAlt: 'Kellie',
      generatedAt: '2026-09-07T00:00:00.000Z',
    });
    assert.doesNotMatch(html, />\s*other\s*</i);
    assert.doesNotMatch(html, /Goodwill|thrift/i);
    assert.match(html, /Partnership idea|Partnership concept/i);
    assert.match(html, /needs_evidence_review|being curated/i);
  });
});

describe('ImageArtProvider off', () => {
  it('is always available and does not invent paid success', async () => {
    const provider = new OffImageArtProvider();
    const caps = await provider.capabilities();
    assert.equal(caps.available, true);
    const result = await provider.generateBackground({
      kind: 'background',
      aspectRatio: '4:5',
      brandThemeId: 'kckellie-weekend-drop.v1',
      promptVersion: 'v1',
      negativeConstraints: [],
      maxAttempts: 2,
      attemptKey: 'test-1',
    });
    assert.equal(result.ok, false);
    assert.equal(result.estimatedCostUsd, 0);
  });

  it('reports capability map without secrets', async () => {
    const report = await reportImageArtCapabilities();
    assert.equal(report.off.available, true);
    const blob = JSON.stringify(report);
    assert.doesNotMatch(blob, /sk-|AIza/);
  });
});
