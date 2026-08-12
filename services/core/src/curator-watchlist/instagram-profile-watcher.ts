import { createHash } from 'node:crypto';
import type { CapturedSocialPost, CuratorPostType } from './types.js';
import {
  closeInstagramSession,
  detectInstagramAuthWall,
  openInstagramSession,
  type InstagramBrowserContext,
} from './instagram-session.js';
import { isInstagramPostOrReelUrl, normalizeInstagramUrl } from './instagram-url.js';
import { captureInstagramPostMedia } from './instagram-media-capture.js';

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

async function captureCarouselSlides(
  page: import('playwright').Page,
  maxSlides = 12,
): Promise<string[]> {
  const urls = new Set<string>();

  const grab = async () => {
    const imgs = await page.$$eval('article img, div[role="presentation"] img', (imgs) =>
      imgs
        .map((img) => (img as { src?: string }).src ?? '')
        .filter((src) => src && !src.includes('profile_pic') && src.length > 30),
    );
    for (const u of imgs) urls.add(u);
  };

  await grab();

  for (let i = 1; i < maxSlides; i++) {
    const nextBtn = page.locator('button[aria-label="Next"]').first();
    if (!(await nextBtn.isVisible({ timeout: 800 }).catch(() => false))) break;
    await nextBtn.click({ timeout: 3000 }).catch(() => undefined);
    await page.waitForTimeout(600);
    const before = urls.size;
    await grab();
    if (urls.size === before) break;
  }

  return [...urls];
}

async function capturePostFromPage(
  page: import('playwright').Page,
  postUrl: string,
  profileHandle: string,
  options?: { maxCarouselSlides?: number; pageWaitUntil?: 'domcontentloaded' | 'networkidle' },
): Promise<CapturedSocialPost | null> {
  await page.goto(postUrl, {
    waitUntil: options?.pageWaitUntil ?? 'networkidle',
    timeout: 35000,
  });
  const auth = await detectInstagramAuthWall(page);
  if (auth !== 'ready') return null;

  const handle = await extractHandleFromPostPage(page, profileHandle);
  const caption = await extractCaptionFromPage(page);
  const timeEl = await page.locator('time').first().getAttribute('datetime').catch(() => null);
  const slideImageUrls = await captureCarouselSlides(page, options?.maxCarouselSlides ?? 12);
  const postType: CuratorPostType =
    slideImageUrls.length > 1 ? 'carousel' : slideImageUrls.length === 1 ? 'single' : 'unknown';

  const outboundLinks = await page.$$eval('article a[href^="http"]', (links) =>
    links.map((a) => (a as { href?: string }).href ?? '').filter(Boolean),
  );

  const normalizedPostUrl = normalizeInstagramUrl(postUrl) ?? postUrl.split('?')[0]!;

  return {
    postUrl: normalizedPostUrl,
    profileHandle: handle,
    publishedAt: timeEl,
    caption,
    postType,
    sourceFingerprint: postFingerprint(normalizedPostUrl, caption, slideImageUrls.length),
    outboundLinks: [...new Set(outboundLinks)].slice(0, 10),
    ephemeralSource: false,
    slideImageUrls,
  };
}

async function listProfilePostUrls(
  ctx: InstagramBrowserContext,
  profileUrl: string,
  limit = 12,
): Promise<string[]> {
  const { page } = ctx;
  await page.goto(profileUrl, { waitUntil: 'networkidle', timeout: 35000 });
  const auth = await detectInstagramAuthWall(page);
  if (auth !== 'ready') return [];

  await page.waitForTimeout(1500);
  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(600);
  }

  const hrefs = await page.$$eval('a[href*="/p/"], a[href*="/reel/"]', (links) =>
    links.map((a) => (a as { href?: string }).href ?? '').filter(Boolean),
  );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const href of hrefs) {
    const clean = normalizeInstagramUrl(href);
    if (!clean || !isInstagramPostOrReelUrl(clean) || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= limit) break;
  }
  return out;
}

