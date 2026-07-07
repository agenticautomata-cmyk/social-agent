/**
 * Semantic audit ground truth for TikTok video classification quality.
 */
import type { creatorVideos } from '../schema.js';

type VideoRow = typeof creatorVideos.$inferSelect;

export const AUDIT_SAMPLE_SIZE = 50;
export const AUDIT_SEED = 42;

export type ExpectedLabels = {
  category: string | null;
  location: string | null;
  sponsorTag: string | null;
  businessExpected: boolean;
};

export type AuditMetrics = {
  sampleSize: number;
  categoryCorrect: number;
  locationCorrect: number;
  sponsorCorrect: number;
  businessRecall: number;
  businessExpectedCount: number;
  overallCorrect: number;
  categoryPct: number;
  locationPct: number;
  sponsorPct: number;
  businessRecallPct: number;
  overallPct: number;
};

export function seededShuffle<T>(arr: T[], seed = AUDIT_SEED): T[] {
  const a = [...arr];
  let s = seed;
  const rng = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function expectedLabels(title: string | null, caption: string | null): ExpectedLabels {
  const text = `${title ?? ''}\n${caption ?? ''}`.trim();
  const t = text.toLowerCase();

  let category: string | null = null;
  let location: string | null = null;
  let sponsorTag: string | null = null;
  let businessExpected = false;

  const hasKc =
    /\bkansas city\b|\bkansascity\b|\bkcmo\b|\bthingstodoinkansascity\b|\bkansascitycreator\b|\bkansascitytiktok\b|#kc\b|\bkc\b/.test(
      t,
    );

  if (
    /\bcollaborate with\b|\blooking for people to collaborate\b/i.test(t)
  ) {
    category = null;
  } else if (
    /\bwhole foods\b|\btrader joe'?s?\b|\bsprouts\b|\baldi\b|\bcostco\b|\bsam'?s club\b|\btoo good to go\b|\bfoodtiktok\b|\bfoodreview\b|\bkansascityfood\b|\bfoodie\b/.test(
      t,
    ) &&
    !/\bprom\b|\bwedding dress\b|\bworld market\b/.test(t)
  ) {
    category = 'grocery';
  } else if (
    /\brestaurant\b|\bbbq\b|\bbar-?b-?q\b|\bdiner\b|\bbrunch\b|\bp\.?\s*f\.?\s*chang\b|\bmclain'?s?\b|\bniecie'?s?\b|\bnothing bundt\b|\bbonbon\b|\bchocolates?\b|\b(?:kids meal|entrée|entree)\b/.test(
      t,
    )
  ) {
    category = 'restaurant';
  } else if (
    /\btheatre\b|\btheater\b|\bperformance\b|\bconcert\b|\bfestival\b|\bchiefs\b|\broyals\b|\bnba\b|\bworld cup\b|\bbravo\b|\bpeacock\b|\bgirl scout cookies\b/.test(
      t,
    ) &&
    !/\bimkc\b|\bapparel store\b/.test(t)
  ) {
    category = 'events';
  } else if (
    /\bshop(?:ping)?\b|\bthrift\b|\bboutique\b|\bgoodwill\b|\bsavers\b|\bboomerang\b|\bprom\b|\bwedding dress\b|\bworld market\b|\bold navy\b|\btj maxx\b|\bhomegoods\b|\bstill house\b|\bblessings abound\b|\bshopgirl\b|\bj'?adore\b|\bimkc\b|\bdo good co\b|\bpayless\b|\bzara\b|\bhaul\b|\bstore\b/.test(
      t,
    ) &&
    !/\bwhole foods\b|\btoo good to go\b|\btrader joe\b/.test(t)
  ) {
    category = 'retail';
  } else if (/\bhistory\b|\bheritage\b|\bhistoric\b|\bmuseum\b|\bnegro leagues\b/.test(t)) {
    category = 'history';
  } else if (
    /\bdistrict biskuits\b|\bbiskuits\b/.test(t)
  ) {
    category = 'restaurant';
  } else if (
    hasKc &&
    !/\b50 to 50\b|\b50 in 50\b|\bbirthday goal\b|\bnew followers\b/.test(t) &&
    /\bthings to do\b|\bhidden gem\b|\bcity market\b|\bexplore when visiting\b|\bdate night\b/.test(t) &&
    !/\bshop\b|\bstore\b|\bboutique\b|\bthrift\b/.test(t)
  ) {
    category = 'travel';
  }

  if (/\bbrookside\b/.test(t)) location = 'brookside';
  else if (/\bwaldo\b/.test(t)) location = 'waldo';
  else if (/\bwestport\b/.test(t)) location = 'westport';
  else if (/\bcrossroads\b/.test(t)) location = 'crossroads';
  else if (/\briver market\b/.test(t)) location = 'river_market';
  else if (/\boverland park\b/.test(t)) location = 'overland_park';
  else if (/\blee'?s?\s*summit\b/.test(t)) location = 'lees_summit';
  else if (/\bindependence\b/.test(t)) location = 'independence';
  else if (/\bolathe\b/.test(t)) location = 'olathe';
  else if (/\bmission,?\s*kansas\b/.test(t)) location = 'mission';
  else if (/\bleawood\b/.test(t)) location = 'leawood';
  else if (/\bwest bottoms\b/.test(t)) location = 'west_bottoms';
  else if (hasKc && (category || /\bkansas city\b|\bkansascity\b|\bkcmo\b/.test(t))) {
    location = 'kansas_city';
  }

  if (category === 'grocery') sponsorTag = 'grocery_retail';
  else if (category === 'restaurant') sponsorTag = 'local_restaurant';
  else if (category === 'retail') sponsorTag = 'retail';
  else if (category === 'events') sponsorTag = 'local_event';
  else if (category === 'history' || category === 'travel') sponsorTag = 'local_business';

  businessExpected =
    /@(?!many|arizona|cousins|zachary)[\w.]{3,}/i.test(text) ||
    /\bmclain'?s?\b|\bniecie'?s?\b|\bp\.?\s*f\.?\s*chang\b|\bnothing bundt\b|\bblessings abound\b|\bboomerang\b|\bstill house\b|\bdo good co\b|\bimkc\b|\bshopgirl\b|\bj'?adore\b|\bpayless\b|\bgoodwill\b|\bsavers\b|\bwhole foods\b|\btrader joe\b|\bgates bar-?b-?q\b|\bbella patina\b|\bcity market\b|\belliott roe\b|\bblack box kc\b/i.test(
      t,
    );

  return { category, location, sponsorTag, businessExpected };
}

