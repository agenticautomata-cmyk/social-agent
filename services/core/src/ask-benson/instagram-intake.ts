/**
 * Instagram intake for Ask Benson.
 *
 * Instagram answers anonymous server-side fetches with a logged-out challenge page
 * (HTTP 200, zero readable content), so the generic URL pipeline can never see a post.
 * This module reuses the authenticated Playwright session already built for the
 * curator watchlist to pull caption, timestamp, links, carousel slide text, and video evidence.
 */

import {
  instagramSessionConfigured,
  instagramSessionSeeded,
} from '../curator-watchlist/instagram-session.js';
import { runInstagramIntakePipeline } from '../curator-watchlist/instagram-intake-pipeline.js';
import { verifyInstagramProductionSession } from '../curator-watchlist/instagram-session-verify.js';
import {
  isInstagramPostOrReelUrl,
  normalizeInstagramUrl,
} from '../curator-watchlist/instagram-url.js';
import type { CapturedSocialPost } from '../curator-watchlist/types.js';
import type { InstagramIntakeFailureCode } from '../curator-watchlist/instagram-intake-types.js';
import type {
  UrlAccessBlockReason,
  UrlIntakeDiagnostics,
  UrlPipelinePage,
} from './url-intake-pipeline.js';

export { verifyInstagramProductionSession } from '../curator-watchlist/instagram-session-verify.js';
export { runInstagramIntakePipeline } from '../curator-watchlist/instagram-intake-pipeline.js';

const LOGIN_HINT =
  'Instagram requires a logged-in session. Run `pnpm benson:instagram-login` on the server to seed one, then reshare the link.';

const FAILURE_MESSAGES: Record<InstagramIntakeFailureCode, { summary: string; nextAction: string }> = {
  session_not_configured: {
    summary: 'Instagram session is not configured (SCOUT_INSTAGRAM_PROFILE_DIR unset).',
    nextAction: LOGIN_HINT,
  },
  session_not_seeded: {
    summary: 'Instagram session directory exists but storage-state.json has not been seeded.',
    nextAction: LOGIN_HINT,
  },
  session_expired: {
    summary: 'Instagram session expired — production could not open an authenticated browser context.',
    nextAction: LOGIN_HINT,
  },
  login_required: {
    summary: 'Instagram redirected to login — saved session is no longer valid.',
    nextAction: LOGIN_HINT,
  },
  challenge_required: {
    summary: 'Instagram challenge or captcha required before posts can be read.',
    nextAction: 'Complete Instagram verification in a browser, then re-run `pnpm benson:instagram-login`.',
  },
  consent_required: {
    summary: 'Instagram cookie consent must be accepted before posts can be read.',
    nextAction:
      'Open instagram.com in a browser with the Benson session, accept cookies, then re-run `pnpm benson:instagram-login` to refresh storage-state.json.',
  },
  browser_unavailable: {
    summary: 'Playwright browser could not start for Instagram intake.',
    nextAction: 'Check server dependencies and retry.',
  },
  post_unavailable: {
    summary: 'Instagram reports this post/page is unavailable (deleted, broken link, or removed).',
    nextAction: 'Confirm the link opens in a browser while logged in, or share a screenshot.',
  },
  private_account: {
    summary: 'This Instagram account or post appears to be private.',
    nextAction: 'Follow the account with the authenticated session or share a screenshot.',
  },
  carousel_traversal_failed: {
    summary: 'Authenticated session reached the post but no carousel media could be captured.',
    nextAction: 'Retry the link or share a screenshot of the carousel.',
  },
  static_image_ocr_failed: {
    summary: 'Images were captured but OCR could not read text from the slides.',
    nextAction: 'Share a sharper screenshot, or add credits to OpenAI if quota errors appear in logs.',
  },
  unsupported_video: {
    summary: 'A video item was found but could not be downloaded or processed.',
    nextAction: 'Share a screenshot of the video frame with visible event text.',
  },
  audio_unavailable: {
    summary: 'Video was captured but audio could not be extracted.',
    nextAction: 'Share a screenshot with on-screen text.',
  },
  transcription_empty: {
    summary: 'Video audio was extracted but transcription returned no speech.',
    nextAction: 'Rely on on-screen text — share a screenshot if overlays are hard to read.',
  },
  transcription_failed: {
    summary: 'Video transcription failed.',
    nextAction: 'Check OpenAI credits / Whisper availability, or share a screenshot.',
  },
  no_event_information: {
    summary: 'Instagram post was captured but no readable caption, OCR, or transcript text was found.',
    nextAction: 'Share a clearer post or screenshot with visible event details.',
  },
  openai_quota_exceeded: {
    summary: 'OpenAI credits exhausted — OCR/transcription could not run (capture may still have succeeded).',
    nextAction: 'Add OpenAI billing credits, then retry the link.',
  },
  capture_empty: {
    summary: 'Instagram intake failed before readable content was captured.',
    nextAction: 'Retry the link or share a screenshot.',
  },
};

