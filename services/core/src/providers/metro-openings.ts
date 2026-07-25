import {
  dedupeOpenings,
  decodeHtmlEntities,
  detectOpeningSignal,
  fetchRssFeed,
  normalizeArticleOpening,
  parseRss2Items,
  stripHtml,
  type NormalizedBusinessOpening,
} from './business-openings-shared.js';

export type MetroOpeningsSourceConfig = {
  feedUrl: string;
  limit?: number;
  maxAgeDays?: number;
  /** When true, require a clear opening signal (good for broad TV news feeds). */
  strictOpeningFilter?: boolean;
  /** Skip articles whose titles match this pattern. */
  excludeTitlePattern?: string;
};

const BROAD_NEWS_EXCLUDE_RE =
  /\b(crime|shooting|murder|arrest|weather|forecast|traffic|crash|investigation|lawsuit|election|candidate|primary|ballot|covid|school board|budget|taxes|property tax|city council vote)\b/i;

export function parseMetroOpeningsSourceConfig(raw: unknown): MetroOpeningsSourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  if (typeof c.feedUrl !== 'string' || !c.feedUrl.trim()) {
    throw new Error('metro_openings source requires config.feedUrl');
  }
  return {
    feedUrl: c.feedUrl.trim(),
    limit: typeof c.limit === 'number' ? c.limit : 60,
    maxAgeDays: typeof c.maxAgeDays === 'number' ? c.maxAgeDays : 120,
    strictOpeningFilter: c.strictOpeningFilter === true,
    excludeTitlePattern:
      typeof c.excludeTitlePattern === 'string' ? c.excludeTitlePattern : undefined,
  };
}

export async function loadMetroOpenings(
  config: MetroOpeningsSourceConfig,
): Promise<NormalizedBusinessOpening[]> {
  const parsed = parseMetroOpeningsSourceConfig(config);
  const xml = await fetchRssFeed(parsed.feedUrl);
  const items = parseRss2Items(xml).slice(0, parsed.limit ?? 60);
  const excludeRe = parsed.excludeTitlePattern
    ? new RegExp(parsed.excludeTitlePattern, 'i')
    : null;
  const results: NormalizedBusinessOpening[] = [];

  for (const item of items) {
    const title = decodeHtmlEntities(stripHtml(item.title));
    const content = item.content;
    const text = `${title} ${content}`;

    if (excludeRe?.test(title)) continue;
    if (parsed.strictOpeningFilter && BROAD_NEWS_EXCLUDE_RE.test(title)) continue;
    if (!detectOpeningSignal(title, content)) continue;

    if (parsed.strictOpeningFilter) {
      const titleHasOpening =
        /\b(open(?:ing|s|ed)?|now open|grand opening|new (?:restaurant|store|shop|location|business)|debuts?|set to open|just opened|ribbon cutting)\b/i.test(
          title,
        );
      if (!titleHasOpening && !/\b(opens? (?:in|at|near)|opened (?:in|at|near))\b/i.test(text)) {
        continue;
      }
    }

    const opening = normalizeArticleOpening({ ...item, title });
    if (opening) results.push(opening);
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (parsed.maxAgeDays ?? 120));

  return dedupeOpenings(results).filter((item) => item.publishedAt >= cutoff);
}
