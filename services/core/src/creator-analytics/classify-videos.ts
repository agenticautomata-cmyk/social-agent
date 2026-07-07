import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { creatorVideos } from '../schema.js';

export type ClassificationMatch = {
  ruleId: string;
  field: 'category' | 'location' | 'business';
  signal: string;
  weight: number;
};

export type VideoClassification = {
  contentCategory: string | null;
  contentPillar: string | null;
  locationTag: string | null;
  sponsorTag: string | null;
  confidence: number;
  matchedRules: ClassificationMatch[];
  metadata: Record<string, unknown>;
};

export const CATEGORY_SPONSOR_TAGS: Record<string, string> = {
  grocery: 'grocery_retail',
  restaurant: 'local_restaurant',
  retail: 'retail',
  events: 'local_event',
  history: 'local_business',
  travel: 'local_business',
};

export const CATEGORY_FORMATS: Record<string, string> = {
  grocery: 'grocery_haul',
  restaurant: 'review',
  retail: 'shopping_trip',
  events: 'event_coverage',
  history: 'story',
  travel: 'listicle',
};

const MIN_CATEGORY_SCORE = 0.45;

const STRONG_KC_MARKERS = [
  'kansas city',
  'kansascity',
  'kcmo',
  'thingstodoinkansascity',
  'kansascitycreator',
  'kansascitytiktok',
];

const WEAK_KC_MARKERS = ['kc ', ' kc', '#kc', ' kcmo'];

