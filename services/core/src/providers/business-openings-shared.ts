import { extractLocationClues } from './reddit.js';

export type OpeningCategory =
  | 'grand_opening'
  | 'restaurant_opening'
  | 'boutique_opening'
  | 'hotel_opening'
  | 'coffee_opening'
  | 'entertainment_opening';

export type NormalizedBusinessOpening = {
  externalId: string;
  title: string;
  body: string;
  sourceUrl: string;
  website: string | null;
  publishedAt: Date;
  openingDate: Date | null;
  businessName: string;
  category: OpeningCategory;
  address: string | null;
  neighborhood: string | null;
  openingFlag: boolean;
  locationClues: string[];
  locationHint: string | null;
};

export const DEFAULT_USER_AGENT = 'Benson/0.1 (Kellie Assistant; +https://github.com/anthonyonazure/social-agent)';

const OPENING_RE =
  /\b(open(?:ing|s|ed)?|now open|grand opening|soft[- ]opening|ribbon[- ]cutting|debut|new location|new spot|opens its|set to open|just opened|celebrating its (?:grand )?opening)\b/i;
const CLOSING_RE = /\b(clos(?:ing|es|ed)|shut(?:ting)? down|permanently closed|ceased operations)\b/i;

const SECTION_HEADERS = new Set([
  'opening',
  'openings',
  'closing',
  'closings',
  'news bites',
  'events',
  'festivals',
  'food news',
  'sipps',
  'kc sipps',
  'this week',
  'weekend',
]);

const NEIGHBORHOOD_HINTS = [
  'crossroads',
  'westport',
  'plaza',
  'country club plaza',
  'brookside',
  'waldo',
  'river market',
  'downtown',
  'midtown',
  'west bottoms',
  'northland',
  'northeast',
  'overland park',
  'olathe',
  'lee\'s summit',
  'lees summit',
  'liberty',
  'shawnee',
  'prairie village',
  'mission hills',
  'independence',
  'kansas city',
  'kck',
  'kcmo',
];

export function stripHtml(html: string): string {
  return html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, '–')
    .replace(/\s+/g, ' ')
    .trim();
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, '–');
}

export function firstTag(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(re);
  return m?.[1]?.trim() ?? null;
}

export function parseRss2Items(xml: string): Array<{
  title: string;
  link: string;
  pubDate: string;
  content: string;
  rawContent: string;
}> {
  const items: Array<{
    title: string;
    link: string;
    pubDate: string;
    content: string;
    rawContent: string;
  }> = [];

  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[1]!;
    const title = firstTag(block, 'title');
    const link = firstTag(block, 'link');
    const pubDate = firstTag(block, 'pubDate');
    if (!title || !link || !pubDate) continue;
    const rawContent =
      firstTag(block, 'content:encoded') ??
      firstTag(block, 'content') ??
      firstTag(block, 'description') ??
      '';
    items.push({ title, link, pubDate, content: stripHtml(rawContent), rawContent });
  }

  return items;
}

export function externalIdFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/^\/+|\/+$/g, '');
    return path || url;
  } catch {
    return url;
  }
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function parseRssDate(raw: string): Date {
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d;
  throw new Error(`invalid rss pubDate: ${raw}`);
}

export function detectOpeningSignal(title: string, body: string): boolean {
  const text = `${title} ${body}`;
  if (CLOSING_RE.test(text) && !OPENING_RE.test(text)) return false;
  if (OPENING_RE.test(text)) return true;
  if (/\bnew location\b/i.test(text)) return true;
  if (/\bthree openings\b/i.test(text)) return true;
  if (/\btwo openings\b/i.test(text)) return true;
  if (/\bnow open in\b/i.test(text)) return true;
  return false;
}

export function classifyOpeningCategory(
  title: string,
  body: string,
  businessName: string,
): OpeningCategory {
  const text = `${title} ${body} ${businessName}`.toLowerCase();

  if (/\bgrand opening\b/i.test(text)) return 'grand_opening';
  if (/\b(coffee|caf[eé]|espresso|roaster|coffee shop|tea house|tea shop|teahouse|bean counter)\b/i.test(text)) {
    return 'coffee_opening';
  }
  if (/\b(hotel|boutique hotel|resort|inn|lodging|marriott|hilton|hyatt|ac hotel|canopy by hilton)\b/i.test(text)) {
    return 'hotel_opening';
  }
  if (/\b(boutique|retail shop|shop opens|store opens|flagship|apparel|vintage shop|counterculture|clothing store)\b/i.test(text)) {
    return 'boutique_opening';
  }
  if (/\b(theater|theatre|venue|arena|arcade|museum|gallery|nightclub|comedy club|music hall|stadium|living arcade|social club|entertainment district)\b/i.test(text)) {
    return 'entertainment_opening';
  }
  if (/\b(restaurant|eatery|bar opens|kitchen|dining|bistro|brewery|bakery|pizzeria|taco|bbq|food hall|ghost kitchen|pop-up|popup|donut|doughnut|sushi|brunch)\b/i.test(text)) {
    return 'restaurant_opening';
  }
  return 'grand_opening';
}