export function isInstagramUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return /(^|\.)instagram\.com$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** @returns the @handle for an IG post or profile URL, without the leading @. */
export function instagramHandleFromUrl(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    if (parts.length === 0) return null;
    const first = parts[0]!.replace(/^@/, '').trim();
    if (!first || /^(p|reel|reels|tv|explore|stories|s)$/i.test(first)) return null;
    if (parts.length >= 3 && /^(p|reel|reels|tv)$/i.test(parts[1]!)) return first;
    if (parts.length === 1) return first;
    return null;
  } catch {
    return null;
  }
}

function baseDiagnostics(url: string): UrlIntakeDiagnostics {
  return {
    url,
    domain: 'instagram.com',
    methodsAttempted: ['instagram_session'],
    httpStatus: null,
    fetchOk: false,
    textLength: 0,
    jsRenderingRequired: true,
    browserFallbackRan: false,
    browserFallbackOk: false,
    ocrAttempted: false,
    ocrOk: false,
    accessBlocked: false,
    blockReason: null,
    surfacesInspected: [],
    webSearchFallback: false,
    nextAction: '',
    summary: '',
  };
}

function blockReasonForFailure(code: InstagramIntakeFailureCode | null): UrlAccessBlockReason {
  if (!code) return null;
  if (code === 'login_required' || code === 'session_expired' || code === 'session_not_seeded') {
    return 'login_required';
  }
  if (
    code === 'challenge_required' ||
    code === 'private_account' ||
    code === 'post_unavailable' ||
    code === 'openai_quota_exceeded'
  ) {
    return 'forbidden';
  }
  return null;
}

/**
 * Render a captured post as text the opportunity extractor can read.
 * @deprecated Prefer evidence package combinedText from runInstagramIntakePipeline.
 */
export function buildInstagramPostText(
  post: CapturedSocialPost,
  slideTexts: string[],
  now = new Date(),
): string {
  const lines: string[] = [
    `Instagram post by @${post.profileHandle}`,
    `Post URL: ${post.postUrl}`,
  ];

  if (post.publishedAt) {
    lines.push(`Posted at: ${post.publishedAt}`);
  }
  lines.push(`Today's date: ${now.toISOString().slice(0, 10)}`);
  lines.push(
    'Relative dates in the caption ("tonight", "this Saturday") are relative to the post date above. Resolve them to absolute calendar dates.',
  );

  if (post.caption) {
    lines.push('', 'Caption:', post.caption);
  }

  if (post.outboundLinks.length > 0) {
    lines.push('', `Links in post: ${post.outboundLinks.join(', ')}`);
  }

  slideTexts.forEach((text, i) => {
    lines.push('', `Slide ${i + 1} text:`, text);
  });

  return lines.join('\n');
}

/**
 * Fetch an Instagram post or profile using the authenticated session.
 * Returns the same shape as the generic URL pipeline so callers stay unchanged.
 */
