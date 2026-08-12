import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { CapturedCarouselItem, InstagramPostMediaType } from './instagram-intake-types.js';
import { isInstagramPostOrReelUrl, normalizeInstagramUrl } from './instagram-url.js';
import {
  extractCaptionFromPage,
  extractHandleFromPostPage,
  postFingerprint,
} from './instagram-page-utils.js';
import {
  detectInstagramAuthWall,
  dismissInstagramConsentIfPresent,
  isInstagramConsentPage,
} from './instagram-session.js';
import type { CapturedSocialPost, CuratorPostType } from './types.js';

const PRIVATE_RE = /this account is private|follow to see|followers only/i;
const UNAVAILABLE_RE = /sorry, this page isn't available|post has been deleted|link may be broken/i;

export type PostCaptureFailure = {
  code:
    | 'login_required'
    | 'challenge_required'
    | 'consent_required'
    | 'post_unavailable'
    | 'private_account'
    | 'capture_empty';
  stage: string;
  detail: string;
};

export type DetailedPostCapture = {
  ok: boolean;
  post: CapturedSocialPost | null;
  mediaType: InstagramPostMediaType;
  carouselItems: CapturedCarouselItem[];
  imageItemsCaptured: number;
  videoItemsCaptured: number;
  screenshotsCreated: number;
  captionCharCount: number;
  failure: PostCaptureFailure | null;
  finalUrl: string | null;
};

function cacheRoot(): string {
  return (
    process.env.INSTAGRAM_INTAKE_CACHE_DIR?.trim() ||
    resolve(process.cwd(), '../../.cache/instagram-intake')
  );
}

function shortcodeFromUrl(postUrl: string): string {
  const match = postUrl.match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  return match?.[1] ?? createHash('sha256').update(postUrl).digest('hex').slice(0, 11);
}

function inferMediaType(
  postUrl: string,
  items: CapturedCarouselItem[],
): InstagramPostMediaType {
  if (/\/reel\//i.test(postUrl)) return 'reel';
  const images = items.filter((i) => i.kind === 'image').length;
  const videos = items.filter((i) => i.kind === 'video').length;
  if (items.length <= 1) {
    if (videos === 1) return /\/reel\//i.test(postUrl) ? 'reel' : 'single_video';
    if (images === 1) return 'single_image';
    return 'unknown';
  }
  if (videos > 0 && images > 0) return 'carousel_mixed';
  if (videos > 0) return 'single_video';
  return 'carousel_images';
}

async function postScreenshotLocator(page: import('playwright').Page) {
  const mainSection = page.locator('main section').first();
  if (await mainSection.isVisible({ timeout: 1500 }).catch(() => false)) {
    return mainSection;
  }
  const article = page.locator('article').first();
  if (await article.isVisible({ timeout: 1000 }).catch(() => false)) {
    return article;
  }
  return page.locator('main').first();
}

async function screenshotArticleBuffer(page: import('playwright').Page): Promise<Buffer | null> {
  try {
    const clip = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll('main img[src*="cdninstagram"], main img[src*="fbcdn"]')]
        .map((el) => {
          const r = (el as HTMLImageElement).getBoundingClientRect();
          return { w: r.width, h: r.height, x: r.x, y: r.y };
        })
        .filter((r) => r.w > 120 && r.h > 120)
        .sort((a, b) => b.w * b.h - a.w * a.h)[0];
      if (!imgs) return null;
      return {
        x: Math.max(0, Math.floor(imgs.x)),
        y: Math.max(0, Math.floor(imgs.y)),
        width: Math.floor(imgs.w),
        height: Math.floor(imgs.h),
      };
    });
    if (clip) {
      return await page.screenshot({ clip, timeout: 12000 });
    }
    const target = await postScreenshotLocator(page);
    return await target.screenshot({ timeout: 12000 });
  } catch {
    return null;
  }
}

