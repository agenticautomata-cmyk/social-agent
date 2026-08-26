import { fetchInstagramWithSession, isInstagramUrl } from './instagram-intake.js';
import { classifyStandaloneUrlType, isLinkHubUrl } from './url-type.js';

export const URL_SURFACE_PATHS = [
  '/',
  '/about',
  '/about-us',
  '/menu',
  '/menus',
  '/products',
  '/services',
  '/events',
  '/event',
  '/calendar',
  '/contact',
  '/contact-us',
  '/location',
  '/locations',
  '/visit',
  '/news',
  '/faq',
  '/vendors',
  '/order',
  '/hours',
] as const;

export type UrlFetchTier =
  | 'http_metadata'
  | 'html_text'
  | 'surface_crawl'
  | 'browser_render'
  | 'ocr_vision'
  | 'instagram_session'
  | 'video_transcript'
  | 'web_search';

export type UrlAccessBlockReason =
  | 'login_required'
  | 'captcha'
  | 'forbidden'
  | 'empty_body'
  | 'timeout'
  | null;

export type UrlIntakeDiagnostics = {
  url: string;
  domain: string;
  methodsAttempted: UrlFetchTier[];
  httpStatus: number | null;
  fetchOk: boolean;
  textLength: number;
  jsRenderingRequired: boolean;
  browserFallbackRan: boolean;
  browserFallbackOk: boolean;
  ocrAttempted: boolean;
  ocrOk: boolean;
  accessBlocked: boolean;
  blockReason: UrlAccessBlockReason;
  surfacesInspected: string[];
  webSearchFallback: boolean;
  nextAction: string;
  summary: string;
};

export type UrlPipelinePage = {
  ok: boolean;
  title?: string;
  description?: string;
  text?: string;
  diagnostics: UrlIntakeDiagnostics;
};

export function extractUrlsFromMessage(message: string, max = 2): string[] {
  const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/gi;
  const matches = message.match(URL_REGEX) ?? [];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const raw of matches) {
    const url = raw.replace(/[.,;:!?)]+$/, '');
    try {
      new URL(url);
    } catch {
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= max) break;
  }
  return urls;
}

export function isPlainUrlRequest(message: string, urls: string[]): boolean {
  if (urls.length === 0) return false;
  const trimmed = message.trim();
  let remainder = trimmed;
  for (const url of urls) {
    remainder = remainder.replace(url, '').trim();
  }
  if (remainder.length === 0) return true;
  if (urls.length === 1) {
    const a = trimmed.replace(/\/$/, '');
    const b = urls[0]!.replace(/\/$/, '');
    if (a === b) return true;
  }
  return false;
}

/** Minimum extracted text length before HTTP-only fetch is considered usable without browser. */
export const MIN_HTTP_USABLE_CHARS = 400;

const SPA_INJECTOR_RE =
  /portal\.cityspark\.com|cityspark|localist\.com|moderncampus/i;

const EVENT_DATE_CUE_RE =
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:,\s*\d{4})?\b/gi;

export function isClientRenderedListingUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    const path = parsed.pathname.toLowerCase();
    const hash = parsed.hash.toLowerCase();
    if (/\/(calendar|events?)(?:\/|$)/i.test(path)) return true;
    if (/#\//.test(hash) && /calendar|event/i.test(`${path} ${hash}`)) return true;
    return false;
  } catch {
    return false;
  }
}

export function hasDatedEventCues(text: string): boolean {
  const dates = text.match(EVENT_DATE_CUE_RE) ?? [];
  if (dates.length >= 2) return true;
  return /\b(view event|upcoming events)\b/i.test(text) && dates.length >= 1;
}

/** After browser render: dates, times, or a dense event listing — not nav chrome. */
export function hasUsableListingContent(text: string): boolean {
  if (hasDatedEventCues(text)) return true;
  const times = text.match(/\b\d{1,2}:\d{2}\s*(?:am|pm)\b/gi) ?? [];
  if (times.length >= 3) return true;
  const eventWords = text.match(/\b(concert|exhibition|opening|performance|workshop|festival|rsvp)\b/gi) ?? [];
  return eventWords.length >= 3 && text.trim().length > 2500;
}