export function auditVideo(row: VideoRow): {
  categoryOk: boolean;
  locationOk: boolean;
  sponsorOk: boolean;
  businessOk: boolean;
  expected: ExpectedLabels;
} {
  const expected = expectedLabels(row.title, row.caption);
  const meta =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  const businessName = typeof meta.businessName === 'string' ? meta.businessName : null;

  const categoryOk = row.contentCategory === expected.category;
  const locationOk = row.locationTag === expected.location;

  let sponsorOk = true;
  if (expected.sponsorTag === null) {
    sponsorOk = row.sponsorTag === null;
  } else {
    sponsorOk = row.sponsorTag === expected.sponsorTag;
  }

  const businessOk = !expected.businessExpected || businessName !== null;

  return { categoryOk, locationOk, sponsorOk, businessOk, expected };
}

export function runAuditOnRows(rows: VideoRow[]): {
  metrics: AuditMetrics;
  confusionMatrix: Record<string, Record<string, number>>;
  sample: Array<{
    videoId: string;
    caption: string;
    category: string | null;
    expectedCategory: string | null;
    location: string | null;
    expectedLocation: string | null;
    business: string | null;
    sponsorTag: string | null;
    confidence: number | null;
    categoryOk: boolean;
  }>;
} {
  const live = rows.filter((r) => !r.videoId.startsWith('demo_tt_'));
  const seen = new Set<string>();
  const sample: VideoRow[] = [];
  for (const row of seededShuffle(live)) {
    if (seen.has(row.videoId)) continue;
    seen.add(row.videoId);
    sample.push(row);
    if (sample.length >= AUDIT_SAMPLE_SIZE) break;
  }

  const confusionMatrix: Record<string, Record<string, number>> = {};
  let categoryCorrect = 0;
  let locationCorrect = 0;
  let sponsorCorrect = 0;
  let businessRecall = 0;
  let businessExpectedCount = 0;
  let overallCorrect = 0;

  const sampleOut = sample.map((row) => {
    const result = auditVideo(row);
    if (result.categoryOk) categoryCorrect++;
    if (result.locationOk) locationCorrect++;
    if (result.sponsorOk) sponsorCorrect++;
    if (result.expected.businessExpected) {
      businessExpectedCount++;
      if (result.businessOk) businessRecall++;
    }
    if (result.categoryOk && result.locationOk && result.sponsorOk) overallCorrect++;

    const assigned = row.contentCategory ?? '(none)';
    const ideal = result.expected.category ?? '(none)';
    if (!confusionMatrix[assigned]) confusionMatrix[assigned] = {};
    confusionMatrix[assigned][ideal] = (confusionMatrix[assigned][ideal] ?? 0) + 1;

    const meta =
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};

    return {
      videoId: row.videoId,
      caption: (row.caption || row.title || '').slice(0, 120),
      category: row.contentCategory,
      expectedCategory: result.expected.category,
      location: row.locationTag,
      expectedLocation: result.expected.location,
      business: typeof meta.businessName === 'string' ? meta.businessName : null,
      sponsorTag: row.sponsorTag,
      confidence: typeof meta.confidence === 'number' ? meta.confidence : null,
      categoryOk: result.categoryOk,
    };
  });

  const n = sample.length;
  const metrics: AuditMetrics = {
    sampleSize: n,
    categoryCorrect,
    locationCorrect,
    sponsorCorrect,
    businessRecall,
    businessExpectedCount,
    overallCorrect,
    categoryPct: Math.round((categoryCorrect / n) * 100),
    locationPct: Math.round((locationCorrect / n) * 100),
    sponsorPct: Math.round((sponsorCorrect / n) * 100),
    businessRecallPct:
      businessExpectedCount > 0 ? Math.round((businessRecall / businessExpectedCount) * 100) : 0,
    overallPct: Math.round((overallCorrect / n) * 100),
  };

  return { metrics, confusionMatrix, sample: sampleOut };
}
