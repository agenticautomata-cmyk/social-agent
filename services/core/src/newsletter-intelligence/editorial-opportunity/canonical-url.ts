/**
 * Strip tracking / marketing parameters from article URLs for canonical identity.
 */

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'mc_cid',
  'mc_eid',
  'fbclid',
  'gclid',
  'msclkid',
  'igshid',
  'vero_id',
  'si',
  '_hsenc',
  '_hsmi',
  'ref',
  'source',
  'r',
  'token',
  'j',
]);

export function stripTrackingParams(url: string): string {
  try {
    const u = new URL(url);
    const keys = [...u.searchParams.keys()];
    for (const key of keys) {
      const lower = key.toLowerCase();
      if (TRACKING_PARAMS.has(lower) || lower.startsWith('utm_')) {
        u.searchParams.delete(key);
      }
    }
    u.hash = '';
    // Normalize trailing slash for identity (keep root slash).
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return url.trim();
  }
}

export function pickCanonicalArticleUrl(urls: string[]): string | null {
  const ranked = urls
    .map((u) => u.trim())
    .filter(Boolean)
    .map((u) => {
      try {
        const host = new URL(u).hostname.toLowerCase();
        const path = new URL(u).pathname.toLowerCase();
        let score = 0;
        if (/\/p\//.test(path) || /\/article\//.test(path) || /\/news\//.test(path)) score += 5;
        if (/substack\.com|beehiiv\.com|medium\.com|ghost\.io/.test(host)) score += 3;
        if (/redirect|track|click|list-manage|mailchi/.test(host + path)) score -= 5;
        if (path === '/' || path.length < 2) score -= 3;
        return { url: stripTrackingParams(u), score };
      } catch {
        return { url: u, score: -10 };
      }
    })
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.score != null && ranked[0].score >= 0 ? ranked[0].url : ranked[0]?.url ?? null;
}