/**
 * Thin application shell vs usable page content.
 * Do not treat raw character count alone as sufficient — WordPress/nav chrome
 * can exceed MIN_HTTP_USABLE_CHARS while the actual calendar is still unrendered.
 */
export function detectJsShell(html: string, text: string, pageUrl?: string): boolean {
  if (/sites-viewer-frontend|sites\.google\.com|window\['ppConfig'\]|google-sites/i.test(html)) {
    return true;
  }

  const scriptCount = (html.match(/<script/gi) ?? []).length;
  const textRatio = text.length / Math.max(html.length, 1);
  const dated = hasDatedEventCues(text);

  if (SPA_INJECTOR_RE.test(html) && !dated) return true;

  if (pageUrl && isClientRenderedListingUrl(pageUrl) && !dated) {
    if (scriptCount >= 2 || /#\//.test(pageUrl) || SPA_INJECTOR_RE.test(html) || textRatio < 0.08) {
      return true;
    }
  }

  // Low meaningful-text density: mostly scripts/template markup even when text is non-empty.
  if (scriptCount >= 3 && textRatio < 0.05 && !dated) return true;

  if (text.trim().length < 800 && scriptCount >= 3 && textRatio < 0.05) return true;

  return false;
}

/**
 * Detect hard access walls only. Do not treat CMS config keys (e.g. Squarespace
 * `captchaSettings`) or ordinary nav "Login" links as blocks that skip browser fallback.
 */
export function detectAccessBlock(html: string, status: number): UrlAccessBlockReason {
  if (status === 401 || status === 403) return status === 401 ? 'login_required' : 'forbidden';

  // Actual challenge widgets / interstitials — not JSON config containing "captcha".
  if (
    /g-recaptcha|h-captcha|hcaptcha|cf-challenge|cf-turnstile|challenges\.cloudflare\.com|data-sitekey|verify you are human|are you a robot|attention required|captcha-container|id=["']captcha["']/i.test(
      html,
    )
  ) {
    return 'captcha';
  }

  // Auth wall only when the document is thin (real login pages), not marketing sites with a Login nav item.
  const roughText = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (
    roughText.length < MIN_HTTP_USABLE_CHARS &&
    /sign in|log in|login required|authentication required/i.test(html.slice(0, 5000))
  ) {
    return 'login_required';
  }
  return null;
}