async function screenshotArticle(page: import('playwright').Page, destPath: string): Promise<boolean> {
  const buf = await screenshotArticleBuffer(page);
  if (!buf) return false;
  await writeFile(destPath, buf);
  return true;
}

async function hashScreenshot(page: import('playwright').Page): Promise<string | null> {
  const buf = await screenshotArticleBuffer(page);
  if (!buf) return null;
  return createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

async function grabVisibleImageUrl(page: import('playwright').Page): Promise<string | null> {
  return page.evaluate(() => {
    let best: string | null = null;
    let bestArea = 0;
    for (const el of document.querySelectorAll(
      'main img[src*="cdninstagram"], main img[src*="fbcdn"], img[src*="cdninstagram"]',
    )) {
      const img = el as HTMLImageElement;
      const src = img.src ?? '';
      if (!src || src.includes('profile_pic') || src.length < 40) continue;
      const r = img.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea && r.width > 120 && r.height > 120) {
        bestArea = area;
        best = src;
      }
    }
    return best;
  });
}

async function waitForReelPlayer(page: import('playwright').Page): Promise<void> {
  await page
    .waitForSelector('video, main img[src*="cdninstagram"], main img[src*="fbcdn"]', {
      timeout: 8000,
    })
    .catch(() => undefined);
  await page.waitForTimeout(1200);
}

async function pageHasVisibleVideo(page: import('playwright').Page): Promise<boolean> {
  return page
    .locator('main video, article video, video')
    .first()
    .isVisible({ timeout: 1500 })
    .catch(() => false);
}

async function captureCurrentSlide(
  page: import('playwright').Page,
  index: number,
  screenshotDir: string,
  postUrl: string,
): Promise<CapturedCarouselItem | null> {
  const isReelUrl = /\/reel\//i.test(postUrl) || /\/tv\//i.test(postUrl);
  if (isReelUrl && index === 0) {
    await waitForReelPlayer(page);
  }

  const hasVideo =
    (await pageHasVisibleVideo(page)) ||
    (isReelUrl && (await page.locator('video').count().catch(() => 0)) > 0);

  const screenshotPath = join(screenshotDir, `item-${index + 1}.jpg`);
  const shotOk = await screenshotArticle(page, screenshotPath);

  if (hasVideo || isReelUrl) {
    const video = page.locator('main video, article video, video').first();
    const videoUrl = (await pageHasVisibleVideo(page))
      ? (await video.getAttribute('src', { timeout: 3000 }).catch(() => null)) ||
        (await video
          .evaluate((el) => (el as HTMLVideoElement).currentSrc || '')
          .catch(() => '')) ||
        null
      : null;
    const durationRaw = (await pageHasVisibleVideo(page))
      ? await video
          .evaluate((el) => {
            const v = el as HTMLVideoElement;
            return Number.isFinite(v.duration) ? v.duration : null;
          })
          .catch(() => null)
      : null;

    if (!shotOk && !videoUrl && !isReelUrl) return null;

    return {
      index,
      kind: 'video',
      imageUrl: null,
      videoUrl: videoUrl?.trim() || null,
      screenshotPath: shotOk ? screenshotPath : null,
      durationSeconds: typeof durationRaw === 'number' ? durationRaw : null,
    };
  }

  const imageUrl = await grabVisibleImageUrl(page);

  if (!shotOk && !imageUrl) return null;

  return {
    index,
    kind: 'image',
    imageUrl,
    videoUrl: null,
    screenshotPath: shotOk ? screenshotPath : null,
    durationSeconds: null,
  };
}