const NEIGHBORHOODS: Array<{ pattern: RegExp; tag: string; ruleId: string }> = [
  { pattern: /\bbrookside\b/i, tag: 'brookside', ruleId: 'loc:brookside' },
  { pattern: /\bwaldo\b/i, tag: 'waldo', ruleId: 'loc:waldo' },
  { pattern: /\bwestport\b/i, tag: 'westport', ruleId: 'loc:westport' },
  { pattern: /\bcrossroads\b/i, tag: 'crossroads', ruleId: 'loc:crossroads' },
  { pattern: /\briver market\b/i, tag: 'river_market', ruleId: 'loc:river_market' },
  { pattern: /\boverland park\b/i, tag: 'overland_park', ruleId: 'loc:overland_park' },
  { pattern: /\blee'?s?\s*summit\b/i, tag: 'lees_summit', ruleId: 'loc:lees_summit' },
  { pattern: /\bindependence\b/i, tag: 'independence', ruleId: 'loc:independence' },
  { pattern: /\bolathe\b/i, tag: 'olathe', ruleId: 'loc:olathe' },
  { pattern: /\bmission,?\s*kansas\b/i, tag: 'mission', ruleId: 'loc:mission' },
  { pattern: /\bleawood\b/i, tag: 'leawood', ruleId: 'loc:leawood' },
  { pattern: /\bwest bottoms\b/i, tag: 'west_bottoms', ruleId: 'loc:west_bottoms' },
  { pattern: /\bplaza\b|\bcountry club plaza\b/i, tag: 'plaza', ruleId: 'loc:plaza' },
  { pattern: /\b18th\s*(?:&|and)\s*v(?:ine)?\b/i, tag: '18th_and_vine', ruleId: 'loc:18th_and_vine' },
  { pattern: /\bunion station\b/i, tag: 'union_station', ruleId: 'loc:union_station' },
  { pattern: /\bpower\s*&?\s*light\b/i, tag: 'power_and_light', ruleId: 'loc:power_and_light' },
];

type PatternDef = { regex: RegExp; weight: number; ruleId: string };

type CategoryDef = {
  category: string;
  patterns: PatternDef[];
  requiresKc?: boolean;
};

const CATEGORY_DEFS: CategoryDef[] = [
  {
    category: 'grocery',
    patterns: [
      { regex: /\bwhole foods\b|wholefoods/i, weight: 1.35, ruleId: 'grocery:whole_foods' },
      { regex: /\btrader joe'?s?\b/i, weight: 1.35, ruleId: 'grocery:trader_joes' },
      { regex: /\bsprouts\b/i, weight: 1.3, ruleId: 'grocery:sprouts' },
      { regex: /\baldi\b/i, weight: 1.3, ruleId: 'grocery:aldi' },
      { regex: /\bcostco\b/i, weight: 1.3, ruleId: 'grocery:costco' },
      { regex: /\bsam'?s club\b/i, weight: 1.3, ruleId: 'grocery:sams_club' },
      { regex: /\btoo good to go\b/i, weight: 1.25, ruleId: 'grocery:too_good_to_go' },
      { regex: /\bwalmart\b.*\b(?:grocery|food|haul|groceries)\b/i, weight: 1.1, ruleId: 'grocery:walmart_grocery' },
      { regex: /\b(?:grocery|groceries)\b/i, weight: 1.0, ruleId: 'grocery:grocery' },
      { regex: /foodtiktok|foodreview|kansascityfood/i, weight: 1.05, ruleId: 'grocery:food_hashtag' },
      { regex: /\bfoodie\b|\bfood review\b/i, weight: 0.85, ruleId: 'grocery:foodie' },
    ],
  },
  {
    category: 'restaurant',
    patterns: [
      { regex: /\bbar-?b-?q\b|\bbbq\b/i, weight: 1.2, ruleId: 'restaurant:bbq' },
      { regex: /\brestaurant\b|\bdiner\b|\bbrunch\b/i, weight: 1.15, ruleId: 'restaurant:dining' },
      { regex: /\bcafe\b|\bcoffee shop\b|\bsteak\b|\bmenu\b/i, weight: 1.0, ruleId: 'restaurant:cafe' },
      { regex: /\btacos?\b|\bpizza\b|\bburger\b/i, weight: 1.0, ruleId: 'restaurant:entree' },
      { regex: /\bp\.?\s*f\.?\s*chang'?s?\b/i, weight: 1.3, ruleId: 'restaurant:pf_changs' },
      { regex: /\bmclain'?s?\b/i, weight: 1.25, ruleId: 'restaurant:mclains' },
      { regex: /\bniecie'?s?\b/i, weight: 1.25, ruleId: 'restaurant:niecies' },
      { regex: /\bnothing bundt cake\b/i, weight: 1.2, ruleId: 'restaurant:nothing_bundt' },
      { regex: /\bgates bar-?b-?q\b|\bjoe'?s kc\b|\bq39\b|\barthur bryant/i, weight: 1.25, ruleId: 'restaurant:kc_bbq' },
      { regex: /\bdistrict biskuits\b|\bbiskuits\b/i, weight: 1.2, ruleId: 'restaurant:district_biskuits' },
      { regex: /\bbonbon\b|\bchocolates?\b/i, weight: 0.95, ruleId: 'restaurant:dessert' },
      { regex: /\b(?:kids meal|entrée|entree)\b/i, weight: 0.9, ruleId: 'restaurant:meal' },
    ],
  },
  {
    category: 'events',
    patterns: [
      { regex: /\btheatre\b|\btheater\b|\bperformance\b|\bperforming\b/i, weight: 1.2, ruleId: 'events:theatre' },
      { regex: /\bconcert\b|\bfestival\b|\bevent\b/i, weight: 1.05, ruleId: 'events:concert' },
      { regex: /\bchiefs\b|\broyals\b|\bsporting kc\b|\bnba\b|\bworld cup\b/i, weight: 1.1, ruleId: 'events:sports' },
      { regex: /\bbravo\b|\bpeacock\b|\breality tv\b/i, weight: 1.0, ruleId: 'events:entertainment' },
      { regex: /\bgirl scout cookies\b/i, weight: 0.95, ruleId: 'events:seasonal' },
    ],
  },
  {
    category: 'retail',
    patterns: [
      { regex: /\bshop(?:ping)?(?:\s+with me|\s+local|\s+it or skip it)?\b/i, weight: 1.0, ruleId: 'retail:shopping' },
      { regex: /\bthrift(?:ing|finds|tok| store)?\b|\bthrift\b/i, weight: 1.05, ruleId: 'retail:thrift' },
      { regex: /\bboutique\b|\bretail\b|\bmall\b|\bstore find\b/i, weight: 0.95, ruleId: 'retail:boutique' },
      { regex: /\bgoodwill\b|\bsavers\b|\bboomerang\b|\bshopgirl\b/i, weight: 1.05, ruleId: 'retail:local_store' },
      { regex: /\bprom\b|\bwedding dress\b|\bspecial occasion dress\b/i, weight: 1.0, ruleId: 'retail:formalwear' },
      { regex: /\bworld market\b/i, weight: 0.85, ruleId: 'retail:world_market' },
      { regex: /\bold navy\b|\btj maxx\b|\bross finds\b|\bat home store\b|\bhomegoods\b/i, weight: 1.0, ruleId: 'retail:chain_store' },
      { regex: /\bhome decor\b|\bhomedecor\b|\bdecor\b|\bfurniture\b/i, weight: 0.8, ruleId: 'retail:home_decor' },
      { regex: /\bhaul\b|\bshop local\b|\bsupport local\b|\bshopgirl\b/i, weight: 0.85, ruleId: 'retail:haul' },
      { regex: /\bpayless\b|\bdo good co\b|\bimkc\b|\bstill house\b|\bblessings abound\b|\bj'?adore\b/i, weight: 1.05, ruleId: 'retail:named_local' },
      { regex: /\bstore\b|\bshop\b/i, weight: 0.55, ruleId: 'retail:generic_store' },
    ],
  },
  {
    category: 'history',
    patterns: [
      { regex: /\bhistory\b|\bheritage\b|\bhistoric\b|\bmuseum\b/i, weight: 1.05, ruleId: 'history:heritage' },
      { regex: /\blegacy\b|\bsoul music\b|\bnegro leagues\b/i, weight: 0.95, ruleId: 'history:legacy' },
    ],
  },
  {
    category: 'travel',
    requiresKc: true,
    patterns: [
      { regex: /\bthings to do\b|\bthingstodoinkansascity\b/i, weight: 1.05, ruleId: 'travel:things_to_do' },
      { regex: /\bhidden gem\b/i, weight: 0.75, ruleId: 'travel:hidden_gem' },
      {
        regex: /\b(?:visit|explore|discover|tour)\b/i,
        weight: 0.55,
        ruleId: 'travel:explore',
      },
      { regex: /\b(?:visit|explore|discover|tour)\b.*\bkansas/i, weight: 0.95, ruleId: 'travel:visit_kc' },
      { regex: /\bcity market\b|\bdate night\b/i, weight: 0.85, ruleId: 'travel:kc_destination' },
      { regex: /\bday trip\b|\bweekend in kc\b/i, weight: 0.9, ruleId: 'travel:day_trip' },
    ],
  },
];

const BUSINESS_PATTERNS: Array<{ pattern: RegExp; name: string; ruleId: string }> = [
  { pattern: /\bgates bar-?b-?q\b/i, name: 'Gates Bar-B-Q', ruleId: 'biz:gates' },
  { pattern: /\bbella patina\b/i, name: 'Bella Patina', ruleId: 'biz:bella_patina' },
  { pattern: /\bunion station\b/i, name: 'Union Station', ruleId: 'biz:union_station' },
  { pattern: /\bnegro leagues baseball museum\b/i, name: 'Negro Leagues Baseball Museum', ruleId: 'biz:nlbm' },
  { pattern: /\bcountry club plaza\b/i, name: 'Country Club Plaza', ruleId: 'biz:plaza' },
  { pattern: /\bfill your cup\b/i, name: 'Fill Your Cup', ruleId: 'biz:fill_your_cup' },
  { pattern: /\bwhole foods\b/i, name: 'Whole Foods', ruleId: 'biz:whole_foods' },
  { pattern: /\btrader joe'?s?\b/i, name: "Trader Joe's", ruleId: 'biz:trader_joes' },
  { pattern: /\bsprouts\b/i, name: 'Sprouts', ruleId: 'biz:sprouts' },
  { pattern: /\bmclain'?s?\b/i, name: "McLain's Market", ruleId: 'biz:mclains' },
  { pattern: /\bniecie'?s?\b/i, name: "Niecie's Restaurant", ruleId: 'biz:niecies' },
  { pattern: /\bp\.?\s*f\.?\s*chang'?s?\b/i, name: "P.F. Chang's", ruleId: 'biz:pf_changs' },
  { pattern: /\bnothing bundt cake\b/i, name: 'Nothing Bundt Cakes', ruleId: 'biz:nothing_bundt' },
  { pattern: /\bblessings abound\b/i, name: 'Blessings Abound', ruleId: 'biz:blessings_abound' },
  { pattern: /\bboomerang\b/i, name: 'Boomerang', ruleId: 'biz:boomerang' },
  { pattern: /\bstill house\b/i, name: 'Still House', ruleId: 'biz:still_house' },
  { pattern: /\bdo good co\.?\b/i, name: 'Do Good Co.', ruleId: 'biz:do_good_co' },
  { pattern: /\bimkc\b/i, name: 'IMKC', ruleId: 'biz:imkc' },
  { pattern: /\bshopgirl\b/i, name: 'Shopgirl Brookside', ruleId: 'biz:shopgirl' },
  { pattern: /\bj'?adore\b/i, name: "J'Adore Brookside", ruleId: 'biz:jadore' },
  { pattern: /\belliott roe\b/i, name: 'Elliott Roe Florist', ruleId: 'biz:elliott_roe' },
  { pattern: /\bcity market\b/i, name: 'City Market', ruleId: 'biz:city_market' },
  { pattern: /\bblack box kc\b/i, name: 'The Black Box KC', ruleId: 'biz:black_box' },
  { pattern: /\bgoodwill\b/i, name: 'Goodwill', ruleId: 'biz:goodwill' },
  { pattern: /\bsavers\b/i, name: 'Savers', ruleId: 'biz:savers' },
  { pattern: /\bpayless\b/i, name: 'Payless', ruleId: 'biz:payless' },
  { pattern: /\bcargo largo\b/i, name: 'Cargo Largo', ruleId: 'biz:cargo_largo' },
];

const MENTION_BLOCKLIST = new Set([
  'many',
  'arizona',
  'cousins',
  'zachary',
  'zacharyreality',
  'foryoupage',
  'tiktok',
]);

function formatMention(raw: string): string {
  return raw
    .replace(/\./g, ' ')
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function testPattern(pattern: RegExp, lower: string, hashtags: string[]): boolean {
  if (pattern.test(lower)) return true;
  return hashtags.some((h) => pattern.test(h));
}

function scoreCategories(
  bodyLower: string,
  hashtags: string[],
  hasKc: boolean,
): { scores: Record<string, { score: number; matches: ClassificationMatch[] }>; matches: ClassificationMatch[] } {
  const scores: Record<string, { score: number; matches: ClassificationMatch[] }> = {};
  const allMatches: ClassificationMatch[] = [];

  for (const def of CATEGORY_DEFS) {
    if (def.requiresKc && !hasKc) continue;
    if (def.category === 'travel' && /\b50 to 50\b|\b50 in 50\b|\bbirthday goal\b|\bnew followers before\b/i.test(bodyLower)) {
      continue;
    }

    for (const p of def.patterns) {
      const inText = p.regex.test(bodyLower);
      const inTags = hashtags.some((h) => p.regex.test(h));
      if (!inText && !inTags) continue;

      const multiplier = inText ? 1 : 0.75;
      const points = p.weight * multiplier;
      let bucket = scores[def.category];
      if (!bucket) {
        bucket = { score: 0, matches: [] };
        scores[def.category] = bucket;
      }
      bucket.score += points;

      const match: ClassificationMatch = {
        ruleId: p.ruleId,
        field: 'category',
        signal: p.ruleId,
        weight: points,
      };
      bucket.matches.push(match);
      allMatches.push(match);
    }
  }

  return { scores, matches: allMatches };
}

function adjustCategoryScores(
  scores: Record<string, { score: number; matches: ClassificationMatch[] }>,
  bodyLower: string,
): void {
  if (/\bcollaborate with\b|\blooking for people to collaborate\b/i.test(bodyLower)) {
    for (const entry of Object.values(scores)) entry.score = 0;
    return;
  }
  if (/\bexplore your city\b/i.test(bodyLower)) {
    if (scores.travel) scores.travel.score *= 0.4;
  }
  if (/\bshop\b/i.test(bodyLower) && /\bexplore\b/i.test(bodyLower) && scores.travel) {
    scores.travel.score *= 0.65;
  }
  if (/\b50 to 50\b|\b50 in 50\b/i.test(bodyLower) && scores.travel) {
    scores.travel.score *= 0.35;
  }
}

function detectKc(
  lower: string,
  hashtags: string[],
): { hasKc: boolean; strong: boolean; matches: ClassificationMatch[] } {
  const matches: ClassificationMatch[] = [];
  let strong = false;

  for (const m of STRONG_KC_MARKERS) {
    const norm = m.replace(/[^a-z0-9]/g, '');
    if (lower.includes(m) || hashtags.some((h) => h.includes(norm))) {
      strong = true;
      matches.push({ ruleId: `loc:kc_strong:${m}`, field: 'location', signal: m, weight: 1 });
    }
  }

  if (!strong) {
    for (const m of WEAK_KC_MARKERS) {
      const norm = m.replace(/[^a-z0-9]/g, '');
      if (lower.includes(m) || hashtags.some((h) => h.includes(norm) || h === 'kc')) {
        matches.push({ ruleId: `loc:kc_weak:${m}`, field: 'location', signal: m, weight: 0.35 });
      }
    }
  }

  return { hasKc: strong || matches.length > 0, strong, matches };
}

function detectLocation(
  lower: string,
  hasCategory: boolean,
  hasBusiness: boolean,
  kc: ReturnType<typeof detectKc>,
): { locationTag: string | null; matches: ClassificationMatch[] } {
  const matches: ClassificationMatch[] = [...kc.matches];

  for (const n of NEIGHBORHOODS) {
    if (n.pattern.test(lower)) {
      matches.push({ ruleId: n.ruleId, field: 'location', signal: n.tag, weight: 1.2 });
      return { locationTag: n.tag, matches };
    }
  }

  if (kc.strong) {
    return { locationTag: 'kansas_city', matches };
  }

  if (kc.hasKc && (hasCategory || hasBusiness)) {
    return { locationTag: 'kansas_city', matches };
  }

  return { locationTag: null, matches: kc.hasKc ? matches : [] };
}

function extractBusiness(
  text: string,
  lower: string,
): { businessName: string | null; matches: ClassificationMatch[] } {
  const matches: ClassificationMatch[] = [];

  for (const b of BUSINESS_PATTERNS) {
    if (b.pattern.test(text)) {
      matches.push({ ruleId: b.ruleId, field: 'business', signal: b.name, weight: 1.2 });
      return { businessName: b.name, matches };
    }
  }

  for (const m of text.matchAll(/@([\w.]+)/g)) {
    const raw = m[1]!.toLowerCase();
    if (MENTION_BLOCKLIST.has(raw)) continue;
    const name = formatMention(m[1]!);
    if (name.length >= 4) {
      matches.push({ ruleId: `biz:mention:${raw}`, field: 'business', signal: name, weight: 0.9 });
      return { businessName: name, matches };
    }
  }

  const quoted = text.match(/"([^"]{3,60})"/)?.[1];
  if (quoted && /[A-Z]/.test(quoted)) {
    const name = quoted.trim();
    matches.push({ ruleId: 'biz:quoted', field: 'business', signal: name, weight: 0.7 });
    return { businessName: name, matches };
  }

  const stoppingBy = text.match(/\bstopping by\s+([A-Z][A-Za-z'&.]+(?:\s+[A-Z][A-Za-z'&.]+){0,3})/i)?.[1];
  if (stoppingBy) {
    const name = stoppingBy.trim();
    matches.push({ ruleId: 'biz:stopping_by', field: 'business', signal: name, weight: 0.75 });
    return { businessName: name, matches };
  }

  return { businessName: null, matches };
}

function pickCategory(
  scores: Record<string, { score: number; matches: ClassificationMatch[] }>,
  bodyLower: string,
): {
  category: string | null;
  score: number;
  margin: number;
  matches: ClassificationMatch[];
} {
  const ranked = Object.entries(scores).sort((a, b) => b[1].score - a[1].score);
  const best = ranked[0];
  const second = ranked[1];
  if (!best || best[1].score < MIN_CATEGORY_SCORE) {
    return { category: null, score: 0, margin: 0, matches: [] };
  }

  let margin = second ? best[1].score - second[1].score : best[1].score;

  // Prefer retail over travel when explicit shop/thrift language appears.
  if (
    best[0] === 'travel' &&
    scores.retail &&
    scores.travel &&
    /\bshop\b|\bthrift\b|\bstore\b|\bboutique\b/i.test(bodyLower) &&
    scores.retail.score >= scores.travel.score - 0.25
  ) {
    return {
      category: 'retail',
      score: scores.retail.score,
      margin: scores.retail.score - scores.travel.score,
      matches: scores.retail.matches,
    };
  }

  return {
    category: best[0],
    score: best[1].score,
    margin,
    matches: best[1].matches,
  };
}

function computeConfidence(input: {
  categoryScore: number;
  categoryMargin: number;
  hasLocation: boolean;
  locationStrong: boolean;
  hasBusiness: boolean;
  matchedCount: number;
}): number {
  let confidence = 0;
  if (input.categoryScore > 0) {
    confidence += Math.min(0.55, input.categoryScore / 2.2);
    confidence += Math.min(0.15, input.categoryMargin / 2);
  }
  if (input.hasLocation) confidence += input.locationStrong ? 0.2 : 0.1;
  if (input.hasBusiness) confidence += 0.1;
  if (input.matchedCount >= 3) confidence += 0.05;
  if (input.categoryScore > 0 && input.categoryMargin < 0.15) confidence -= 0.12;

  return Math.round(Math.max(0, Math.min(1, confidence)) * 100) / 100;
}

export function classifyVideoText(
  title: string | null | undefined,
  caption: string | null | undefined,
): VideoClassification {
  const text = `${title ?? ''}\n${caption ?? ''}`.trim();
  const lower = text.toLowerCase();
  const bodyLower = lower.replace(/#[\w]+/g, ' ').replace(/\s+/g, ' ').trim();
  const hashtags = [...text.matchAll(/#([\w]+)/g)].map((m) => m[1]!.toLowerCase());

  const kc = detectKc(lower, hashtags);
  const { scores } = scoreCategories(bodyLower, hashtags, kc.strong || kc.hasKc);
  adjustCategoryScores(scores, bodyLower);
  const picked = pickCategory(scores, bodyLower);

  let contentCategory = picked.category;
  let sponsorTag = contentCategory ? CATEGORY_SPONSOR_TAGS[contentCategory] ?? null : null;
  let contentPillar = contentCategory ? CATEGORY_FORMATS[contentCategory] ?? null : null;

  const business = extractBusiness(text, bodyLower);
  if (business.businessName && !contentCategory) {
    if (/\b(?:restaurant|cafe|bbq|food|coffee|chang|mclain|niecie|bundt)\b/i.test(bodyLower)) {
      contentCategory = 'restaurant';
    } else if (/\b(?:shop|store|thrift|boutique|goodwill|savers)\b/i.test(bodyLower)) {
      contentCategory = 'retail';
    } else if (/\b(?:whole foods|trader joe|sprouts|grocery|too good to go)\b/i.test(bodyLower)) {
      contentCategory = 'grocery';
    }
    if (contentCategory) {
      sponsorTag = CATEGORY_SPONSOR_TAGS[contentCategory] ?? null;
      contentPillar = CATEGORY_FORMATS[contentCategory] ?? null;
    }
  }

  const location = detectLocation(`${bodyLower} ${lower}`, !!contentCategory, !!business.businessName, kc);

  const matchedRules = [
    ...picked.matches,
    ...location.matches,
    ...business.matches,
  ];

  const confidence = computeConfidence({
    categoryScore: picked.score,
    categoryMargin: picked.margin,
    hasLocation: !!location.locationTag,
    locationStrong: kc.strong || location.locationTag !== 'kansas_city',
    hasBusiness: !!business.businessName,
    matchedCount: matchedRules.length,
  });

  const metadata: Record<string, unknown> = {
    classifiedAt: new Date().toISOString(),
    hashtags: hashtags.slice(0, 20),
    confidence,
    matchedRules: matchedRules.map((m) => ({
      ruleId: m.ruleId,
      field: m.field,
      signal: m.signal,
      weight: m.weight,
    })),
  };
  if (business.businessName) metadata.businessName = business.businessName;

  return {
    contentCategory,
    contentPillar,
    locationTag: location.locationTag,
    sponsorTag,
    confidence,
    matchedRules,
    metadata,
  };
}

export async function classifyTikTokVideos(options?: {
  accountId?: string;
  onlyMissing?: boolean;
  force?: boolean;
}): Promise<{ updated: number; skipped: number }> {
  const onlyMissing = options?.onlyMissing ?? true;
  const force = options?.force ?? false;
  const rows = await db
    .select()
    .from(creatorVideos)
    .where(eq(creatorVideos.platform, 'tiktok'));

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (row.videoId.startsWith('demo_tt_')) {
      skipped++;
      continue;
    }
    if (
      !force &&
      onlyMissing &&
      row.contentCategory &&
      row.locationTag &&
      row.sponsorTag
    ) {
      skipped++;
      continue;
    }

    const classification = classifyVideoText(row.title, row.caption);
    if (
      !force &&
      !classification.contentCategory &&
      !classification.locationTag &&
      !classification.sponsorTag
    ) {
      skipped++;
      continue;
    }

    const existingMeta =
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};

    await db
      .update(creatorVideos)
      .set({
        contentCategory: classification.contentCategory,
        contentPillar: classification.contentPillar,
        locationTag: classification.locationTag,
        sponsorTag: classification.sponsorTag,
        metadata: { ...existingMeta, ...classification.metadata },
        updatedAt: new Date(),
      })
      .where(eq(creatorVideos.id, row.id));

    updated++;
  }

  return { updated, skipped };
}