/** HTTP succeeded but content is empty/thin or still looks like a JS shell → try browser render. */
export function shouldAttemptBrowserFallback(input: {
  httpStatus: number | null;
  textLength: number;
  jsRenderingRequired: boolean;
  hardAccessBlock: boolean;
}): boolean {
  if (input.hardAccessBlock) return false;
  const httpOk = input.httpStatus !== null && input.httpStatus >= 200 && input.httpStatus < 400;
  if (!httpOk && input.textLength === 0) return false;
  return input.jsRenderingRequired || input.textLength < MIN_HTTP_USABLE_CHARS;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMeta(html: string): { title?: string; description?: string } {
  const ogTitle =
    html.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/content=["']([^"']+)["']\s+property=["']og:title["']/i)?.[1];
  const ogDesc =
    html.match(/property=["']og:description["']\s+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/content=["']([^"']+)["']\s+property=["']og:description["']/i)?.[1];
  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
  return {
    title: ogTitle?.trim() || titleTag?.trim(),
    description: ogDesc?.trim(),
  };
}

function extractJsonLdText(html: string): string {
  const blocks: string[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    try {
      const json = JSON.parse(match[1]!);
      blocks.push(JSON.stringify(json));
    } catch {
      blocks.push(match[1]!.slice(0, 2000));
    }
  }
  return blocks.join('\n');
}

function sameOriginLinks(html: string, baseUrl: string): string[] {
  let origin: string;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return [];
  }
  const hrefRe = /href=["']([^"'#]+)["']/gi;
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = hrefRe.exec(html)) !== null) {
    try {
      const resolved = new URL(match[1]!, baseUrl);
      if (resolved.origin !== origin) continue;
      found.add(resolved.href.split('#')[0]!);
    } catch {
      continue;
    }
  }
  return [...found];
}

function pickSurfaceUrls(baseUrl: string, html: string): string[] {
  const origin = new URL(baseUrl).origin;
  const links = sameOriginLinks(html, baseUrl);
  const picked = new Set<string>([baseUrl]);
  for (const path of URL_SURFACE_PATHS) {
    const candidate = `${origin}${path === '/' ? '' : path}`;
    if (links.some((l) => l.replace(/\/$/, '') === candidate.replace(/\/$/, ''))) {
      picked.add(candidate);
    }
  }
  for (const link of links) {
    if (/about|menu|event|contact|location|vendor|faq|news|order|hour/i.test(link)) {
      picked.add(link);
    }
    if (picked.size >= 8) break;
  }
  return [...picked].slice(0, 8);
}

async function httpFetchHtml(url: string): Promise<{
  ok: boolean;
  status: number;
  html: string;
  blockReason: UrlAccessBlockReason;
}> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: {
        'User-Agent': 'BensonBot/1.0 (+https://benson.kckellie.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    const html = await res.text();
    const blockReason = detectAccessBlock(html, res.status);
    return { ok: res.ok && html.length > 0, status: res.status, html, blockReason };
  } catch {
    return { ok: false, status: 0, html: '', blockReason: 'timeout' };
  }
}

const MAX_BROWSER_CONCURRENCY = 1;
const BROWSER_GOTO_TIMEOUT_MS = 20_000;
const BROWSER_CONTENT_WAIT_MS = 12_000;
let activeBrowserRenders = 0;

async function browserRender(url: string): Promise<{ ok: boolean; title?: string; text?: string }> {
  if (activeBrowserRenders >= MAX_BROWSER_CONCURRENCY) {
    return { ok: false };
  }
  activeBrowserRenders += 1;
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(url, {
        waitUntil: isClientRenderedListingUrl(url) ? 'load' : 'domcontentloaded',
        timeout: BROWSER_GOTO_TIMEOUT_MS,
      });
      const waitForListing = isClientRenderedListingUrl(url);
      // Wait for usable content. Calendar/SPA shells already have nav chrome (>400 chars),
      // so require dated event cues / event containers instead of raw length.
      await Promise.race([
        page.waitForFunction(
          (needListing: boolean) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const doc = (globalThis as any).document as { body?: { innerText?: string } } | undefined;
            const text = doc?.body?.innerText ?? '';
            if (!needListing) return text.trim().length >= 400;
            const dates =
              text.match(
                /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}\b/gi,
              ) ?? [];
            return dates.length >= 2 || /view event|upcoming events|rsvp/i.test(text);
          },
          waitForListing,
          { timeout: BROWSER_CONTENT_WAIT_MS },
        ),
        page
          .waitForSelector(
            'a[href*="/event"], a[href*="rsvp"], [class*="event"], iframe[src*="cityspark"], [id*="cityspark"], [class*="cityspark"], text=/Upcoming Events/i',
            { timeout: BROWSER_CONTENT_WAIT_MS },
          )
          .catch(() => null),
      ]).catch(() => null);

      const title = await page.title();
      const includeAllOutbound = isLinkHubUrl(url);
      const extracted = await page.evaluate((allOutbound: boolean) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const doc = (globalThis as any).document as {
          body?: { innerText?: string };
          title?: string;
          querySelectorAll: (sel: string) => ArrayLike<{ textContent?: string | null; href?: string }>;
        };
        const text = doc.body?.innerText ?? '';
        const anchors = Array.from(doc.querySelectorAll('a[href]'))
          .slice(0, 100)
          .map((a) => {
            const label = (a.textContent ?? '').replace(/\s+/g, ' ').trim();
            const href = a.href ?? '';
            if (!href || !/^https?:/i.test(href)) return '';
            if (allOutbound) return label ? `${label}: ${href}` : href;
            if (!label) return '';
            if (!/event|rsvp|ticket|calendar/i.test(`${label} ${href}`)) return '';
            return `${label}: ${href}`;
          })
          .filter(Boolean);
        return { text, links: anchors };
      }, includeAllOutbound);
      const frameBits: string[] = [];
      for (const frame of page.frames()) {
        if (frame === page.mainFrame()) continue;
        const frameUrl = frame.url();
        if (!/cityspark|calendar|localist|event/i.test(frameUrl) && frameUrl !== 'about:blank') {
          continue;
        }
        try {
          const frameText = await frame.evaluate(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const doc = (globalThis as any).document as { body?: { innerText?: string } } | undefined;
            return (doc?.body?.innerText ?? '').trim();
          });
          if (frameText.length > 80) frameBits.push(frameText);
        } catch {
          /* cross-origin or detached */
        }
      }
      const text = [extracted.text, ...extracted.links, ...frameBits].filter(Boolean).join('\n').slice(0, 16000);
      return { ok: text.trim().length > 100, title: title || undefined, text };
    } finally {
      await browser.close();
    }
  } catch {
    return { ok: false };
  } finally {
    activeBrowserRenders = Math.max(0, activeBrowserRenders - 1);
  }
}

