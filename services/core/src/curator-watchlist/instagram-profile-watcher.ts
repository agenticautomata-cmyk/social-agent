import { createHash } from 'node:crypto';
import type { CapturedSocialPost } from './types.js';
import {
  closeInstagramSession,
  detectInstagramAuthWall,
  openInstagramSession,
  type InstagramBrowserContext,
} from './instagram-session.js';
import {
  collectInstagramPostUrls,
  extractInstagramPostHrefsFromHtml,
  extractInstagramShortcodesFromJsonBlob,
  instagramPostIdentityKeys,
  normalizeInstagramUrl,
} from './instagram-url.js';
import { captureInstagramPostMedia } from './instagram-media-capture.js';
import {
  emptyInstagramWatchInspection,
  formatInstagramWatchInspectionSummary,
  instagramWatchInspectionSucceeded,
  type InstagramWatchInspection,
} from './watch-inspection.js';

const IG_POST_PATH = /instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/;
const RESERVED_PATHS = /^(p|reel|tv|explore|stories|s)$/i;

export function postFingerprint(postUrl: string, caption: string | null, slideCount: number): string {
  return createHash('sha256')
    .update(`${postUrl}|${caption?.slice(0, 200) ?? ''}|${slideCount}`)
    .digest('hex')
    .slice(0, 32);
}

export function extractHandleFromProfileUrl(url: string): string {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const first = parts[0]?.replace(/^@/, '') ?? '';
    if (!first || RESERVED_PATHS.test(first)) return 'unknown';
    if (parts.length >= 3 && /^(p|reel|tv)$/i.test(parts[1] ?? '')) return first;
    if (parts.length === 1) return first;
    return first;
  } catch {
    return 'unknown';
  }
}