export function extractAddress(text: string): string | null {
  const located = text.match(
    /\bis located at ([^.]+(?:Avenue|Ave\.?|Street|St\.?|Road|Rd\.?|Boulevard|Blvd\.?|Terrace|Drive|Dr\.?|Lane|Ln\.?|Way|Place|Pl\.?|Parkway|Pkwy)[^.]*)/i,
  );
  if (located?.[1]) return located[1].trim();

  const atPattern = text.match(
    /\bat (\d+[^.]+\b(?:MO|KS|Missouri|Kansas)\b[^.]*)/i,
  );
  if (atPattern?.[1]) return atPattern[1].trim();

  const downtown = text.match(/\bin (downtown [A-Za-z .'-]+(?:MO|KS)?)/i);
  if (downtown?.[1]) return downtown[1].trim();

  return null;
}

export function extractWebsite(rawHtml: string, businessName: string): string | null {
  const nameSlug = slugify(businessName);
  const linkRe = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of rawHtml.matchAll(linkRe)) {
    const href = match[1]!;
    const label = stripHtml(match[2] ?? '').toLowerCase();
    if (/facebook\.com|instagram\.com|twitter\.com|x\.com|thepitchkc\.com|mailto:/i.test(href)) {
      continue;
    }
    if (label.includes(nameSlug.slice(0, 12)) || label.includes(businessName.toLowerCase().slice(0, 12))) {
      return href;
    }
  }
  return null;
}

export function inferNeighborhood(title: string, body: string, address: string | null): string | null {
  const text = `${title} ${body} ${address ?? ''}`.toLowerCase();
  const clues = extractLocationClues(title, body);
  for (const hint of NEIGHBORHOOD_HINTS) {
    if (text.includes(hint) || clues.some((c) => c.includes(hint))) return hint;
  }
  return clues[0] ?? null;
}

export function parseOpeningDate(text: string, refDate: Date): Date | null {
  const monthDay = text.match(
    /\b(?:on\s+)?(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*[–—-]\s*(\d{1,2})(?:st|nd|rd|th)?)?\b/i,
  );
  if (monthDay) {
    const year = refDate.getFullYear();
    const start = new Date(`${monthDay[1]} ${monthDay[2]}, ${year}`);
    if (!Number.isNaN(start.getTime())) return start;
  }

  const opensMatch = text.match(/\bopens?\s+(?:on\s+)?([A-Za-z]+\.?\s+\d{1,2}(?:,\s*\d{4})?)\b/i);
  if (opensMatch?.[1]) {
    const withYear = opensMatch[1].includes(',') ? opensMatch[1] : `${opensMatch[1]}, ${refDate.getFullYear()}`;
    const d = new Date(withYear);
    if (!Number.isNaN(d.getTime())) return d;
  }

  if (/\bnow open\b/i.test(text)) return refDate;
  return null;
}

function isSectionHeader(name: string): boolean {
  const normalized = decodeHtmlEntities(stripHtml(name)).toLowerCase().trim();
  return SECTION_HEADERS.has(normalized);
}

export function extractNamedBlocks(rawHtml: string): Array<{ name: string; html: string; text: string }> {
  const blocks: Array<{ name: string; html: string; text: string }> = [];
  const re = /<b>([^<:]+):<\/b>([\s\S]*?)(?=<b>[^<:]+:<\/b>|$)/gi;
  for (const match of rawHtml.matchAll(re)) {
    const name = decodeHtmlEntities(stripHtml(match[1] ?? ''));
    if (!name || isSectionHeader(name)) continue;
    const html = match[2] ?? '';
    const text = stripHtml(html);
    blocks.push({ name, html, text });
  }
  return blocks;
}

export function extractSippsOpenings(
  item: { title: string; link: string; pubDate: string; content: string; rawContent: string },
): NormalizedBusinessOpening[] {
  const publishedAt = parseRssDate(item.pubDate);
  const articleTitle = stripHtml(item.title);
  const articleBody = item.content;
  const results: NormalizedBusinessOpening[] = [];

  const openingSection = item.rawContent.match(
    /<b>\s*Opening[s]?\s*:?\s*<\/b>([\s\S]*?)(?=<b>\s*(?:Closing|Events|News Bites|Festivals|This Week))/i,
  );
  const searchHtml = openingSection?.[1] ?? item.rawContent;
  const blocks = extractNamedBlocks(searchHtml);

  if (blocks.length === 0 && detectOpeningSignal(articleTitle, articleBody)) {
    blocks.push({ name: articleTitle, html: item.rawContent, text: articleBody });
  }

  for (const block of blocks) {
    const blockText = `${block.name} ${block.text}`;
    if (CLOSING_RE.test(blockText) && !OPENING_RE.test(blockText)) continue;
    if (!OPENING_RE.test(blockText) && !openingSection) continue;

    const address = extractAddress(blockText);
    const openingDate = parseOpeningDate(blockText, publishedAt) ?? parseOpeningDate(articleBody, publishedAt);
    const category = classifyOpeningCategory(articleTitle, blockText, block.name);
    const website = extractWebsite(block.html, block.name);
    const locationClues = extractLocationClues(block.name, blockText);
    const neighborhood = inferNeighborhood(block.name, blockText, address);
    const slug = slugify(block.name);

    results.push({
      externalId: `${externalIdFromUrl(item.link)}#opening-${slug}`,
      title: `${block.name} opening`,
      body: blockText.slice(0, 4000),
      sourceUrl: `${item.link}#opening-${slug}`,
      website,
      publishedAt,
      openingDate,
      businessName: block.name,
      category,
      address,
      neighborhood,
      openingFlag: true,
      locationClues,
      locationHint: neighborhood ?? address ?? locationClues[0] ?? 'kansas city',
    });
  }

  return results;
}

export function normalizeArticleOpening(
  item: { title: string; link: string; pubDate: string; content: string; rawContent: string },
  opts?: { defaultCategory?: OpeningCategory; urlSuffix?: string },
): NormalizedBusinessOpening | null {
  const title = stripHtml(item.title);
  const body = item.content;
  if (!detectOpeningSignal(title, body)) return null;
  if (CLOSING_RE.test(title) && !OPENING_RE.test(`${title} ${body}`)) return null;
  if (/\b(this weekend in|how .+ stands out|tradition returns|best views of)\b/i.test(title)) return null;
  if (/^four inane questions\b/i.test(title)) return null;
  if (/^snl'?s\b/i.test(title) && !/\b(open(?:ing|s|ed)?|now open|grand opening)\b/i.test(`${title} ${body}`)) return null;

  const publishedAt = parseRssDate(item.pubDate);
  const businessName = inferBusinessNameFromTitle(title) ?? title.slice(0, 120);
  const address = extractAddress(`${title} ${body}`);
  const openingDate = parseOpeningDate(`${title} ${body}`, publishedAt) ?? publishedAt;
  const category = opts?.defaultCategory ?? classifyOpeningCategory(title, body, businessName);
  const website = extractWebsite(item.rawContent, businessName);
  const locationClues = extractLocationClues(title, body);
  const neighborhood = inferNeighborhood(title, body, address);

  const urlSuffix = opts?.urlSuffix ?? '';
  const sourceUrl = `${item.link}${urlSuffix}`;
  const externalId = urlSuffix
    ? `${externalIdFromUrl(item.link)}${urlSuffix.replace('#', '-')}`
    : externalIdFromUrl(item.link);

  return {
    externalId,
    title,
    body: body.slice(0, 4000),
    sourceUrl,
    website,
    publishedAt,
    openingDate,
    businessName,
    category,
    address,
    neighborhood,
    openingFlag: true,
    locationClues,
    locationHint: neighborhood ?? address ?? locationClues[0] ?? 'kansas city',
  };
}

function inferBusinessNameFromTitle(title: string): string | null {
  const sipps = title.match(/^KC Sipps:\s*(.+)$/i);
  if (sipps) return null;

  const opens = title.match(/^(.+?)\s+(?:opens|to open|set to open|debuts|launches)\b/i);
  if (opens?.[1] && opens[1].length <= 80) return opens[1].trim();

  const atMatch = title.match(/^(.+?)\s+(?:at|in)\s+[A-Z]/);
  if (atMatch?.[1] && atMatch[1].length <= 80) return atMatch[1].trim();

  const colon = title.match(/^([^:]+):\s+/);
  if (colon?.[1] && colon[1].length <= 60 && !/dish|drink|kc sipps|week|roundup/i.test(colon[1])) {
    return colon[1].trim();
  }

  return null;
}

export async function fetchRssFeed(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      Accept: 'application/rss+xml, application/xml, text/xml',
    },
  });
  if (!res.ok) throw new Error(`rss fetch failed (${res.status}): ${url}`);
  return res.text();
}

export function dedupeOpenings(items: NormalizedBusinessOpening[]): NormalizedBusinessOpening[] {
  const byKey = new Map<string, NormalizedBusinessOpening>();
  for (const item of items) {
    byKey.set(item.externalId, item);
  }
  return [...byKey.values()];
}

export function withinRecency(item: NormalizedBusinessOpening, maxAgeDays: number): boolean {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);
  return item.publishedAt >= cutoff;
}