async function ocrFromScreenshot(url: string): Promise<{ ok: boolean; text?: string }> {
  try {
    const { env } = await import('../env.js');
    if (!env.OPENAI_API_KEY) return { ok: false };
    const { chromium } = await import('playwright');
    const OpenAI = (await import('openai')).default;
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1280, height: 1600 });
      await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });
      const screenshot = await page.screenshot({ type: 'png', fullPage: true });
      const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract all visible text from this webpage screenshot — events, hours, menu items, contact info, about text. Return plain text only.',
              },
              {
                type: 'image_url',
                image_url: { url: `data:image/png;base64,${screenshot.toString('base64')}` },
              },
            ],
          },
        ],
        max_tokens: 1200,
      });
      const text = response.choices[0]?.message?.content?.trim();
      return { ok: Boolean(text && text.length > 80), text };
    } finally {
      await browser.close();
    }
  } catch {
    return { ok: false };
  }
}

export async function fetchUrlWithPipeline(url: string): Promise<UrlPipelinePage> {
  const parsed = new URL(url);
  const domain = parsed.hostname.replace(/^www\./, '');

  // Instagram serves a logged-out challenge page to anonymous fetches, so the
  // generic tiers below can never reach post content.
  if (isInstagramUrl(url)) {
    return fetchInstagramWithSession(url);
  }

  const diagnostics: UrlIntakeDiagnostics = {
    url,
    domain,
    methodsAttempted: [],
    httpStatus: null,
    fetchOk: false,
    textLength: 0,
    jsRenderingRequired: false,
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

  diagnostics.methodsAttempted.push('http_metadata');
  const primary = await httpFetchHtml(url);
  diagnostics.httpStatus = primary.status;
  diagnostics.fetchOk = primary.ok;
  diagnostics.blockReason = primary.blockReason;

  const hardAccessBlock =
    primary.status === 401 ||
    primary.status === 403 ||
    primary.blockReason === 'forbidden' ||
    (Boolean(primary.blockReason) && primary.html.length < 200);

  diagnostics.accessBlocked = hardAccessBlock;

  if (hardAccessBlock) {
    diagnostics.summary = `Access blocked (${primary.blockReason ?? primary.status}) for ${domain}.`;
    diagnostics.nextAction =
      primary.blockReason === 'login_required'
        ? 'Open the link in your browser while logged in, then share a screenshot or the specific event page.'
        : 'Try a direct event or menu subpage, or share a screenshot of the page.';
    return { ok: false, diagnostics };
  }

  // Soft captcha/login signals on HTTP 200 with a real HTML body are not terminal —
  // continue extraction and browser fallback (CMS pages often mention captcha in config JSON).
  if (primary.blockReason && !hardAccessBlock) {
    diagnostics.blockReason = null;
  }

  const meta = extractMeta(primary.html);
  const jsonLd = extractJsonLdText(primary.html);
  let text = [meta.description ?? '', jsonLd, htmlToText(primary.html)].filter(Boolean).join('\n\n');
  diagnostics.textLength = text.length;
  diagnostics.methodsAttempted.push('html_text');
  diagnostics.jsRenderingRequired = detectJsShell(primary.html, text, url);

  if (diagnostics.jsRenderingRequired || text.length < MIN_HTTP_USABLE_CHARS) {
    diagnostics.methodsAttempted.push('surface_crawl');
    const surfaces = pickSurfaceUrls(url, primary.html);
    diagnostics.surfacesInspected = surfaces;
    const chunks: string[] = [text];
    for (const surface of surfaces) {
      if (surface === url) continue;
      const sub = await httpFetchHtml(surface);
      if (!sub.ok) continue;
      const subText = htmlToText(sub.html);
      if (subText.length > 80) chunks.push(`--- ${surface} ---\n${subText}`);
    }
    text = chunks.filter(Boolean).join('\n\n').slice(0, 16000);
    diagnostics.textLength = text.length;
    diagnostics.jsRenderingRequired =
      diagnostics.jsRenderingRequired || detectJsShell(primary.html, text, url);
  }

  if (text.length >= MIN_HTTP_USABLE_CHARS && !diagnostics.jsRenderingRequired) {
    diagnostics.summary = `Fetched ${domain} via HTTP (${text.length} chars).`;
    diagnostics.nextAction = 'Review extracted opportunities below.';
    return { ok: true, title: meta.title, description: meta.description, text, diagnostics };
  }

  // HTTP 200 / thin or JS-shell → rendered browser fetch before declaring unreadable.
  // Never substitute paid web search for page content here.
  if (
    shouldAttemptBrowserFallback({
      httpStatus: diagnostics.httpStatus,
      textLength: diagnostics.textLength,
      jsRenderingRequired: diagnostics.jsRenderingRequired,
      hardAccessBlock: false,
    })
  ) {
    diagnostics.methodsAttempted.push('browser_render');
    diagnostics.browserFallbackRan = true;
    const rendered = await browserRender(url);
    diagnostics.browserFallbackOk = rendered.ok;
    if (rendered.ok && rendered.text) {
      text = rendered.text;
      diagnostics.textLength = text.length;
      diagnostics.jsRenderingRequired = true;
      const listingStillEmpty =
        isClientRenderedListingUrl(url) && !hasUsableListingContent(text);
      if (!listingStillEmpty) {
        diagnostics.summary = `Rendered ${domain} with browser fallback (${text.length} chars).`;
        diagnostics.nextAction = 'Review extracted opportunities below.';
        return {
          ok: true,
          title: rendered.title ?? meta.title,
          description: meta.description,
          text,
          diagnostics,
        };
      }
      diagnostics.summary = `Rendered ${domain} with browser fallback (${text.length} chars) but the calendar still had no usable event listings.`;
      diagnostics.nextAction =
        'I could not retrieve usable events from this calendar. Share a screenshot or paste a specific event.';
    }
  }

  if (diagnostics.jsRenderingRequired || primary.html.length > 0) {
    diagnostics.methodsAttempted.push('ocr_vision');
    diagnostics.ocrAttempted = true;
    const ocr = await ocrFromScreenshot(url);
    diagnostics.ocrOk = ocr.ok;
    if (ocr.ok && ocr.text) {
      text = ocr.text;
      diagnostics.textLength = text.length;
      diagnostics.summary = `Used screenshot OCR for ${domain} (${text.length} chars).`;
      diagnostics.nextAction = 'Review extracted opportunities below.';
      return { ok: true, title: meta.title, description: meta.description, text, diagnostics };
    }
  }

  diagnostics.summary = `Could not extract readable content from ${domain}. HTTP returned ${primary.status}; JavaScript rendering ${diagnostics.jsRenderingRequired ? 'was required' : 'may be required'}; browser fallback ${diagnostics.browserFallbackRan ? (diagnostics.browserFallbackOk ? 'ran but returned thin content' : 'failed or unavailable') : 'skipped'}.`;
  diagnostics.nextAction = isClientRenderedListingUrl(url)
    ? 'I could not retrieve usable events from this calendar. Share a screenshot or paste a specific event.'
    : 'Open the site in your browser and share a screenshot, a specific event subpage, or paste the event details in chat.';
  return { ok: false, title: meta.title, description: meta.description, text: text || undefined, diagnostics };
}

export function buildUrlIntakeFailureAnswer(input: {
  urls: string[];
  diagnostics: UrlIntakeDiagnostics[];
  userMessage?: string;
}): { answer: string; evidence: string[]; suggestedActions: string[] } {
  const primary = input.diagnostics[0];
  const domain = primary?.domain ?? input.urls[0] ?? 'that site';
  const zeroUsableContent = Boolean(primary?.fetchOk) && (primary?.textLength ?? 0) === 0;

  const lines: string[] = zeroUsableContent
    ? [
        `I could open the page, but I couldn't extract enough usable information to identify a current event or opportunity.`,
      ]
    : [`I couldn't pull structured opportunities from ${domain} automatically.`];

  if (primary) {
    if (!zeroUsableContent) lines.push(primary.summary);
    else if (primary.summary) lines.push(primary.summary);
    const methodTrail = primary.methodsAttempted.join(' → ');
    if (methodTrail) lines.push(`Attempted: ${methodTrail}.`);
    if (primary.httpStatus) lines.push(`HTTP status: ${primary.httpStatus}.`);
    if (primary.jsRenderingRequired) {
      lines.push('This page needs JavaScript rendering — plain fetch was not enough.');
    }
    if (primary.browserFallbackRan) {
      lines.push(
        primary.browserFallbackOk
          ? 'Browser fallback ran but still found no extractable events.'
          : 'Browser fallback did not complete successfully on the server.',
      );
    }
    if (primary.accessBlocked) {
      lines.push(`Access looks blocked (${primary.blockReason ?? 'restricted'}).`);
    }
    if (primary.surfacesInspected.length > 0) {
      lines.push(`Checked surfaces: ${primary.surfacesInspected.slice(0, 5).join(', ')}.`);
    }
  }

  if (!zeroUsableContent) {
    lines.push(primary?.nextAction ?? 'Share a screenshot or specific event page and I can retry.');
  }

  const evidence = input.diagnostics.flatMap((d) => [
    `${d.domain}: HTTP ${d.httpStatus ?? '—'}, ${d.textLength} chars, JS=${d.jsRenderingRequired ? 'yes' : 'no'}, browser=${d.browserFallbackRan ? (d.browserFallbackOk ? 'ok' : 'failed') : 'skipped'}`,
  ]);

  const calendarUrl = input.urls.some((u) => isClientRenderedListingUrl(u));
  const socialOrHubUrl = input.urls.some((u) => {
    const type = classifyStandaloneUrlType(u);
    return type === 'social_post' || type === 'social_profile' || type === 'link_hub';
  });
  const suggestedActions = zeroUsableContent
    ? ['Retry / research this URL', 'Keep as source', 'Dismiss']
    : calendarUrl
      ? [
          primary?.nextAction && !/\/events or \/menu/i.test(primary.nextAction)
            ? primary.nextAction
            : 'Share a screenshot of the rendered calendar',
          'Paste a specific event from the calendar',
          'Keep as source',
        ]
      : socialOrHubUrl
        ? [
            primary?.nextAction && !/\/events or \/menu/i.test(primary.nextAction)
              ? primary.nextAction
              : 'Keep as source → /watchlist/add',
            'Share a screenshot if the page did not load',
            'Keep as source',
          ]
        : [
            primary?.nextAction ?? 'Share a screenshot of the page',
            'Paste a direct /events or /menu subpage if one exists',
            'Tell Benson what you want from this site (hours, events, vendor list)',
          ].filter(Boolean);

  return {
    answer: lines.join(' '),
    evidence: evidence.slice(0, 4),
    suggestedActions: suggestedActions.slice(0, 3),
  };
}
