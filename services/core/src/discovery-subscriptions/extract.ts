const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/gi;
const HREF_REGEX = /href\s*=\s*["']([^"']+)["']/gi;

function cleanUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/[.,;]+$/, '');
  if (!/^https:\/\//i.test(trimmed)) return null;
  try {
    return new URL(trimmed).toString();
  } catch {
    return null;
  }
}

export function extractUrlsFromText(text: string): string[] {
  const matches = text.match(URL_REGEX) ?? [];
  return [...new Set(matches.map((u) => cleanUrl(u)).filter((u): u is string => Boolean(u)))];
}

export function extractUrlsFromHtml(html: string): string[] {
  const urls: string[] = [];
  for (const match of html.matchAll(HREF_REGEX)) {
    const href = match[1];
    if (!href) continue;
    if (href.startsWith('mailto:') || href.startsWith('tel:')) continue;
    const absolute = cleanUrl(href);
    if (absolute) urls.push(absolute);
  }
  return [...new Set(urls)];
}

const CONFIRM_LINK_HINTS =
  /\b(confirm|verify|activate|validation|opt-?in|subscribe|subscription|registration)\b/i;

const NEGATIVE_LINK_HINTS =
  /\b(unsubscribe|opt-?out|manage\s+preferences|privacy\s+policy|view\s+in\s+browser)\b/i;

export function pickConfirmationLink(urls: string[]): string | null {
  const scored = urls
    .filter((url) => !NEGATIVE_LINK_HINTS.test(url))
    .map((url) => {
      let score = 0;
      if (CONFIRM_LINK_HINTS.test(url)) score += 3;
      if (/confirm/i.test(url)) score += 2;
      if (/verify/i.test(url)) score += 2;
      if (/activate/i.test(url)) score += 1;
      return { url, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.url ?? null;
}

const CODE_PATTERNS = [
  /\bverification\s+code(?:\s+is)?[:\s]+([A-Z0-9-]{4,12})\b/i,
  /\benter\s+(?:this\s+)?(?:code|verification\s+code)[:\s]+([A-Z0-9-]{4,12})\b/i,
  /\bconfirmation\s+code[:\s]+([A-Z0-9-]{4,12})\b/i,
  /\bone-time\s+code[:\s]+([A-Z0-9-]{4,12})\b/i,
  /\bcode[:\s]+([0-9]{4,8})\b/i,
];

export function extractVerificationCode(text: string): string | null {
  for (const pattern of CODE_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

export function sanitizeUrlForDisplay(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (/token|code|key|sig|hash|confirm/i.test(key)) {
        parsed.searchParams.set(key, '***');
      }
    }
    return parsed.toString();
  } catch {
    return url.replace(/[A-Za-z0-9_-]{16,}/g, '***');
  }
}

export function domainFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  return email.slice(at + 1).trim().toLowerCase() || null;
}

export function domainFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function rootDomain(hostname: string): string {
  const parts = hostname.split('.').filter(Boolean);
  if (parts.length <= 2) return hostname;
  return parts.slice(-2).join('.');
}
