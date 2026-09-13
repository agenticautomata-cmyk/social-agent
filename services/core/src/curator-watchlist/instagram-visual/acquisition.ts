/**
 * Central Instagram media acquisition layer.
 * Permalink ONLY from captured platform data — never synthesize shortcodes.
 */

import {
  instagramShortcode,
  isCapturedInstagramPostOrReelUrl,
  isPlatformIssuedInstagramShortcode,
  normalizeInstagramUrl,
} from '../instagram-url.js';
import type { CapturedSocialPost } from '../types.js';
import type { DetailedPostCapture } from '../instagram-media-capture.js';
import { extractCaptionHashtags } from './event-assembler.js';
import type { AcquiredInstagramMedia } from './types.js';

export type PermalinkValidation = {
  ok: boolean;
  permalink: string | null;
  shortcode: string | null;
  reason: string | null;
};

/** Reject fabricated / guessed Instagram permalinks (Original Sin regression). */
export function validateCapturedPermalink(raw: string | null | undefined): PermalinkValidation {
  if (!raw?.trim()) {
    return { ok: false, permalink: null, shortcode: null, reason: 'missing_permalink' };
  }
  const normalized = normalizeInstagramUrl(raw);
  if (!normalized) {
    return { ok: false, permalink: null, shortcode: null, reason: 'unparseable' };
  }
  if (!isCapturedInstagramPostOrReelUrl(normalized)) {
    const code = instagramShortcode(normalized);
    if (code && !isPlatformIssuedInstagramShortcode(code)) {
      return {
        ok: false,
        permalink: null,
        shortcode: null,
        reason: 'synthetic_shortcode_rejected',
      };
    }
    return {
      ok: false,
      permalink: null,
      shortcode: null,
      reason: 'not_platform_issued_post_or_reel',
    };
  }
  return {
    ok: true,
    permalink: normalized,
    shortcode: instagramShortcode(normalized),
    reason: null,
  };
}

/** Refuse to build /p/ or /reel/ URLs from title/account/event/guessed slug. */
export function refuseSynthesizedInstagramUrl(input: {
  title?: string;
  handle?: string;
  guessedSlug?: string;
}): string | null {
  void input;
  return null;
}

export function acquireFromCapturedPost(
  post: CapturedSocialPost,
  extras?: {
    altTexts?: string[];
    taggedCollaborators?: string[];
    locationTag?: string | null;
    postId?: string | null;
    editIndicators?: string[];
    accessibilityMetadata?: Record<string, string>;
  },
): AcquiredInstagramMedia | null {
  const validated = validateCapturedPermalink(post.postUrl);
  if (!validated.ok || !validated.permalink || !validated.shortcode) return null;

  const children = post.mediaItems ?? [];
  const mediaUrls = [
    ...post.slideImageUrls,
    ...children.map((c) => c.imageUrl || c.videoUrl).filter((u): u is string => Boolean(u)),
  ];
  const uniqueUrls = [...new Set(mediaUrls)];

  return {
    postId: extras?.postId ?? null,
    shortcode: validated.shortcode,
    permalink: validated.permalink,
    handle: post.profileHandle.replace(/^@/, ''),
    author: post.profileHandle.replace(/^@/, ''),
    publishedAt: post.publishedAt,
    caption: post.caption,
    altTexts: extras?.altTexts ?? [],
    hashtags: extractCaptionHashtags(post.caption),
    taggedCollaborators: extras?.taggedCollaborators ?? [],
    locationTag: extras?.locationTag ?? null,
    mediaType: post.mediaType ?? (post.postType === 'carousel' ? 'carousel_images' : 'unknown'),
    carouselChildCount: Math.max(
      Math.min(post.platformReportedSlideCount ?? 0, 20),
      children.length,
      post.slideImageUrls.length,
      1,
    ),
    carouselChildIds: children.map((c, i) => `${validated.shortcode}:${c.index ?? i}`),
    mediaUrls: uniqueUrls,
    thumbnailOrCoverUrl: uniqueUrls[0] ?? null,
    accessibilityMetadata: extras?.accessibilityMetadata ?? {},
    editIndicators: extras?.editIndicators ?? [],
    permalinkSource: 'platform_url',
  };
}

export function acquireFromDetailedCapture(
  capture: DetailedPostCapture,
  handle: string,
  extras?: {
    altTexts?: string[];
    locationTag?: string | null;
    taggedCollaborators?: string[];
  },
): AcquiredInstagramMedia | null {
  if (!capture.ok || !capture.post) return null;
  return acquireFromCapturedPost(capture.post, {
    altTexts: extras?.altTexts,
    locationTag: extras?.locationTag,
    taggedCollaborators: extras?.taggedCollaborators,
  });
}

/** Extract page metadata (alt, location) without inventing fields. */
export async function extractPageAcquisitionExtras(
  page: import('playwright').Page,
): Promise<{
  altTexts: string[];
  locationTag: string | null;
  taggedCollaborators: string[];
  accessibilityMetadata: Record<string, string>;
}> {
  try {
    return await page.evaluate(`(() => {
      const alts = [...document.querySelectorAll('main img[alt], article img[alt]')]
        .map((el) => el.alt?.trim() ?? '')
        .filter((a) => a.length > 2 && !/profile picture/i.test(a))
        .slice(0, 12);
      const loc =
        document
          .querySelector('a[href*="/explore/locations/"]')
          ?.textContent?.trim() || null;
      const collabs = [...document.querySelectorAll('header a[role="link"], a[href*="/"]')]
        .map((a) => a.textContent?.trim() ?? '')
        .filter((t) => t.startsWith('@'))
        .slice(0, 8);
      const a11y = {};
      const aria = document.querySelector('img[alt]');
      if (aria?.alt) a11y.primaryAlt = aria.alt.slice(0, 300);
      return {
        altTexts: alts,
        locationTag: loc,
        taggedCollaborators: collabs,
        accessibilityMetadata: a11y,
      };
    })()`);
  } catch {
    return {
      altTexts: [],
      locationTag: null,
      taggedCollaborators: [],
      accessibilityMetadata: {},
    };
  }
}
