import { createHash } from 'node:crypto';
import type { CapturedSocialPost, CuratorPostType } from './types.js';
import {
  closeInstagramSession,
  detectInstagramAuthWall,
  openInstagramSession,
  type InstagramBrowserContext,
} from './instagram-session.js';

const IG_POST_PATH = /instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/;

export function postFingerprint(postUrl: string, caption: string | null, slideCount: number): string {
  return createHash('sha256')
    .update(`${postUrl}|${caption?.slice(0, 200) ?? ''}|${slideCount}`)
    .digest('hex')
    .slice(0, 32);
}

export function extractHandleFromProfileUrl(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/\//g, '');
    return path.replace(/^@/, '') || 'unknown';
  } catch {
    return 'unknown';
  }
}

async function captureCarouselSlides(
  page: import('playwright').Page,
  maxSlides = 12,
): Promise<string[]> {
  const urls = new Set<string>();

  const initial = await page.$$eval('article img, div[role="presentation"] img', (imgs) =>
    imgs
      .map((img) => (img as { src?: string }).src ?? '')
      .filter((src) => src && !src.includes('profile_pic') && src.length > 30),
  );
  for (const u of initial) urls.add(u);

  for (let i = 1; i < maxSlides; i++) {
    const nextBtn = page.locator('button[aria-label="Next"]').first();
    if (!(await nextBtn.isVisible({ timeout: 800 }).catch(() => false))) break;
    await nextBtn.click({ timeout: 3000 }).catch(() => undefined);
    await page.waitForTimeout(600);
    const slideImgs = await page.$$eval('article img, div[role="presentation"] img', (imgs) =>
      imgs
        .map((img) => (img as { src?: string }).src ?? '')
        .filter((src) => src && !src.includes('profile_pic') && src.length > 30),
    );
    const before = urls.size;
    for (const u of slideImgs) urls.add(u);
    if (urls.size === before) break;
  }

  return [...urls];
}

async function capturePostFromPage(
  page: import('playwright').Page,
  postUrl: string,
  profileHandle: string,
): Promise<CapturedSocialPost | null> {
  await page.goto(postUrl, { waitUntil: 'networkidle', timeout: 35000 });
  const auth = await detectInstagramAuthWall(page);
  if (auth !== 'ready') return null;

  const caption = await page
    .locator('article h1, article span[dir="auto"]')
    .first()
    .textContent({ timeout: 5000 })
    .catch(() => null);

  const timeEl = await page.locator('time').first().getAttribute('datetime').catch(() => null);
  const slideImageUrls = await captureCarouselSlides(page);
  const postType: CuratorPostType =
    slideImageUrls.length > 1 ? 'carousel' : slideImageUrls.length === 1 ? 'single' : 'unknown';

  const outboundLinks = await page.$$eval('article a[href^="http"]', (links) =>
    links.map((a) => (a as { href?: string }).href ?? '').filter(Boolean),
  );

  return {
    postUrl: postUrl.split('?')[0]!,
    profileHandle,
    publishedAt: timeEl,
    caption: caption?.trim() || null,
    postType,
    sourceFingerprint: postFingerprint(postUrl, caption, slideImageUrls.length),
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
  const hrefs = await page.$$eval('a[href*="/p/"], a[href*="/reel/"]', (links) =>
    links.map((a) => (a as { href?: string }).href ?? '').filter(Boolean),
  );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const href of hrefs) {
    const clean = href.split('?')[0]!;
    if (seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= limit) break;
  }
  return out;
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
  const profileHandle = extractHandleFromProfileUrl(input.profileUrl);
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
      const captured = await capturePostFromPage(ctx.page, input.specificPostUrl, profileHandle);
      if (captured && !seen.has(captured.sourceFingerprint)) {
        posts.push(captured);
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
      const captured = await capturePostFromPage(ctx.page, postUrl, profileHandle);
      if (!captured) continue;
      if (seen.has(captured.sourceFingerprint)) continue;
      posts.push(captured);
    }

    return { ok: true, posts, pausedForAuth: false };
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
