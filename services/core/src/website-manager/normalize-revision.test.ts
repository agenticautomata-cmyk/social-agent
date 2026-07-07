import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyInstructionOverrides,
  classifyScreenshotFromInstructions,
  formatRevisionError,
  normalizeRevisionResponse,
  parseContentType,
  parsePlacement,
} from './normalize-revision.js';
import type { ExistingDraftContext } from './normalize-revision.js';

const EXISTING: ExistingDraftContext = {
  title: 'Old title',
  sectionId: 'sponsor_highlights',
  caption: 'Old caption',
  altText: 'Old alt',
  headline: 'Old headline',
  ctaLabel: null,
  ctaHref: null,
  bensonReasoning: 'Was wrong about food',
  category: 'sponsor',
  contentType: 'sponsor',
  suggestedPlacement: 'sponsor_highlight',
};

describe('normalizeRevisionResponse', () => {
  it('preserves existing fields when AI omits category, contentType, suggestedPlacement', () => {
    const result = normalizeRevisionResponse(
      {
        title: 'Revised title',
        caption: 'New caption',
        altText: 'New alt',
        assistantReply: 'Fixed it.',
      },
      EXISTING,
    );

    assert.equal(result.title, 'Revised title');
    assert.equal(result.caption, 'New caption');
    assert.equal(result.category, 'sponsor');
    assert.equal(result.contentType, 'sponsor');
    assert.equal(result.suggestedPlacement, 'sponsor_highlight');
    assert.equal(result.assistantReply, 'Fixed it.');
  });

  it('uses safe defaults when AI and existing are both missing classification', () => {
    const result = normalizeRevisionResponse(
      { caption: 'Hello', altText: 'Alt', assistantReply: 'Done' },
      {
        ...EXISTING,
        category: null,
        contentType: null,
        suggestedPlacement: null,
      },
    );

    assert.equal(result.category, 'social');
    assert.equal(result.contentType, 'lifestyle');
    assert.equal(result.suggestedPlacement, 'latest_content');
  });

  it('corrects food mislabel when AI reasoning mentions TikTok UI', () => {
    const result = normalizeRevisionResponse(
      {
        category: 'food',
        contentType: 'food',
        caption: 'A beautifully plated dish at a Kansas City restaurant.',
        altText: 'Plated food dish',
        reasoning: 'Screenshot showing TikTok profile grid with follower count and video thumbnails.',
        assistantReply: 'Updated.',
      },
      EXISTING,
      '',
      'tiktok-profile.png',
    );

    assert.equal(result.category, 'social');
    assert.equal(result.contentType, 'screenshot');
    assert.equal(result.sectionId, 'latest_posts');
    assert.match(result.caption, /TikTok profile/i);
  });

  it('forces latest_posts when user asks for latest posts', () => {
    const result = normalizeRevisionResponse(
      { caption: 'TikTok grid', altText: 'Profile', assistantReply: 'Updated' },
      EXISTING,
      'This is a TikTok profile screenshot, put it in latest posts',
    );

    assert.equal(result.category, 'social');
    assert.equal(result.contentType, 'screenshot');
    assert.equal(result.suggestedPlacement, 'latest_content');
    assert.equal(result.sectionId, 'latest_posts');
  });

  it('does not surface raw Zod errors through formatRevisionError', () => {
    const friendly = formatRevisionError(
      new Error('[{"code":"invalid_type","expected":"string","received":"undefined","path":["category"]}]'),
    );
    assert.match(friendly, /failed validation|edit the classification/i);
    assert.doesNotMatch(friendly, /invalid_type/);
  });
});

describe('classifyScreenshotFromInstructions', () => {
  it('classifies TikTok profile screenshot as social/latest_posts', () => {
    const result = classifyScreenshotFromInstructions('This is a TikTok profile screenshot');
    assert.deepEqual(result, {
      category: 'social',
      contentType: 'screenshot',
      suggestedPlacement: 'latest_content',
      sectionId: 'latest_posts',
    });
  });
});

describe('parsePlacement aliases', () => {
  it('maps latest_posts to latest_content', () => {
    assert.equal(parsePlacement('latest_posts'), 'latest_content');
  });

  it('maps kc_finds to gallery', () => {
    assert.equal(parsePlacement('kc_finds'), 'gallery');
  });
});

describe('parseContentType', () => {
  it('maps screenshot to screenshot', () => {
    assert.equal(parseContentType('screenshot'), 'screenshot');
  });

  it('maps tiktok mention to screenshot', () => {
    assert.equal(parseContentType('tiktok_profile'), 'screenshot');
  });
});

describe('applyInstructionOverrides', () => {
  it('overrides placement from user message', () => {
    const result = applyInstructionOverrides('put this in latest posts', {
      category: 'food',
      contentType: 'food',
      suggestedPlacement: 'about',
      sectionId: 'featured_content',
    });
    assert.equal(result.sectionId, 'latest_posts');
    assert.equal(result.suggestedPlacement, 'latest_content');
  });
});
