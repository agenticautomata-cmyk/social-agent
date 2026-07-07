import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  captionLooksMislabeled,
  detectSocialScreenshot,
  socialScreenshotCaption,
} from './detect-social-screenshot.js';

describe('detectSocialScreenshot', () => {
  it('detects TikTok profile when AI reasoning mentions TikTok UI but category is food', () => {
    const result = detectSocialScreenshot({
      category: 'food',
      contentType: 'food',
      caption: 'A beautifully plated dish at a Kansas City restaurant.',
      reasoning: 'Screenshot showing TikTok profile grid with follower count and video thumbnails.',
      filename: 'IMG_1234.png',
    });
    assert.ok(result?.detected);
    assert.equal(result?.platform, 'tiktok');
  });

  it('detects from user instruction about TikTok profile', () => {
    const result = detectSocialScreenshot({
      userMessage: 'This is a TikTok profile screenshot, put it in latest posts',
      category: 'food',
      caption: 'Old wrong caption',
    });
    assert.ok(result?.detected);
    assert.equal(result?.platform, 'tiktok');
  });

  it('does not override a genuine food photo with no social signals', () => {
    const result = detectSocialScreenshot({
      category: 'food',
      contentType: 'food',
      caption: 'Gorgeous brunch spread at a KC café.',
      reasoning: 'Plated avocado toast and coffee on a wooden table.',
      filename: 'brunch.jpg',
    });
    assert.equal(result, null);
  });
});

describe('captionLooksMislabeled', () => {
  it('flags food caption without social context', () => {
    assert.equal(captionLooksMislabeled('A plated culinary dish in Kansas City.'), true);
  });

  it('allows social captions', () => {
    assert.equal(
      captionLooksMislabeled("Kellie's TikTok profile — Kansas City creator content."),
      false,
    );
  });
});

describe('socialScreenshotCaption', () => {
  it('returns TikTok profile caption', () => {
    assert.match(
      socialScreenshotCaption({ detected: true, platform: 'tiktok', kind: 'profile' }),
      /TikTok profile/i,
    );
  });
});