export async function extractCaptionFromPage(
  page: import('playwright').Page,
): Promise<string | null> {
  const domCaption = await page
    .locator('article h1, article span[dir="auto"]')
    .first()
    .textContent({ timeout: 3000 })
    .catch(() => null);
  if (domCaption?.trim()) return domCaption.trim();

  const og = await page.locator('meta[property="og:description"]').getAttribute('content');
  if (!og) return null;
  const quoted = og.match(/ on [^:]+:\s*"([\s\S]*)$/);
  if (quoted?.[1]) {
    return quoted[1]
      .replace(/\\n/g, '\n')
      .replace(/"\s*$/, '')
      .trim();
  }
  const unquoted = og.match(/ on [^:]+:\s*(.+)$/);
  if (unquoted?.[1]) {
    return unquoted[1]
      .replace(/^"/, '')
      .replace(/"\s*$/, '')
      .replace(/\\n/g, '\n')
      .trim();
  }
  return null;
}

export async function extractHandleFromPostPage(
  page: import('playwright').Page,
  fallback: string,
): Promise<string> {
  const og = await page.locator('meta[property="og:description"]').getAttribute('content');
  if (og) {
    const match = og.match(/-\s*(@?[\w.]+)\s+on\s/i);
    if (match?.[1]) return match[1].replace(/^@/, '');
  }

  const profileHref = await page
    .locator('header a[href^="/"][href$="/"]')
    .first()
    .getAttribute('href')
    .catch(() => null);
  if (profileHref) {
    const handle = profileHref.replace(/^\/+|\/+$/g, '').replace(/^@/, '');
    if (handle && !RESERVED_PATHS.test(handle)) return handle;
  }

  return fallback;
}

async function capturePostFromPage(
  page: import('playwright').Page,
  postUrl: string,
  profileHandle: string,
  options?: { maxCarouselSlides?: number; pageWaitUntil?: 'domcontentloaded' | 'networkidle' },
): Promise<{ post: CapturedSocialPost | null; failureReason?: string }> {
  try {
    const detailed = await captureInstagramPostMedia(page, postUrl, profileHandle, {
      maxCarouselItems: options?.maxCarouselSlides ?? 12,
      pageWaitUntil: options?.pageWaitUntil ?? 'domcontentloaded',
    });
    if (detailed.ok && detailed.post) return { post: detailed.post };
    return {
      post: null,
      failureReason: detailed.failure?.detail ?? detailed.failure?.code ?? 'capture_failed',
    };
  } catch (err) {
    return {
      post: null,
      failureReason: err instanceof Error ? err.message.slice(0, 180) : 'capture_failed',
    };
  }
}

async function collectPagePostHrefs(page: import('playwright').Page): Promise<string[]> {
  const fromAnchors = await page
    .$$eval('a[href*="/p/"], a[href*="/reel/"], a[href*="/reels/"], a[href*="/tv/"]', (links) =>
      links.map((a) => (a as { href?: string }).href ?? '').filter(Boolean),
    )
    .catch(() => [] as string[]);
  const html = await page.content().catch(() => '');
  return [...fromAnchors, ...extractInstagramPostHrefsFromHtml(html)];
}

async function listProfilePostUrls(
  ctx: InstagramBrowserContext,
  profileUrl: string,
  limit = 12,
): Promise<{
  urls: string[];
  auth: Awaited<ReturnType<typeof detectInstagramAuthWall>>;
  privateAccount: boolean;
}> {
  const { page } = ctx;
  const graphqlHrefs: string[] = [];
  const onResponse = async (res: import('playwright').Response) => {
    const url = res.url();
    if (!/graphql|\/api\/v1\//i.test(url)) return;
    try {
      const raw = await res.text();
      for (const code of extractInstagramShortcodesFromJsonBlob(raw)) {
        graphqlHrefs.push(`https://www.instagram.com/p/${code}/`);
      }
    } catch {
      /* ignore non-JSON */
    }
  };
  page.on('response', onResponse);
  try {
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
    const auth = await detectInstagramAuthWall(page);
    if (auth !== 'ready') return { urls: [], auth, privateAccount: false };

    const bodyText = String(
      await page.evaluate(`(() => document.body?.innerText?.slice(0, 4000) ?? '')()`),
    );
    if (/this account is private|follow to see their photos/i.test(bodyText)) {
      return { urls: [], auth, privateAccount: true };
    }

    await page
      .waitForSelector('a[href*="/p/"], a[href*="/reel/"], a[href*="/reels/"]', { timeout: 8000 })
      .catch(() => undefined);
    await page.waitForTimeout(800);
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 1200);
      await page.waitForTimeout(600);
    }

    const hrefs = [...(await collectPagePostHrefs(page)), ...graphqlHrefs];
    return { urls: collectInstagramPostUrls(hrefs, limit), auth, privateAccount: false };
  } finally {
    page.off('response', onResponse);
  }
}

export type InstagramProfileFetchResult = {
  ok: boolean;
  posts: CapturedSocialPost[];
  pausedForAuth: boolean;
  error?: string;
  inspection: InstagramWatchInspection;
};

function fetchResult(input: {
  ok: boolean;
  posts?: CapturedSocialPost[];
  pausedForAuth?: boolean;
  error?: string;
  inspection: InstagramWatchInspection;
}): InstagramProfileFetchResult {
  return {
    ok: input.ok,
    posts: input.posts ?? [],
    pausedForAuth: input.pausedForAuth ?? false,
    error: input.error,
    inspection: input.inspection,
  };
}

export async function fetchInstagramProfilePostsWithContext(
  ctx: InstagramBrowserContext,
  input: {
    profileUrl: string;
    lastSeenFingerprints?: string[];
    knownPostKeys?: Set<string>;
    specificPostUrl?: string;
    maxPosts?: number;
    maxCarouselSlides?: number;
    pageWaitUntil?: 'domcontentloaded' | 'networkidle';
  },
): Promise<InstagramProfileFetchResult> {
  const profileHandle = extractHandleFromProfileUrl(input.profileUrl);
  const known = input.knownPostKeys ?? new Set<string>();
  const seenFingerprints = new Set(input.lastSeenFingerprints ?? []);

  const authOnHome = await (async () => {
    if (input.specificPostUrl) return 'ready' as const;
    await ctx.page.goto(input.profileUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    return detectInstagramAuthWall(ctx.page);
  })();

  if (authOnHome !== 'ready') {
    return fetchResult({
      ok: false,
      pausedForAuth: true,
      error: `Instagram ${authOnHome}`,
      inspection: emptyInstagramWatchInspection(),
    });
  }

  const posts: CapturedSocialPost[] = [];

  if (input.specificPostUrl) {
    const normalizedPost = normalizeInstagramUrl(input.specificPostUrl) ?? input.specificPostUrl;
    const captured = await capturePostFromPage(ctx.page, normalizedPost, profileHandle, {
      maxCarouselSlides: input.maxCarouselSlides,
      pageWaitUntil: input.pageWaitUntil ?? 'domcontentloaded',
    });
    const inspection = emptyInstagramWatchInspection({
      profileOpened: true,
      postsDiscovered: 1,
    });
    if (!captured.post) {
      const auth = await detectInstagramAuthWall(ctx.page);
      const reason = captured.failureReason ?? `Instagram ${auth}`;
      inspection.failed.push({ url: normalizedPost, reason });
      const pausedForAuth =
        auth !== 'ready' || /login_required|challenge_required|consent_required/i.test(reason);
      return fetchResult({
        ok: false,
        pausedForAuth,
        error: reason,
        inspection,
      });
    }
    if (seenFingerprints.has(captured.post.sourceFingerprint) || knownHas(known, captured.post.postUrl)) {
      inspection.alreadyKnown = 1;
      inspection.skipped.push({ url: captured.post.postUrl, reason: 'already_processed' });
      return fetchResult({ ok: true, posts: [], inspection });
    }
    posts.push(captured.post);
    inspection.newlyInspected = 1;
    return fetchResult({ ok: true, posts, inspection });
  }

  const listed = await listProfilePostUrls(ctx, input.profileUrl, input.maxPosts ?? 12);
  if (listed.auth !== 'ready') {
    return fetchResult({
      ok: false,
      pausedForAuth: true,
      error: `Instagram ${listed.auth}`,
      inspection: emptyInstagramWatchInspection({ profileOpened: listed.auth === 'consent_required' }),
    });
  }

  if (listed.privateAccount) {
    return fetchResult({
      ok: false,
      error: 'This Instagram account is private',
      inspection: emptyInstagramWatchInspection({ profileOpened: true }),
    });
  }

  const inspection = emptyInstagramWatchInspection({
    profileOpened: true,
    postsDiscovered: listed.urls.length,
  });

  if (listed.urls.length === 0) {
    return fetchResult({
      ok: false,
      error: formatInstagramWatchInspectionSummary(inspection),
      inspection,
    });
  }

  for (const postUrl of listed.urls) {
    if (knownHas(known, postUrl)) {
      inspection.alreadyKnown += 1;
      inspection.skipped.push({ url: postUrl, reason: 'already_processed' });
      continue;
    }

    const captured = await capturePostFromPage(ctx.page, postUrl, profileHandle, {
      maxCarouselSlides: input.maxCarouselSlides,
      pageWaitUntil: input.pageWaitUntil ?? 'domcontentloaded',
    });
    if (!captured.post) {
      const reason = captured.failureReason ?? 'capture_failed';
      if (/login_required|challenge_required|consent_required/i.test(reason)) {
        const auth = await detectInstagramAuthWall(ctx.page);
        if (auth !== 'ready') {
          inspection.failed.push({ url: postUrl, reason });
          return fetchResult({
            ok: instagramWatchInspectionSucceeded(inspection),
            posts,
            pausedForAuth: true,
            error: reason,
            inspection,
          });
        }
      }
      inspection.failed.push({ url: postUrl, reason });
      continue;
    }
    if (seenFingerprints.has(captured.post.sourceFingerprint) || knownHas(known, captured.post.postUrl)) {
      inspection.alreadyKnown += 1;
      inspection.skipped.push({ url: captured.post.postUrl, reason: 'already_processed' });
      continue;
    }
    posts.push(captured.post);
    inspection.newlyInspected += 1;
  }

  const ok = instagramWatchInspectionSucceeded(inspection);
  return fetchResult({
    ok,
    posts,
    error: ok ? undefined : formatInstagramWatchInspectionSummary(inspection),
    inspection,
  });
}

function knownHas(known: Set<string>, url: string): boolean {
  return instagramPostIdentityKeys(url).some((key) => known.has(key));
}

export async function fetchInstagramProfilePosts(input: {
  profileUrl: string;
  lastSeenFingerprints?: string[];
  knownPostKeys?: Set<string>;
  specificPostUrl?: string;
  maxPosts?: number;
}): Promise<InstagramProfileFetchResult> {
  const { ctx, status, sanitizedFailure } = await openInstagramSession();

  if (!ctx) {
    return {
      ok: false,
      posts: [],
      pausedForAuth: status === 'login_required' || status === 'captcha_blocked',
      error: sanitizedFailure ?? status,
      inspection: emptyInstagramWatchInspection(),
    };
  }

  try {
    return await fetchInstagramProfilePostsWithContext(ctx, input);
  } catch (err) {
    return {
      ok: false,
      posts: [],
      pausedForAuth: false,
      error: err instanceof Error ? err.message : 'instagram_fetch_failed',
      inspection: emptyInstagramWatchInspection(),
    };
  } finally {
    await closeInstagramSession(ctx);
  }
}

export function isInstagramPostUrl(url: string): boolean {
  return IG_POST_PATH.test(url);
}