export async function fetchInstagramWithSession(url: string): Promise<UrlPipelinePage> {
  const normalized = normalizeInstagramUrl(url) ?? url;
  const diagnostics = baseDiagnostics(normalized);

  if (!instagramSessionConfigured() || !(await instagramSessionSeeded())) {
    diagnostics.accessBlocked = true;
    diagnostics.blockReason = 'login_required';
    const msg = FAILURE_MESSAGES[instagramSessionConfigured() ? 'session_not_seeded' : 'session_not_configured'];
    diagnostics.summary = msg.summary;
    diagnostics.nextAction = msg.nextAction;
    return { ok: false, diagnostics };
  }

  const isPost = isInstagramPostOrReelUrl(normalized);
  if (!isPost) {
    const handle = instagramHandleFromUrl(normalized);
    if (handle) {
      const profileText = `Instagram profile @${handle}\nProfile URL: ${normalized}`;
      diagnostics.fetchOk = true;
      diagnostics.textLength = profileText.length;
      diagnostics.summary = `Recognized Instagram profile @${handle}.`;
      diagnostics.nextAction = 'Keep as a source or inspect supported profile information.';
      return {
        ok: true,
        title: `@${handle} on Instagram`,
        description: `Instagram profile @${handle}`,
        text: profileText,
        diagnostics,
      };
    }
    diagnostics.summary = 'URL is an Instagram non-post link without a usable profile handle.';
    diagnostics.nextAction = 'Share a profile or post URL.';
    return { ok: false, diagnostics };
  }

  const pipeline = await runInstagramIntakePipeline(normalized);
  const report = pipeline.report;
  const evidence = pipeline.evidence;

  diagnostics.browserFallbackRan = true;
  diagnostics.browserFallbackOk = report.authenticatedSessionUsed && report.carouselItemsDiscovered > 0;
  diagnostics.ocrAttempted = report.ocrAttemptedPerItem.length > 0;
  diagnostics.ocrOk = report.totalOcrChars > 0;
  diagnostics.surfacesInspected = [
    `mediaType:${report.mediaType}`,
    `items:${report.carouselItemsDiscovered}`,
    `images:${report.imageItemsCaptured}`,
    `videos:${report.videoItemsCaptured}`,
    `screenshots:${report.screenshotsCreated}`,
  ];

  if (!pipeline.ok) {
    const code = report.failureCode ?? 'capture_empty';
    const msg = FAILURE_MESSAGES[code] ?? FAILURE_MESSAGES.capture_empty;
    diagnostics.accessBlocked = [
      'login_required',
      'session_expired',
      'challenge_required',
      'private_account',
      'post_unavailable',
    ].includes(code);
    diagnostics.blockReason = blockReasonForFailure(code);
    diagnostics.summary = `${msg.summary}${report.failureDetail ? ` (${report.failureDetail})` : ''}`;
    diagnostics.nextAction = msg.nextAction;
    if (evidence && evidence.combinedText.trim()) {
      diagnostics.fetchOk = true;
      diagnostics.textLength = evidence.combinedText.length;
      return {
        ok: true,
        title: evidence.caption?.split('\n')[0]?.slice(0, 200) ?? `@${evidence.profileHandle} on Instagram`,
        description: evidence.caption?.slice(0, 500) ?? undefined,
        text: evidence.combinedText,
        diagnostics,
      };
    }
    return { ok: false, diagnostics };
  }

  const text = pipeline.text;
  const title =
    evidence?.caption?.split('\n')[0]?.slice(0, 200) ||
    `@${evidence?.profileHandle ?? instagramHandleFromUrl(normalized) ?? 'instagram'} on Instagram`;

  diagnostics.fetchOk = true;
  diagnostics.textLength = text.length;
  diagnostics.methodsAttempted.push('browser_render');
  if (diagnostics.ocrAttempted) diagnostics.methodsAttempted.push('ocr_vision');
  if (report.transcriptCharCount > 0) diagnostics.methodsAttempted.push('video_transcript');
  diagnostics.summary =
    `Read Instagram ${report.mediaType} from @${evidence?.profileHandle ?? 'unknown'} ` +
    `(${report.carouselItemsDiscovered} items, caption ${report.captionCharCount} chars, ` +
    `OCR ${report.totalOcrChars} chars${report.transcriptCharCount ? `, transcript ${report.transcriptCharCount} chars` : ''}).`;
  diagnostics.nextAction = 'Review extracted opportunities below.';

  return {
    ok: text.trim().length > 0,
    title,
    description: evidence?.caption?.slice(0, 500) ?? undefined,
    text,
    diagnostics,
  };
}
