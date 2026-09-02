/**
 * Display-title contract for opportunities and events.
 * Cosmetic only: never used as a canonical identity or dedupe key.
 */
import { sanitizeScrapedText, sanitizeScrapedTitle } from '../text-sanitize/sanitize-scraped-text.js';

export const DISPLAY_TITLE_MAX_CHARS = 72;

export type DisplayTitleVerification = 'verified' | 'inferred' | 'needs_verification';

export type DisplayTitleContract = {
  displayTitle: string;
  displaySubtitle: string | null;
  sourceName: string | null;
  venueName: string | null;
  rawTitle: string;
  sourceUrl: string | null;
  primarySourceName: string | null;
  discoveredThrough: string | null;
  corroboratedBy: string[];
  titleChanged: boolean;
  changeReason: string | null;
  evidence: string[];
  verification: DisplayTitleVerification;
};

export type ResolveDisplayTitleInput = {
  rawTitle: string;
  sourceName?: string | null;
  venueName?: string | null;
  sourceUrl?: string | null;
  summary?: string | null;
  evidence?: string | null;
  officialName?: string | null;
  officialSubtitle?: string | null;
  heading?: string | null;
  ogTitle?: string | null;
  schemaName?: string | null;
  documentTitle?: string | null;
  businessName?: string | null;
  discoveredThrough?: string | null;
  corroboratedBy?: string[] | null;
  primarySourceName?: string | null;
  existingDisplayTitle?: string | null;
  existingSubtitle?: string | null;
  existingVerification?: DisplayTitleVerification | null;
};

export type ResearchDisplayInput = {
  current: DisplayTitleContract;
  officialName?: string | null;
  officialSubtitle?: string | null;
  heading?: string | null;
  ogTitle?: string | null;
  schemaName?: string | null;
  primarySourceName?: string | null;
  officialUrl?: string | null;
  venueName?: string | null;
  discoveredThrough?: string | null;
  corroboratedBy?: string[] | null;
};

const DISCOVERY_METHODS = new Set([
  'newsletter intelligence',
  'newsletter',
  'scraper',
  'web scrape',
  'ask benson',
  'watchlist',
]);

const SEO_RESIDUE =
  /\b(official website|read more|continue reading|click here|learn more|home page|homepage)\b/gi;

const SCRAPER_LEAD =
  /^(here\s*!+\s*|look\s*!+\s*|check\s+(this\s+)?out[:!\s]+)/i;

const LEADING_DATE_PREFIX =
  /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?[,.]?\s+/i;

