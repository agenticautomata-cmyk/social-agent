/**
 * Polite fetching for the source registry.
 *
 * Three rules, all of them non-negotiable:
 *   1. robots.txt is checked before the page, and a disallow is obeyed. A refusal is
 *      recorded as a legitimate state, not retried and not logged as an error.
 *   2. A published `Crawl-delay` is honored per host. Visit KC publishes 5 seconds.
 *   3. Benson identifies itself. A scraper that lies about who it is has no business
 *      asking a hotel for a hosted stay.
 */

const USER_AGENT =
  'BensonBot/1.0 (+https://benson.kckellie.com; Kansas City creator partnership research)';

const DEFAULT_TIMEOUT_MS = 20_000;

export type RobotsRules = {
  /** Paths disallowed for our user-agent (or for `*`). */
  disallow: string[];
  allow: string[];
  crawlDelaySeconds: number | null;
  /** True when robots.txt itself could not be read — we then proceed cautiously. */
  unavailable: boolean;
};

const robotsCache = new Map<string, { rules: RobotsRules; fetchedAt: number }>();
const ROBOTS_TTL_MS = 6 * 60 * 60 * 1000;
const lastRequestByHost = new Map<string, number>();

export function parseRobotsTxt(body: string): RobotsRules {
  const lines = body.split('\n');
  const groups: Array<{ agents: string[]; disallow: string[]; allow: string[]; delay: number | null }> =
    [];
  let current: (typeof groups)[number] | null = null;
  let lastLineWasAgent = false;

  for (const raw of lines) {
    const line = raw.split('#')[0]!.trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === 'user-agent') {
      if (!current || !lastLineWasAgent) {
        current = { agents: [], disallow: [], allow: [], delay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastLineWasAgent = true;
      continue;
    }
    lastLineWasAgent = false;
    if (!current) continue;
    if (field === 'disallow') {
      if (value) current.disallow.push(value);
    } else if (field === 'allow') {
      if (value) current.allow.push(value);
    } else if (field === 'crawl-delay') {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) current.delay = parsed;
    }
  }

  // A group naming us specifically wins over the wildcard group.
  const specific = groups.find((g) => g.agents.some((a) => a.includes('bensonbot')));
  const wildcard = groups.find((g) => g.agents.includes('*'));
  const chosen = specific ?? wildcard;
  if (!chosen) {
    return { disallow: [], allow: [], crawlDelaySeconds: null, unavailable: false };
  }
  return {
    disallow: chosen.disallow,
    allow: chosen.allow,
    crawlDelaySeconds: chosen.delay,
    unavailable: false,
  };
}

export async function getRobotsRules(url: string): Promise<RobotsRules> {
  const parsed = new URL(url);
  const host = parsed.host;
  const cached = robotsCache.get(host);
  if (cached && Date.now() - cached.fetchedAt < ROBOTS_TTL_MS) return cached.rules;

  let rules: RobotsRules;
  try {
    const response = await fetch(`${parsed.protocol}//${host}/robots.txt`, {
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) {
      rules = parseRobotsTxt(await response.text());
    } else if (response.status === 404) {
      // No robots.txt means no restrictions. That is the standard reading.
      rules = { disallow: [], allow: [], crawlDelaySeconds: null, unavailable: false };
    } else {
      rules = { disallow: [], allow: [], crawlDelaySeconds: null, unavailable: true };
    }
  } catch {
    rules = { disallow: [], allow: [], crawlDelaySeconds: null, unavailable: true };
  }

  robotsCache.set(host, { rules, fetchedAt: Date.now() });
  return rules;
}

/** Longest-match wins, and an explicit Allow beats a Disallow of the same specificity. */
export function isPathAllowed(rules: RobotsRules, pathname: string): boolean {
  const match = (patterns: string[]): number => {
    let best = -1;
    for (const pattern of patterns) {
      if (pathname.startsWith(pattern) && pattern.length > best) best = pattern.length;
    }
    return best;
  };
  const disallowed = match(rules.disallow);
  if (disallowed < 0) return true;
  return match(rules.allow) >= disallowed;
}

async function respectCrawlDelay(host: string, delaySeconds: number | null): Promise<void> {
  if (!delaySeconds || delaySeconds <= 0) return;
  const last = lastRequestByHost.get(host);
  if (last === undefined) return;
  const waitMs = delaySeconds * 1000 - (Date.now() - last);
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
}

export type SourceFetchResult =
  | { ok: true; status: number; body: string; finalUrl: string }
  | { ok: false; robotsDisallowed: true; reason: string }
  | { ok: false; robotsDisallowed: false; status: number | null; reason: string };

/**
 * Fetches a page, obeying robots.txt and the crawl delay.
 *
 * `configuredCrawlDelaySeconds` is the delay recorded on the source row. The stricter
 * of that and whatever robots.txt publishes is used, so a conservative registry value
 * is never loosened by a permissive robots.txt.
 */
export async function fetchSourcePage(
  url: string,
  options: { configuredCrawlDelaySeconds?: number | null; timeoutMs?: number } = {},
): Promise<SourceFetchResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, robotsDisallowed: false, status: null, reason: 'The URL is not valid.' };
  }

  const rules = await getRobotsRules(url);
  if (!isPathAllowed(rules, parsed.pathname)) {
    return {
      ok: false,
      robotsDisallowed: true,
      reason: `${parsed.host} disallows this path in robots.txt.`,
    };
  }

  const delay = Math.max(
    options.configuredCrawlDelaySeconds ?? 0,
    rules.crawlDelaySeconds ?? 0,
  );
  await respectCrawlDelay(parsed.host, delay || null);
  lastRequestByHost.set(parsed.host, Date.now());

  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    const body = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        robotsDisallowed: false,
        status: response.status,
        reason: `${parsed.host} returned HTTP ${response.status}.`,
      };
    }
    return { ok: true, status: response.status, body, finalUrl: response.url || url };
  } catch (err) {
    const reason =
      err instanceof Error && err.name === 'TimeoutError'
        ? `${parsed.host} did not respond in time.`
        : `${parsed.host} could not be reached.`;
    return { ok: false, robotsDisallowed: false, status: null, reason };
  }
}

/** Resets per-process caches. Tests only. */
export function resetFetchCaches(): void {
  robotsCache.clear();
  lastRequestByHost.clear();
}