export async function captureInstagramPostMedia(
  page: import('playwright').Page,
  postUrl: string,
  profileHandle: string,
  options?: { maxCarouselItems?: number; pageWaitUntil?: 'domcontentloaded' | 'networkidle' },
): Promise<DetailedPostCapture> {
  const normalizedPostUrl = normalizeInstagramUrl(postUrl) ?? postUrl.split('?')[0]!;
  const maxItems = options?.maxCarouselItems ?? 12;
  const shortcode = shortcodeFromUrl(normalizedPostUrl);
  const screenshotDir = join(cacheRoot(), shortcode, 'screenshots');
  await mkdir(screenshotDir, { recursive: true });

  await page.goto(normalizedPostUrl, {
    waitUntil: options?.pageWaitUntil ?? 'domcontentloaded',
    timeout: 45000,
  });

  let finalUrl = page.url();
  let bodyText = String(
    await page.evaluate(`(() => document.body?.innerText?.slice(0, 5000) ?? '')()`),
  );
  if (isInstagramConsentPage(finalUrl, bodyText)) {
    const dismissed = await dismissInstagramConsentIfPresent(page);
    if (!dismissed) {
      return {
        ok: false,
        post: null,
        mediaType: 'unknown',
        carouselItems: [],
        imageItemsCaptured: 0,
        videoItemsCaptured: 0,
        screenshotsCreated: 0,
        captionCharCount: 0,
        failure: {
          code: 'consent_required',
          stage: 'cookie_consent',
          detail: 'Instagram cookie consent must be accepted in the saved session',
        },
        finalUrl: page.url(),
      };
    }
    await page.goto(normalizedPostUrl, {
      waitUntil: options?.pageWaitUntil ?? 'domcontentloaded',
      timeout: 45000,
    });
    finalUrl = page.url();
    bodyText = String(
      await page.evaluate(`(() => document.body?.innerText?.slice(0, 5000) ?? '')()`),
    );
  }

  const auth = await detectInstagramAuthWall(page);
  if (auth === 'captcha_blocked') {
    return {
      ok: false,
      post: null,
      mediaType: 'unknown',
      carouselItems: [],
      imageItemsCaptured: 0,
      videoItemsCaptured: 0,
      screenshotsCreated: 0,
      captionCharCount: 0,
      failure: { code: 'challenge_required', stage: 'auth_wall', detail: finalUrl },
      finalUrl,
    };
  }
  if (auth === 'login_required') {
    return {
      ok: false,
      post: null,
      mediaType: 'unknown',
      carouselItems: [],
      imageItemsCaptured: 0,
      videoItemsCaptured: 0,
      screenshotsCreated: 0,
      captionCharCount: 0,
      failure: { code: 'login_required', stage: 'auth_wall', detail: 'Instagram login/challenge page' },
      finalUrl,
    };
  }

  if (PRIVATE_RE.test(bodyText)) {
    return {
      ok: false,
      post: null,
      mediaType: 'unknown',
      carouselItems: [],
      imageItemsCaptured: 0,
      videoItemsCaptured: 0,
      screenshotsCreated: 0,
      captionCharCount: 0,
      failure: { code: 'private_account', stage: 'post_page', detail: 'Account or post is private' },
      finalUrl,
    };
  }
  if (UNAVAILABLE_RE.test(bodyText)) {
    return {
      ok: false,
      post: null,
      mediaType: 'unknown',
      carouselItems: [],
      imageItemsCaptured: 0,
      videoItemsCaptured: 0,
      screenshotsCreated: 0,
      captionCharCount: 0,
      failure: { code: 'post_unavailable', stage: 'post_page', detail: bodyText.slice(0, 200) },
      finalUrl,
    };
  }

  const handle = await extractHandleFromPostPage(page, profileHandle);
  const caption = await extractCaptionFromPage(page);
  const captionCharCount = caption?.length ?? 0;
  const timeEl = await page
    .locator('time')
    .first()
    .getAttribute('datetime', { timeout: 3000 })
    .catch(() => null);

  const carouselItems: CapturedCarouselItem[] = [];
  let screenshotsCreated = 0;

  const first = await captureCurrentSlide(page, 0, screenshotDir, normalizedPostUrl);
  if (first) {
    carouselItems.push(first);
    if (first.screenshotPath) screenshotsCreated += 1;
  }

  while (carouselItems.length < maxItems) {
    const nextBtn = page.locator('button[aria-label="Next"], button[aria-label="Go to next"]').first();
    if (!(await nextBtn.isVisible({ timeout: 800 }).catch(() => false))) break;
    await nextBtn.click({ timeout: 3000 }).catch(() => undefined);
    await page.waitForTimeout(1600);
    const item = await captureCurrentSlide(page, carouselItems.length, screenshotDir, normalizedPostUrl);
    if (!item) break;
    carouselItems.push(item);
    if (item.screenshotPath) screenshotsCreated += 1;
  }

  // Collapse trailing duplicate slides (transition frames).
  const deduped: CapturedCarouselItem[] = [];
  for (const item of carouselItems) {
    const prev = deduped[deduped.length - 1];
    if (prev?.imageUrl && item.imageUrl && prev.imageUrl === item.imageUrl) continue;
    deduped.push({ ...item, index: deduped.length });
  }
  if (deduped.length >= 1) {
    carouselItems.length = 0;
    carouselItems.push(...deduped);
  }

  const imageItemsCaptured = carouselItems.filter((i) => i.kind === 'image').length;
  const videoItemsCaptured = carouselItems.filter((i) => i.kind === 'video').length;
  const mediaType = inferMediaType(normalizedPostUrl, carouselItems);

  if (carouselItems.length === 0) {
    return {
      ok: false,
      post: null,
      mediaType,
      carouselItems,
      imageItemsCaptured,
      videoItemsCaptured,
      screenshotsCreated,
      captionCharCount,
      failure: { code: 'capture_empty', stage: 'carousel_capture', detail: 'No media items captured' },
      finalUrl,
    };
  }

  const slideImageUrls = carouselItems
    .map((i) => i.imageUrl)
    .filter((u): u is string => Boolean(u));

  let postType: CuratorPostType = 'unknown';
  if (mediaType === 'reel' || mediaType === 'single_video') postType = 'reel';
  else if (carouselItems.length > 1) postType = 'carousel';
  else if (carouselItems.length === 1) postType = 'single';

  const post: CapturedSocialPost = {
    postUrl: normalizedPostUrl,
    profileHandle: handle,
    publishedAt: timeEl,
    caption,
    postType,
    sourceFingerprint: postFingerprint(normalizedPostUrl, caption, carouselItems.length),
    outboundLinks: [
      ...new Set(
        await page.$$eval('article a[href^="http"]', (links) =>
          links.map((a) => (a as { href?: string }).href ?? '').filter(Boolean),
        ),
      ),
    ].slice(0, 10),
    ephemeralSource: false,
    slideImageUrls,
    mediaItems: carouselItems,
    mediaType,
  };

  return {
    ok: true,
    post,
    mediaType,
    carouselItems,
    imageItemsCaptured,
    videoItemsCaptured,
    screenshotsCreated,
    captionCharCount,
    failure: null,
    finalUrl,
  };
}

export function isInstagramPostUrlForIntake(url: string): boolean {
  return isInstagramPostOrReelUrl(url);
}

/** Persist raw video bytes for ffmpeg processing (cached by shortcode + item index). */
export async function downloadInstagramVideoWithSession(
  page: import('playwright').Page,
  videoUrl: string,
  shortcode: string,
  itemIndex: number,
): Promise<{ path: string | null; error: string | null }> {
  const dir = join(cacheRoot(), shortcode, 'video');
  await mkdir(dir, { recursive: true });
  const dest = join(dir, `item-${itemIndex + 1}.mp4`);
  try {
    const resp = await page.request.get(videoUrl);
    if (!resp.ok()) return { path: null, error: `video_download_http_${resp.status()}` };
    const buf = await resp.body();
    if (buf.length < 256) return { path: null, error: 'video_download_empty' };
    await writeFile(dest, buf);
    return { path: dest, error: null };
  } catch (err) {
    return {
      path: null,
      error: err instanceof Error ? err.message.slice(0, 120) : 'video_download_failed',
    };
  }
}
