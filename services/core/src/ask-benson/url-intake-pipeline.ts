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

export function detectJsShell(html: string, text: string): boolean {
  if (text.trim().length >= 800) return false;
  if (/sites-viewer-frontend|sites\.google\.com|window\['ppConfig'\]|google-sites/i.test(html)) {
    return true;
  }
  const scriptChars = (html.match(/<script/gi) ?? []).length;
  const textRatio = text.length / Math.max(html.length, 1);
  return scriptChars >= 3 && textRatio < 0.05;
}

export function detectAccessBlock(html: string, status: number): UrlAccessBlockReason {
  if (status === 401 || status === 403) return status === 401 ? 'login_required' : 'forbidden';
  if (/captcha|g-recaptcha|hcaptcha|cf-challenge|turnstile/i.test(html)) return 'captcha';
  if (/sign in|log in|login required|authentication required/i.test(html.slice(0, 5000))) {
    return 'login_required';
  }
  return null;
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

async function browserRender(url: string): Promise<{ ok: boolean; title?: string; text?: string }> {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });
      const title = await page.title();
      const text = await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const doc = (globalThis as any).document as { body?: { innerText?: string } } | undefined;
        return doc?.body?.innerText ?? '';
      });
      return { ok: text.trim().length > 100, title: title || undefined, text: text.slice(0, 14000) };
    } finally {
      await browser.close();
    }
  } catch {
    return { ok: false };
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
  diagnostics.accessBlocked = Boolean(primary.blockReason);

  if (diagnostics.accessBlocked) {
    diagnostics.summary = `Access blocked (${primary.blockReason}) for ${domain}.`;
    diagnostics.nextAction =
      primary.blockReason === 'login_required'
        ? 'Open the link in your browser while logged in, then share a screenshot or the specific event page.'
        : 'Try a direct event or menu subpage, or share a screenshot of the page.';
    return { ok: false, diagnostics };
  }

  const meta = extractMeta(primary.html);
  const jsonLd = extractJsonLdText(primary.html);
  let text = [meta.description ?? '', jsonLd, htmlToText(primary.html)].filter(Boolean).join('\n\n');
  diagnostics.textLength = text.length;
  diagnostics.jsRenderingRequired = detectJsShell(primary.html, text);

  if (diagnostics.jsRenderingRequired || text.length < 400) {
    diagnostics.methodsAttempted.push('html_text');
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
  }

  if (text.length >= 400 && !diagnostics.jsRenderingRequired) {
    diagnostics.summary = `Fetched ${domain} via HTTP (${text.length} chars).`;
    diagnostics.nextAction = 'Review extracted opportunities below.';
    return { ok: true, title: meta.title, description: meta.description, text, diagnostics };
  }

  diagnostics.methodsAttempted.push('browser_render');
  diagnostics.browserFallbackRan = true;
  const rendered = await browserRender(url);
  diagnostics.browserFallbackOk = rendered.ok;
  if (rendered.ok && rendered.text) {
    text = rendered.text;
    diagnostics.textLength = text.length;
    diagnostics.jsRenderingRequired = true;
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

  diagnostics.summary = `Could not extract readable content from ${domain}. HTTP returned ${primary.status}; JavaScript rendering ${diagnostics.jsRenderingRequired ? 'was required' : 'may be required'}; browser fallback ${rendered.ok ? 'ran but returned thin content' : 'failed or unavailable'}.`;
  diagnostics.nextAction =
    'Open the site in your browser and share a screenshot, a specific event subpage, or paste the event details in chat.';
  return { ok: false, title: meta.title, description: meta.description, text: text || undefined, diagnostics };
}

export function buildUrlIntakeFailureAnswer(input: {
  urls: string[];
  diagnostics: UrlIntakeDiagnostics[];
  userMessage?: string;
}): { answer: string; evidence: string[]; suggestedActions: string[] } {
  const primary = input.diagnostics[0];
  const domain = primary?.domain ?? input.urls[0] ?? 'that site';
  const lines: string[] = [
    `I couldn't pull structured opportunities from ${domain} automatically.`,
  ];

  if (primary) {
    lines.push(primary.summary);
    const methodTrail = primary.methodsAttempted.join(' → ');
    lines.push(`Attempted: ${methodTrail}.`);
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

  lines.push(primary?.nextAction ?? 'Share a screenshot or specific event page and I can retry.');

  const evidence = input.diagnostics.flatMap((d) => [
    `${d.domain}: HTTP ${d.httpStatus ?? '—'}, ${d.textLength} chars, JS=${d.jsRenderingRequired ? 'yes' : 'no'}, browser=${d.browserFallbackRan ? (d.browserFallbackOk ? 'ok' : 'failed') : 'skipped'}`,
  ]);

  const suggestedActions = [
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