const CTA_HEADLINE =
  /^(sign up( now| today)?|apply( now| today)?|buy tickets?|get tickets?|register( now)?|shop now|book now|don'?t miss( it)?|act now)[!?.]*$/i;

const MARKETING_HEADLINE =
  /\b(huzzah|cheers!|you won'?t believe|must[- ]see|unforgettable night|seasons of)\b/i;

const GENERIC_HEADING =
  /^(special events?|events?|shows?|calendar|what'?s on|happenings|vendors?|news|latest|updates?)$/i;

const SMALL_WORDS = new Set(['a', 'an', 'and', 'at', 'for', 'from', 'in', 'of', 'on', 'the', 'to', 'vs', 'with']);

const ACRONYMS = new Set([
  'kc',
  'okc',
  'vip',
  'dj',
  'r&b',
  'mu',
  'op',
  'ncaa',
  'nfl',
  'mlb',
  'mls',
  'nba',
  'wnba',
  'usa',
  'us',
  'uk',
  'am',
  'pm',
  'kck',
  'oppd',
]);

const STYLIZED: Array<{ test: RegExp; value: string }> = [{ test: /\bk-?pop\b/i, value: 'K-Pop' }];

const PUBLISHER_SPLIT = /\s*(?:\||•|·|—|–)\s+/;

/** Strip scraper CTA prefixes and leading date crumbs from an otherwise usable name. */
export function stripScraperLead(title: string): string {
  let text = title.trim();
  const beforeLead = text;
  text = text.replace(SCRAPER_LEAD, '');
  text = text.replace(LEADING_DATE_PREFIX, '');
  return text.replace(/\s+/g, ' ').trim() || beforeLead.trim();
}

export function isDirtyDisplayTitle(title: string): boolean {
  const t = title.trim();
  if (!t) return true;
  if (SCRAPER_LEAD.test(t)) return true;
  if (/\bHERE\s*!/.test(t)) return true;
  if (/^\s*HERE\b/i.test(t)) return true;
  return false;
}

export function stripDisplayMarkup(raw: string): string {
  let text = sanitizeScrapedText(raw ?? '');
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  text = text.replace(/\[([^\]]+)\]\(/g, '$1');
  text = text.replace(/\[([^\]]+)\]/g, '$1');
  text = text.replace(/[*_~`]+/g, '');
  text = text.replace(/<\/?[a-z][^>]*>/gi, ' ');
  return sanitizeScrapedTitle(text).replace(/\s+/g, ' ').trim();
}

export function looksLikeMarketingHeadline(title: string): boolean {
  const t = title.trim();
  if (!t) return false;
  if (MARKETING_HEADLINE.test(t)) return true;
  if (/[!?]{1,}/.test(t) && /\b(season|cheer|huzzah|party)\b/i.test(t)) return true;
  return false;
}

export function looksLikeGenericHeading(title: string): boolean {
  return GENERIC_HEADING.test(title.trim());
}

export function looksLikeEventName(title: string): boolean {
  const t = title.trim();
  if (t.length < 4 || t.length > 80) return false;
  if (looksLikeMarketingHeadline(t) || looksLikeGenericHeading(t) || CTA_HEADLINE.test(t)) return false;
  if (/\b(tickets?,?\s*info|official website|read more)\b/i.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length < 1 || words.length > 10) return false;
  if (/[.!?]$/.test(t) && words.length > 6) return false;
  return true;
}

export function titleStrength(title: string): number {
  const t = title.trim();
  if (!t) return 0;
  let score = 20;
  if (looksLikeEventName(t)) score += 40;
  if (/\b(festival|fair|night|days|fridays|market|concert|parade)\b/i.test(t)) score += 15;
  if (looksLikeMarketingHeadline(t)) score -= 35;
  if (looksLikeGenericHeading(t)) score -= 40;
  if (CTA_HEADLINE.test(t)) score -= 50;
  if (/[|•]/.test(t) || /\]\(/.test(t) || /<[^>]+>/.test(t)) score -= 20;
  if (t === t.toUpperCase() && t.length > 8) score -= 10;
  if (t.split(/\s+/).length > 12) score -= 15;
  return score;
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9&]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isDiscoveryMethodName(name: string | null | undefined): boolean {
  if (!name) return false;
  return DISCOVERY_METHODS.has(normalizeKey(name));
}

function fuzzyEquals(a: string, b: string): boolean {
  const left = normalizeKey(a);
  const right = normalizeKey(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function stripSeoResidue(title: string): string {
  return title.replace(SEO_RESIDUE, ' ').replace(/\s+/g, ' ').trim();
}

function splitPublisherSuffix(title: string, sourceName: string | null): { title: string; strippedSource: string | null } {
  const parts = title.split(PUBLISHER_SPLIT).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return { title, strippedSource: null };
  const last = parts[parts.length - 1]!;
  const head = parts.slice(0, -1).join(' | ');
  const lastIsSource = Boolean(sourceName && fuzzyEquals(last, sourceName));
  const lastIsDiscovery = isDiscoveryMethodName(last);
  const lastIsKnownPublisher =
    /^(kansas city royals|visit kc|city of [a-z]|juneteenthkc|newsletter intelligence)$/i.test(last);
  const lastLooksLikePublisher =
    lastIsKnownPublisher ||
    (last.split(/\s+/).length <= 5 && /^(the )?[A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+){0,3}$/.test(last) && head.length >= 4);
  if (looksLikeGenericHeading(head) && looksLikeEventName(last)) {
    return { title: last, strippedSource: null };
  }
  if (lastIsSource || lastIsDiscovery || lastIsKnownPublisher) {
    return { title: head, strippedSource: last };
  }
  if (lastLooksLikePublisher && looksLikeEventName(head) && !looksLikeEventName(last)) {
    return { title: head, strippedSource: last };
  }
  return { title, strippedSource: null };
}

function extractSentenceTail(title: string): { title: string; tail: string | null } {
  const match = title.match(
    /^(.{3,80}?)\s+(takes over|returns to|comes to|heads to|comes back to|is taking over)\s+(.+)$/i,
  );
  if (!match) return { title, tail: null };
  return { title: match[1]!.trim(), tail: match[3]!.trim() };
}

function extractAnniversary(text: string): string | null {
  const nth = text.match(/\b(\d{1,3})(?:st|nd|rd|th)\s+(annual|year|season|anniversary)\b/i);
  if (nth) {
    const n = nth[1]!;
    const unit = /season/i.test(nth[2]!) ? 'season' : /year|annual|anniversary/i.test(nth[2]!) ? 'annual' : nth[2]!.toLowerCase();
    if (unit === 'season') return `${n}${ordinalSuffix(n)} season`;
    return `${n}${ordinalSuffix(n)} annual`;
  }
  const seasons = text.match(/\b(\d{1,3})\s+seasons?\b/i);
  if (seasons) {
    const n = seasons[1]!;
    return `${n}${ordinalSuffix(n)} season`;
  }
  return null;
}

function ordinalSuffix(n: string): string {
  const v = Number(n) % 100;
  if (v >= 11 && v <= 13) return 'th';
  switch (Number(n) % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

function applyStylized(word: string): string {
  for (const row of STYLIZED) {
    if (row.test.test(word)) return word.replace(row.test, row.value);
  }
  return word;
}

function isAcronym(word: string, mostlyCaps: boolean): boolean {
  const bare = word.replace(/[^A-Za-z0-9&]/g, '');
  if (!bare) return false;
  if (ACRONYMS.has(bare.toLowerCase())) return true;
  if (mostlyCaps) return false;
  return bare.length <= 4 && bare === bare.toUpperCase() && /[A-Z]/.test(bare);
}

function hasInternalCaps(word: string): boolean {
  return /[a-z][A-Z]/.test(word) || /[A-Z]{2,}[a-z]/.test(word);
}

export function normalizeDisplayCaps(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return trimmed;
  const letters = trimmed.replace(/[^A-Za-z]/g, '');
  const upper = letters.replace(/[^A-Z]/g, '').length;
  const mostlyCaps = letters.length >= 4 && upper / letters.length >= 0.8;
  const rawWords = trimmed.split(/\s+/);
  const words = rawWords.map((word, index) => {
    const stylized = applyStylized(word);
    if (stylized !== word) return stylized;
    if (hasInternalCaps(word) && !mostlyCaps) return word;
    if (/^\d+(st|nd|rd|th)$/i.test(word)) return word.toLowerCase();
    if (isAcronym(word, mostlyCaps)) return word.length <= 4 ? word.toUpperCase() : word;
    const bare = word.toLowerCase().replace(/[^a-z0-9]/g, '');
    const previous = index > 0 ? rawWords[index - 1] : '';
    const afterBreak = /[:—–-]$/.test(previous ?? '');
    if (index > 0 && SMALL_WORDS.has(bare) && !afterBreak) {
      const lead = word.match(/^\W*/)?.[0] ?? '';
      const trail = word.match(/\W*$/)?.[0] ?? '';
      return `${lead}${bare}${trail}`;
    }
    if (!mostlyCaps && /[a-z]/.test(word) && /[A-Z]/.test(word)) return word;
    const chars = word.split('');
    let started = false;
    return chars
      .map((ch) => {
        if (/[A-Za-z]/.test(ch)) {
          if (!started) {
            started = true;
            return ch.toUpperCase();
          }
          return ch.toLowerCase();
        }
        return ch;
      })
      .join('');
  });
  return words.join(' ').replace(/\bKpop\b/g, 'K-Pop').replace(/\bK-pop\b/g, 'K-Pop');
}

function sharesIdentity(a: string, b: string): boolean {
  const left = new Set(normalizeKey(a).split(' ').filter((w) => w.length >= 3 && !SMALL_WORDS.has(w)));
  const right = new Set(normalizeKey(b).split(' ').filter((w) => w.length >= 3 && !SMALL_WORDS.has(w)));
  if (left.size === 0 || right.size === 0) return false;
  let hit = 0;
  for (const token of left) if (right.has(token)) hit += 1;
  return hit >= 1 && hit / Math.min(left.size, right.size) >= 0.34;
}

function isNewsSentence(title: string): boolean {
  const words = title.trim().split(/\s+/);
  return words.length > 10 || (/[.!?]$/.test(title.trim()) && words.length > 6);
}

function canUseUnrelatedOfficial(cleaned: string): boolean {
  return (
    looksLikeMarketingHeadline(cleaned) ||
    looksLikeGenericHeading(cleaned) ||
    CTA_HEADLINE.test(cleaned)
  );
}

function looksLikeScheduleFragment(title: string): boolean {
  return /^(am|pm)\s+(mon|tue|wed|thu|fri|sat|sun)\b/i.test(title.trim());
}

function pickOfficialName(input: ResolveDisplayTitleInput, cleaned: string): { name: string | null; reason: string | null } {
  if (isNewsSentence(cleaned) || looksLikeScheduleFragment(cleaned)) {
    return { name: null, reason: null };
  }
  const explicitOfficial = [input.officialName, input.schemaName, input.heading]
    .map((v) => (v ? stripDisplayMarkup(v) : ''))
    .filter(Boolean);
  const contextual = [input.ogTitle, input.documentTitle, input.businessName]
    .map((v) => (v ? stripDisplayMarkup(v) : ''))
    .filter(Boolean);

  let best: string | null = null;
  let bestScore = titleStrength(normalizeDisplayCaps(cleaned));
  let reason: string | null = null;

  const consider = (candidate: string, allowUnrelated: boolean) => {
    if (!candidate || candidate === cleaned) return;
    if (/ticketmaster|\bconcert tour dates\b|\btickets?,?\s+\d{4}/i.test(candidate)) return;
    if (/[|•]/.test(candidate) && !/[|•]/.test(cleaned)) return;
    const related = sharesIdentity(cleaned, candidate);
    if (!related && !allowUnrelated) return;
    if (!related && isNewsSentence(cleaned)) return;
    if (
      candidate.split(/\s+/).length + 2 < cleaned.split(/\s+/).length &&
      /\b(vs\.?|versus|night|tour|festival|days)\b/i.test(cleaned)
    ) {
      return;
    }
    const normalized = normalizeDisplayCaps(candidate);
    const extraTokens = normalizeKey(normalized)
      .split(' ')
      .filter((w) => w.length >= 3 && !SMALL_WORDS.has(w) && !normalizeKey(cleaned).split(' ').includes(w));
    const score =
      titleStrength(normalized) +
      (looksLikeEventName(normalized) ? 5 : 0) +
      (extraTokens.length >= 2 ? 16 : 0) +
      (/\bvendors?\b/i.test(cleaned) && !/\bvendors?\b/i.test(normalized) ? 12 : 0);
    if (score > bestScore + 8) {
      best = candidate;
      bestScore = score;
      reason = 'official_or_structured_name';
    }
  };

  for (const candidate of explicitOfficial) {
    consider(candidate, canUseUnrelatedOfficial(cleaned));
  }
  for (const candidate of contextual) {
    consider(candidate, false);
  }

  const blob = [input.summary, input.evidence].filter(Boolean).join('\n');
  if (blob && canUseUnrelatedOfficial(cleaned)) {
    const fest = blob.match(/\b((?:The\s+)?[A-Z][A-Za-z'’&-]+(?:\s+[A-Z][A-Za-z'’&-]+){0,5}\s+Festival)\b/);
    if (fest?.[1] && looksLikeEventName(fest[1]) && titleStrength(fest[1]) > titleStrength(cleaned)) {
      best = fest[1].trim();
      reason = 'named_program_in_evidence';
    }
  }

  return { name: best, reason };
}

function clipTitle(title: string): string {
  if (title.length <= DISPLAY_TITLE_MAX_CHARS) return title;
  const slice = title.slice(0, DISPLAY_TITLE_MAX_CHARS - 1);
  const cut = slice.lastIndexOf(' ');
  return `${(cut > 24 ? slice.slice(0, cut) : slice).trimEnd()}…`;
}

function lightCaption(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function usableProvidedSubtitle(value: string | null | undefined, displayTitle: string): string | null {
  const sub = value?.trim() ?? '';
  if (!sub || fuzzyEquals(sub, displayTitle) || sub.length > 80) return null;
  if (/[.!?]/.test(sub) && sub.split(/\s+/).length > 14) return null;
  return clipTitle(lightCaption(sub));
}

function buildSubtitle(input: {
  officialSubtitle?: string | null;
  anniversary?: string | null;
  tail?: string | null;
  cleanedRaw?: string;
  displayTitle: string;
  venueName: string | null;
  sourceName: string | null;
  summary?: string | null;
  evidence?: string | null;
}): string | null {
  const provided =
    usableProvidedSubtitle(input.officialSubtitle, input.displayTitle) ??
    usableProvidedSubtitle(input.summary, input.displayTitle);
  if (provided) return provided;

  const bits: string[] = [];
  if (input.anniversary) bits.push(input.anniversary);

  const blob = [input.tail, input.summary, input.evidence, input.cleanedRaw, input.venueName].filter(Boolean).join(' ');
  if (/vendor/i.test(blob) && /first friday/i.test(input.displayTitle + blob)) {
    bits.push('vendor market');
  } else if (/vendor/i.test(blob) && !/vendor/i.test(input.displayTitle)) {
    bits.push('vendor recruitment');
  }

  const district = blob.match(/\b(18th\s*&\s*vine|historic independence square|crossroads|west bottoms|river market|country club plaza)\b/i);
  if (district && !fuzzyEquals(district[1]!, input.displayTitle)) {
    const place = district[1]!.replace(/\s+/g, ' ');
    if (bits.some((b) => /festival|market|annual/i.test(b))) {
      bits.push(`at ${place}`);
    } else if (input.anniversary) {
      bits.push(`festival at ${place}`);
    } else {
      bits.push(`at ${place}`);
    }
  }

  if (/theme night|demon hunters|tribute night/i.test(blob) && !/night/i.test(input.displayTitle)) {
    bits.push('theme night');
  }

  let subtitle = bits
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\bannual festival at\b/i, 'annual festival at')
    .trim();

  if (input.anniversary && /festival/i.test(input.displayTitle) && input.anniversary.includes('season')) {
    subtitle = input.anniversary;
  } else if (input.anniversary && district && /takes over|festival|days/i.test(blob)) {
    subtitle = `${input.anniversary} festival at ${district[1]!.replace(/\s+/g, ' ')}`.replace(/\bannual festival\b/i, 'annual festival');
    if (/^\d/.test(input.anniversary) && !/annual/.test(input.anniversary)) {
      subtitle = `${input.anniversary} festival at ${district[1]!.replace(/\s+/g, ' ')}`;
    }
    if (/annual$/.test(input.anniversary)) {
      subtitle = `${input.anniversary} festival at ${district[1]!.replace(/\s+/g, ' ')}`;
    }
  }

  if (!subtitle) return null;
  if (fuzzyEquals(subtitle, input.displayTitle)) return null;
  if (input.venueName && fuzzyEquals(subtitle, input.venueName)) return null;
  if (input.sourceName && fuzzyEquals(subtitle, input.sourceName)) return null;
  return clipTitle(lightCaption(subtitle));
}

function publicSourceName(input: ResolveDisplayTitleInput, stripped: string | null): string | null {
  const primary = input.primarySourceName?.trim() || null;
  if (primary && !isDiscoveryMethodName(primary)) return primary;
  const named = input.sourceName?.trim() || stripped;
  if (named && !isDiscoveryMethodName(named)) return named;
  return named ?? null;
}

export function resolveDisplayTitle(input: ResolveDisplayTitleInput): DisplayTitleContract {
  const rawTitle = input.rawTitle ?? '';
  const evidence: string[] = [];
  const reasons: string[] = [];

  let working = stripDisplayMarkup(rawTitle);
  if (working !== rawTitle.trim()) {
    reasons.push('stripped_markup');
    evidence.push('Removed Markdown/HTML residue from the stored headline.');
  }

  const afterLead = stripScraperLead(working);
  if (afterLead !== working) {
    working = afterLead;
    reasons.push('stripped_scraper_lead');
    evidence.push('Removed a scraper call-to-action or leading date crumb from the headline.');
  }

  working = stripSeoResidue(working);
  const split = splitPublisherSuffix(working, input.sourceName ?? null);
  if (split.title !== working) {
    working = split.title;
    if (split.strippedSource) {
      reasons.push('separated_source_suffix');
      evidence.push(`Moved publisher “${split.strippedSource}” out of the title.`);
    } else {
      reasons.push('promoted_name_from_generic_heading');
      evidence.push('Kept the specific name after a generic heading.');
    }
  }

  const sentence = extractSentenceTail(working);
  if (sentence.tail) {
    working = sentence.title;
    reasons.push('extracted_sentence_tail');
    evidence.push('Moved the descriptive sentence tail into the subtitle.');
  }

  if (CTA_HEADLINE.test(working)) {
    const fallback = [input.officialName, input.schemaName, input.heading, input.existingDisplayTitle]
      .map((v) => (v ? stripDisplayMarkup(v) : ''))
      .find((v) => v && looksLikeEventName(v));
    if (fallback) {
      working = fallback;
      reasons.push('replaced_cta_headline');
      evidence.push('Replaced a call-to-action headline with a verified event name.');
    } else {
      reasons.push('cta_headline_unresolved');
    }
  }

  const official = pickOfficialName(input, working);
  if (official.name && official.name !== working && !looksLikeScheduleFragment(official.name) && !isNewsSentence(official.name)) {
    if (
      input.existingVerification === 'verified' &&
      input.existingDisplayTitle &&
      sharesIdentity(working, input.existingDisplayTitle) &&
      !looksLikeScheduleFragment(input.existingDisplayTitle) &&
      titleStrength(input.existingDisplayTitle) >= titleStrength(official.name)
    ) {
      working = input.existingDisplayTitle;
      reasons.push('kept_verified_title');
    } else {
      working = official.name;
      if (official.reason) reasons.push(official.reason);
      evidence.push(`Used structured/official name “${official.name}”.`);
    }
  } else if (
    input.existingDisplayTitle &&
    sharesIdentity(working, input.existingDisplayTitle) &&
    !looksLikeScheduleFragment(input.existingDisplayTitle) &&
    !isNewsSentence(input.existingDisplayTitle) &&
    titleStrength(input.existingDisplayTitle) > titleStrength(working) + 8
  ) {
    working = input.existingDisplayTitle;
    reasons.push('kept_existing_display_title');
  }

  if (looksLikeGenericHeading(working)) {
    const better = [input.officialName, input.schemaName, input.heading]
      .map((v) => (v ? stripDisplayMarkup(v) : ''))
      .find((v) => v && looksLikeEventName(v));
    if (better) {
      working = better;
      reasons.push('replaced_generic_heading');
    }
  }

  const beforeCaps = working;
  const letters = beforeCaps.replace(/[^A-Za-z]/g, '');
  const upper = letters.replace(/[^A-Z]/g, '').length;
  const mostlyCaps = letters.length >= 4 && upper / letters.length >= 0.8;
  if (!isNewsSentence(beforeCaps) || mostlyCaps) {
    working = normalizeDisplayCaps(working);
    if (beforeCaps !== working) {
      reasons.push('normalized_capitalization');
    }
  }

  working = clipTitle(working) || 'Untitled';

  const anniversary = extractAnniversary(
    [rawTitle, sentence.tail, input.officialSubtitle].filter(Boolean).join(' '),
  );
  const venueName = (input.venueName ?? '').trim() || null;
  const sourceName = publicSourceName(input, split.strippedSource);
  const discoveredThrough = input.discoveredThrough?.trim()
    ? input.discoveredThrough.trim()
    : isDiscoveryMethodName(input.sourceName)
      ? input.sourceName!.trim()
      : null;

  const displaySubtitle = buildSubtitle({
    officialSubtitle: input.officialSubtitle ?? input.existingSubtitle,
    anniversary,
    tail: sentence.tail,
    cleanedRaw: stripDisplayMarkup(rawTitle),
    displayTitle: working,
    venueName,
    sourceName,
    summary: input.summary,
    evidence: input.evidence,
  });

  const unresolvedCta = CTA_HEADLINE.test(stripDisplayMarkup(rawTitle)) && !looksLikeEventName(working);
  const verification: DisplayTitleVerification = unresolvedCta
    ? 'needs_verification'
    : official.name || input.schemaName || input.officialName
      ? 'verified'
      : looksLikeEventName(working)
        ? 'inferred'
        : 'needs_verification';

  const contract: DisplayTitleContract = {
    displayTitle: working,
    displaySubtitle,
    sourceName,
    venueName,
    rawTitle,
    sourceUrl: input.sourceUrl ?? null,
    primarySourceName: input.primarySourceName?.trim() || sourceName,
    discoveredThrough,
    corroboratedBy: (input.corroboratedBy ?? []).map((s) => s.trim()).filter(Boolean),
    titleChanged: normalizeKey(working) !== normalizeKey(rawTitle),
    changeReason: reasons.length ? reasons.join(',') : null,
    evidence,
    verification,
  };
  return contract;
}

export function applyResearchDisplayTitle(input: ResearchDisplayInput): DisplayTitleContract {
  const researchName = [input.schemaName, input.officialName, input.heading, input.ogTitle]
    .map((v) => (v ? stripDisplayMarkup(v) : ''))
    .find(Boolean);
  const researchLooksWeak = Boolean(
    researchName && (looksLikeMarketingHeadline(researchName) || looksLikeGenericHeading(researchName) || CTA_HEADLINE.test(researchName)),
  );
  const currentStrong =
    input.current.verification === 'verified' && looksLikeEventName(input.current.displayTitle);

  if (currentStrong && researchLooksWeak) {
    return {
      ...input.current,
      primarySourceName: input.primarySourceName ?? input.current.primarySourceName,
      sourceUrl: input.officialUrl ?? input.current.sourceUrl,
      discoveredThrough: input.discoveredThrough ?? input.current.discoveredThrough,
      corroboratedBy: uniqueStrings([
        ...input.current.corroboratedBy,
        ...(input.corroboratedBy ?? []),
      ]),
      venueName: input.venueName ?? input.current.venueName,
      changeReason: [input.current.changeReason, 'research_weaker_than_verified_title']
        .filter(Boolean)
        .join(','),
    };
  }

  const next = resolveDisplayTitle({
    rawTitle: input.current.rawTitle,
    sourceName: input.current.sourceName,
    venueName: input.venueName ?? input.current.venueName,
    sourceUrl: input.officialUrl ?? input.current.sourceUrl,
    officialName: researchLooksWeak ? null : researchName,
    officialSubtitle: input.officialSubtitle,
    heading: input.heading,
    ogTitle: input.ogTitle,
    schemaName: researchLooksWeak ? null : input.schemaName,
    existingDisplayTitle: input.current.displayTitle,
    existingSubtitle: input.current.displaySubtitle,
    existingVerification: input.current.verification,
    primarySourceName: input.primarySourceName,
    discoveredThrough: input.discoveredThrough ?? input.current.discoveredThrough,
    corroboratedBy: uniqueStrings([...(input.corroboratedBy ?? []), ...input.current.corroboratedBy]),
  });

  return {
    ...next,
    primarySourceName: input.primarySourceName ?? next.primarySourceName,
    sourceUrl: input.officialUrl ?? next.sourceUrl,
    discoveredThrough: input.discoveredThrough ?? next.discoveredThrough,
  };
}

export function displayIdentityKey(input: {
  rawTitle: string;
  eventDate?: string | null;
  venueName?: string | null;
  sourceUrl?: string | null;
  id?: string | null;
}): string {
  const url = (input.sourceUrl ?? '').trim().toLowerCase();
  if (url) return `url:${url}`;
  return [
    'raw',
    normalizeKey(input.rawTitle),
    (input.eventDate ?? '').slice(0, 10),
    normalizeKey(input.venueName ?? ''),
    input.id ?? '',
  ].join('|');
}

export function sameCanonicalDisplay(
  a: DisplayTitleContract,
  b: DisplayTitleContract,
): boolean {
  return (
    a.displayTitle === b.displayTitle &&
    a.displaySubtitle === b.displaySubtitle &&
    a.sourceName === b.sourceName &&
    a.venueName === b.venueName
  );
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

export function readStoredDisplayIdentity(metadata: Record<string, unknown> | null | undefined): Partial<DisplayTitleContract> | null {
  const stored = metadata?.displayIdentity;
  if (!stored || typeof stored !== 'object') return null;
  return stored as Partial<DisplayTitleContract>;
}

export function resolveDisplayTitleFromRecord(input: {
  rawTitle: string;
  sourceName?: string | null;
  venueName?: string | null;
  sourceUrl?: string | null;
  summary?: string | null;
  evidence?: string | null;
  metadata?: Record<string, unknown> | null;
  officialName?: string | null;
  businessName?: string | null;
}): DisplayTitleContract {
  const meta = input.metadata ?? {};
  const stored = readStoredDisplayIdentity(meta);
  const listing = (meta.listingScrape ?? {}) as Record<string, unknown>;
  const rawPayload = (meta.rawPayload ?? {}) as Record<string, unknown>;
  const extracted = (rawPayload.extracted ?? {}) as Record<string, unknown>;
  const newsletter = (meta.newsletterAttribution ?? {}) as Record<string, unknown>;
  const asString = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() ? value.trim() : null;
  const discovered =
    stored?.discoveredThrough ??
    asString(newsletter.sourceName) ??
    (isDiscoveryMethodName(input.sourceName) ? input.sourceName : null);
  return resolveDisplayTitle({
    rawTitle: input.rawTitle,
    sourceName: input.sourceName,
    venueName: input.venueName,
    sourceUrl: input.sourceUrl,
    summary: input.summary,
    evidence: input.evidence,
    officialName:
      input.officialName ??
      asString(extracted.eventName) ??
      asString(extracted.officialName),
    officialSubtitle: null,
    heading: asString(listing.heading) ?? asString(extracted.heading),
    ogTitle: asString(listing.ogTitle) ?? asString(extracted.ogTitle),
    schemaName: asString(listing.schemaName) ?? asString(extracted.schemaName) ?? asString(extracted.name),
    documentTitle: asString(listing.documentTitle),
    businessName: input.businessName ?? asString(listing.businessName),
    discoveredThrough: discovered,
    corroboratedBy: stored?.corroboratedBy ?? null,
    primarySourceName: stored?.primarySourceName ?? asString(extracted.organizer),
    existingDisplayTitle: stored?.displayTitle ?? null,
    existingSubtitle: stored?.displaySubtitle ?? null,
    existingVerification: stored?.verification ?? null,
  });
}

export type PageDisplayHints = {
  heading: string | null;
  ogTitle: string | null;
  documentTitle: string | null;
  schemaName: string | null;
};

export function extractPageDisplayHints(html: string): PageDisplayHints {
  const asText = (value: string | null | undefined): string | null => {
    if (!value) return null;
    const cleaned = stripDisplayMarkup(value.replace(/<[^>]+>/g, ' '));
    return cleaned || null;
  };
  const documentTitle = asText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null);
  const ogTitle = asText(
    html.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/content=["']([^"']+)["']\s+property=["']og:title["']/i)?.[1] ??
      null,
  );
  const headings = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)]
    .map((m) => asText(m[1]))
    .filter((v): v is string => Boolean(v));
  const heading =
    headings.find((h) => looksLikeEventName(normalizeDisplayCaps(h)) && !looksLikeMarketingHeadline(h)) ??
    headings[0] ??
    null;
  let schemaName: string | null = null;
  const ld = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const block of ld) {
    try {
      const parsed = JSON.parse(block[1] ?? '');
      const nodes = Array.isArray(parsed) ? parsed : parsed['@graph'] ?? [parsed];
      for (const node of nodes) {
        const type = String(node?.['@type'] ?? '');
        if (/event/i.test(type) && typeof node?.name === 'string') {
          schemaName = asText(node.name);
          break;
        }
      }
    } catch {
      // ignore malformed JSON-LD
    }
    if (schemaName) break;
  }
  return { heading, ogTitle, documentTitle, schemaName };
}

export function mergePageHintsIntoMetadata(
  metadata: Record<string, unknown>,
  hints: PageDisplayHints,
): Record<string, unknown> {
  const listing = {
    ...((metadata.listingScrape as Record<string, unknown> | undefined) ?? {}),
    heading: hints.heading ?? undefined,
    ogTitle: hints.ogTitle ?? undefined,
    documentTitle: hints.documentTitle ?? undefined,
    schemaName: hints.schemaName ?? undefined,
  };
  return { ...metadata, listingScrape: listing };
}

export function toStoredDisplayIdentity(contract: DisplayTitleContract): Record<string, unknown> {
  return {
    displayTitle: contract.displayTitle,
    displaySubtitle: contract.displaySubtitle,
    sourceName: contract.sourceName,
    venueName: contract.venueName,
    rawTitle: contract.rawTitle,
    sourceUrl: contract.sourceUrl,
    primarySourceName: contract.primarySourceName,
    discoveredThrough: contract.discoveredThrough,
    corroboratedBy: contract.corroboratedBy,
    changeReason: contract.changeReason,
    evidence: contract.evidence,
    verification: contract.verification,
    repairedAt: new Date().toISOString(),
  };
}