export async function fetchInstagramProfilePostsWithContext(
  ctx: InstagramBrowserContext,
  input: {
    profileUrl: string;
    lastSeenFingerprints?: string[];
    specificPostUrl?: string;
    maxPosts?: number;
    maxCarouselSlides?: number;
    pageWaitUntil?: 'domcontentloaded' | 'networkidle';
  },
): Promise<{
  ok: boolean;
  posts: CapturedSocialPost[];
  pausedForAuth: boolean;
  error?: string;
}> {
  const profileHandle = extractHandleFromProfileUrl(input.profileUrl);

  const authOnHome = await (async () => {
    if (input.specificPostUrl) return 'ready' as const;
    await ctx.page.goto(input.profileUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    return detectInstagramAuthWall(ctx.page);
  })();

  if (authOnHome !== 'ready') {
    return {
      ok: false,
      posts: [],
      pausedForAuth: true,
      error: `Instagram ${authOnHome}`,
    };
  }

  const posts: CapturedSocialPost[] = [];
  const seen = new Set(input.lastSeenFingerprints ?? []);

  if (input.specificPostUrl) {
    const normalizedPost = normalizeInstagramUrl(input.specificPostUrl) ?? input.specificPostUrl;
    const detailed = await captureInstagramPostMedia(ctx.page, normalizedPost, profileHandle, {
      maxCarouselItems: input.maxCarouselSlides ?? 12,
      pageWaitUntil: input.pageWaitUntil,
    });
    if (!detailed.ok || !detailed.post) {
      const auth = await detectInstagramAuthWall(ctx.page);
      if (auth !== 'ready' || detailed.failure?.code === 'login_required') {
        return { ok: false, posts: [], pausedForAuth: true, error: detailed.failure?.detail ?? `Instagram ${auth}` };
      }
      if (detailed.failure?.code === 'challenge_required') {
        return { ok: false, posts: [], pausedForAuth: true, error: detailed.failure.detail };
      }
      return {
        ok: false,
        posts: [],
        pausedForAuth: false,
        error: detailed.failure?.detail ?? 'capture_failed',
      };
    }
    if (!seen.has(detailed.post.sourceFingerprint)) {
      posts.push(detailed.post);
    }
    return { ok: true, posts, pausedForAuth: false };
  }

  const postUrls = await listProfilePostUrls(ctx, input.profileUrl, input.maxPosts ?? 12);
  if (postUrls.length === 0) {
    const auth = await detectInstagramAuthWall(ctx.page);
    if (auth !== 'ready') {
      return {
        ok: false,
        posts: [],
        pausedForAuth: true,
        error: `Instagram ${auth}`,
      };
    }
  }
  for (const postUrl of postUrls) {
    const captured = await capturePostFromPage(ctx.page, postUrl, profileHandle, {
      maxCarouselSlides: input.maxCarouselSlides,
      pageWaitUntil: input.pageWaitUntil,
    });
    if (!captured) continue;
    if (seen.has(captured.sourceFingerprint)) continue;
    posts.push(captured);
  }

  return { ok: true, posts, pausedForAuth: false };
}

export async function fetchInstagramProfilePosts(input: {
  profileUrl: string;
  lastSeenFingerprints?: string[];
  specificPostUrl?: string;
  maxPosts?: number;
}): Promise<{
  ok: boolean;
  posts: CapturedSocialPost[];
  pausedForAuth: boolean;
  error?: string;
}> {
  const { ctx, status, sanitizedFailure } = await openInstagramSession();

  if (!ctx) {
    return {
      ok: false,
      posts: [],
      pausedForAuth: status === 'login_required' || status === 'captcha_blocked',
      error: sanitizedFailure ?? status,
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
    };
  } finally {
    await closeInstagramSession(ctx);
  }
}

export function isInstagramPostUrl(url: string): boolean {
  return IG_POST_PATH.test(url);
}
