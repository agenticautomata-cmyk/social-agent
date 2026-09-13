/**
 * Stage 5 — permitted public browser fallback.
 *
 * May load a public URL, wait for content, capture rendered HTML.
 * May NOT solve CAPTCHA, bypass auth, rotate proxies, or evade rate limits.
 */

import { launchManagedChromium } from '../../playwright-runtime/index.js';

const BROWSER_TIMEOUT_MS = 35_000;
const READY_WAIT_MS = 20_000;

const CHALLENGE_RE =
  /captcha-delivery|geo\.captcha-delivery|datadome|cf-challenge|g-recaptcha|hcaptcha|verify you are human|enable js and disable any ad blocker/i;

const EVENT_READY_HINTS = [
  'application/ld+json',
  'tribe-events',
  'rhp-events',
  'eventDoorStartDate',
  'eventlist-event',
  'events-viewer',
  'Upcoming Events',
  '"events":[',
];

export type BrowserFallbackResult = {
  ok: boolean;
  html: string | null;
  finalUrl: string | null;
  status: number | null;
  blocked: boolean;
  challengeProvider: string | null;
  incompleteRender: boolean;
  reason: string | null;
};

export function htmlLooksLikeChallenge(html: string): boolean {
  if (!html) return false;
  if (html.length < 12_000 && CHALLENGE_RE.test(html)) return true;
  return false;
}

export async function fetchPublicBrowserHtml(
  url: string,
  opts?: { readySelectors?: string[]; timeoutMs?: number },
): Promise<BrowserFallbackResult> {
  let browser: Awaited<ReturnType<typeof launchManagedChromium>> | null = null;
  const timeoutMs = opts?.timeoutMs ?? BROWSER_TIMEOUT_MS;
  try {
    browser = await launchManagedChromium();
    const page = await browser.newPage();
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    const status = response?.status() ?? null;

    const ready = await Promise.race([
      page
        .waitForFunction(
          (hints: string[]) => {
            // Playwright runs this in the page; avoid DOM lib dependency in Node tsc.
            const g = globalThis as unknown as {
              document?: { documentElement?: { innerHTML?: string } };
            };
            const html = g.document?.documentElement?.innerHTML || '';
            if (html.length < 1500) return false;
            if (/captcha-delivery|datadome|Please enable JS/i.test(html) && html.length < 8000) {
              return false;
            }
            return hints.some((h) => html.includes(h));
          },
          EVENT_READY_HINTS,
          { timeout: READY_WAIT_MS },
        )
        .then(() => true)
        .catch(() => false),
    ]);

    const html = await page.content();
    const blocked = htmlLooksLikeChallenge(html);
    let challengeProvider: string | null = null;
    if (/datadome|captcha-delivery/i.test(html)) challengeProvider = 'datadome';
    else if (/cf-challenge|just a moment/i.test(html)) challengeProvider = 'cloudflare';
    else if (blocked) challengeProvider = 'unknown_challenge';

    if (blocked) {
      return {
        ok: false,
        html,
        finalUrl: page.url(),
        status,
        blocked: true,
        challengeProvider,
        incompleteRender: true,
        reason: `browser_blocked:${challengeProvider ?? 'challenge'}`,
      };
    }

    if (!ready || html.length < 1500) {
      return {
        ok: false,
        html,
        finalUrl: page.url(),
        status,
        blocked: false,
        challengeProvider: null,
        incompleteRender: true,
        reason: 'browser_wait_timeout_or_incomplete',
      };
    }

    return {
      ok: true,
      html,
      finalUrl: page.url(),
      status,
      blocked: false,
      challengeProvider: null,
      incompleteRender: false,
      reason: null,
    };
  } catch (err) {
    return {
      ok: false,
      html: null,
      finalUrl: null,
      status: null,
      blocked: false,
      challengeProvider: null,
      incompleteRender: true,
      reason: err instanceof Error ? err.message.slice(0, 200) : 'browser_fallback_failed',
    };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
