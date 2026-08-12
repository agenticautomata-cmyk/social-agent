import { createHash } from 'node:crypto';

const RESERVED_PATHS = /^(p|reel|tv|explore|stories|s)$/i;

export function postFingerprint(postUrl: string, caption: string | null, slideCount: number): string {
  return createHash('sha256')
    .update(`${postUrl}|${caption?.slice(0, 200) ?? ''}|${slideCount}`)
    .digest('hex')
    .slice(0, 32);
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

  const og = await page.locator('meta[property="og:description"]').getAttribute('content', { timeout: 5000 }).catch(() => null);
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
  const og = await page.locator('meta[property="og:description"]').getAttribute('content', { timeout: 5000 }).catch(() => null);
  if (og) {
    const match = og.match(/-\s*(@?[\w.]+)\s+on\s/i);
    if (match?.[1]) return match[1].replace(/^@/, '');
  }

  const profileHref = await page
    .locator('header a[href^="/"][href$="/"]')
    .first()
    .getAttribute('href', { timeout: 3000 })
    .catch(() => null);
  if (profileHref) {
    const handle = profileHref.replace(/^\/+|\/+$/g, '').replace(/^@/, '');
    if (handle && !RESERVED_PATHS.test(handle)) return handle;
  }

  return fallback;
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
