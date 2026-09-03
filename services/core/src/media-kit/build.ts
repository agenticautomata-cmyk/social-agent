/**
 * Builds Kellie's media kit from live data.
 *
 * Both `media_kits` rows in production are test artifacts — "Test Kit" with no file at
 * all, and "Upload Test" pointing at a 69-byte PNG. Sixty queued pitches attached that
 * 69-byte file as Kellie's media kit, so every one of them would have arrived with a
 * broken image where her credentials should be.
 *
 * A kit here is generated, never uploaded: a core profile plus a business-specific
 * layer, both rendered from the same live analytics the pitch quotes. Nothing in it is
 * written by hand, so it cannot go stale silently — if analytics do not resolve, the
 * kit is not built and the readiness gate reports the missing step.
 */

import { desc, eq, sql } from 'drizzle-orm';

import { db } from '../db.js';
import { mediaKits } from '../schema.js';
import {
  resolvePitchAudienceEvidence,
  type PitchAudienceEvidence,
} from '../hospitality-pitch/creator-evidence.js';

/**
 * The kinds of business a kit can be tailored for. Positioning genuinely differs: a
 * hotel is buying an overnight narrative, a restaurant is buying appetite.
 */
export const MEDIA_KIT_VARIANTS = ['core', 'hotel', 'restaurant', 'destination'] as const;
export type MediaKitVariant = (typeof MEDIA_KIT_VARIANTS)[number];

export type MediaKitExample = {
  title: string;
  url: string | null;
  views: number | null;
  engagement: number | null;
  postedAt: string | null;
};

export type MediaKitContent = {
  variant: MediaKitVariant;
  creatorName: string;
  headline: string;
  bio: string;
  market: string;
  coverage: string[];
  contentCategories: string[];
  /** Deliverables Kellie offers, phrased for this variant. */
  services: string[];
  audience: PitchAudienceEvidence;
  examples: MediaKitExample[];
  /** How the examples were selected, so the reader is not misled about relevance. */
  examplesNote: string;
  /**
   * Only partnerships Benson can evidence. Empty is the honest answer today: the two
   * real sends never got a reply, so there is no delivered partnership to show.
   */
  verifiedPartnerships: Array<{ business: string; what: string; when: string }>;
  contactEmail: string | null;
  disclosure: string[];
  generatedAt: string;
};

const CORE_BIO =
  'Kellie is a Kansas City content creator making short, first-person video about the city — where to eat, where to stay, and what is worth leaving the house for. Her work is filmed and edited on the day, in her own voice, for people who actually live here.';

const VARIANT_HEADLINES: Record<MediaKitVariant, string> = {
  core: 'Kansas City creator — short-form video about the city',
  hotel: 'Kansas City creator — overnight stays, told as one continuous evening',
  restaurant: 'Kansas City creator — food video for people deciding where to eat tonight',
  destination: 'Kansas City creator — local-first video for visitors and residents',
};

const VARIANT_POSITIONING: Record<MediaKitVariant, string> = {
  core: CORE_BIO,
  hotel: `${CORE_BIO} For hotels she films the whole arc of a stay — arrival, room, restaurant, neighbourhood — so the property reads as somewhere locals would choose, not only somewhere visitors land.`,
  restaurant: `${CORE_BIO} For restaurants she films the food being made and eaten in real light, close in, at the pace someone scrolling actually watches.`,
  destination: `${CORE_BIO} For destination marketing she covers a place the way a resident recommends it, which is what travellers are searching for when they distrust an ad.`,
};

const VARIANT_SERVICES: Record<MediaKitVariant, string[]> = {
  core: [
    'In-feed short-form video, filmed and edited by Kellie',
    'Story sets published live from the location',
    'Stills usable on the business\u2019s own channels',
  ],
  hotel: [
    'One in-feed video covering arrival, room and property in a single evening',
    'Story set published live during the stay',
    'Stills of the room and public spaces for the property\u2019s own channels',
    'Optional paid-usage licence, quoted separately',
  ],
  restaurant: [
    'One in-feed video built around two or three dishes',
    'Story set published live from the table',
    'Stills of the plates for the restaurant\u2019s own channels',
  ],
  destination: [
    'A short itinerary video covering three or four stops',
    'Story coverage across the day',
    'Stills from each location',
  ],
};

const DISCLOSURE = [
  'Every paid or hosted collaboration is disclosed in-video and in the caption, as the FTC requires.',
  'Kellie keeps editorial control of the edit. Businesses see the video before it posts and can flag factual errors.',
  'Organic posting rights on the business\u2019s own channels are included. Paid amplification is licensed separately.',
];

/**
 * Kellie's strongest recent posts, by views, from the connected account only.
 *
 * Ordered by views rather than recency: a media kit is a portfolio, and the point is
 * what her work can do. The stale duplicate connector is excluded the same way the
 * audience numbers exclude it.
 */
/** Caption patterns that identify work relevant to each variant. */
const VARIANT_TOPICS: Record<MediaKitVariant, RegExp | null> = {
  core: null,
  hotel: /\b(hotel|stay|staycation|suite|resort|rooftop|lobby|check[- ]?in|overnight)\b/i,
  restaurant: /\b(restaurant|dinner|lunch|brunch|eat|eats|food|menu|dish|chef|bar|cocktail|coffee|cafe|bakery|taco|pizza|burger)\b/i,
  destination: /\b(kansas city|\bkc\b|downtown|crossroads|plaza|river ?market|things to do|weekend|visit)\b/i,
};

export async function topPerformingExamples(limit = 4): Promise<MediaKitExample[]> {
  // Deduplicated on the platform video id exactly as the audience numbers are, so the
  // kit cannot show a post twice from the stale mirrored connector.
  const result = await db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (v.video_id)
             v.video_id,
             coalesce(v.title, v.caption) AS caption,
             v.post_url,
             v.published_at,
             s.views,
             (s.likes + s.comments + s.shares) AS engagement
      FROM creator_metrics_snapshots s
      JOIN creator_videos v ON v.id = s.video_id
      JOIN creator_accounts a ON a.id = v.account_id
      WHERE v.platform = 'tiktok'
        AND v.video_id NOT LIKE 'demo_tt_%'
        AND s.views > 0
      ORDER BY
        v.video_id,
        (a.connection_status = 'oauth_connected') DESC,
        s.collected_at DESC
    )
    SELECT caption, post_url, published_at, views, engagement
    FROM latest
    ORDER BY views DESC
    LIMIT 60
  `);

  const rows = (Array.isArray(result) ? result : ((result as { rows: unknown[] }).rows ?? [])) as
    Array<Record<string, unknown>>;

  return rows
    .map((row) => ({
      title: cleanCaption(row.caption),
      url: typeof row.post_url === 'string' && row.post_url.trim() ? row.post_url : null,
      views: numberOrNull(row.views),
      engagement: numberOrNull(row.engagement),
      postedAt: row.published_at instanceof Date ? row.published_at.toISOString() : null,
    }))
    .slice(0, limit);
}

/**
 * Examples chosen for the variant, plus how they were chosen.
 *
 * A hotel kit whose four examples are all thrift hauls reads as a mismatch, so
 * on-topic work is preferred. But `creator_videos.content_category` is NULL on
 * essentially every row, so this matches on captions, and when there is not enough
 * on-topic work it falls back to her strongest posts and says so rather than
 * implying they are hotel videos.
 */
export async function examplesForVariant(
  variant: MediaKitVariant,
  limit = 4,
): Promise<{ examples: MediaKitExample[]; note: string }> {
  const all = await topPerformingExamples(60);
  const topic = VARIANT_TOPICS[variant];

  if (!topic) {
    return {
      examples: all.slice(0, limit),
      note: 'Her strongest recent posts, ranked by views.',
    };
  }

  const onTopic = all.filter((example) => topic.test(example.title));
  if (onTopic.length >= 2) {
    const filled = [...onTopic, ...all.filter((e) => !onTopic.includes(e))].slice(0, limit);
    return {
      examples: filled,
      note:
        onTopic.length >= limit
          ? `Her strongest ${variant === 'destination' ? 'Kansas City' : variant} posts, ranked by views.`
          : `On-topic work first, then her strongest recent posts.`,
    };
  }

  return {
    examples: all.slice(0, limit),
    note: 'Her strongest recent posts, ranked by views. Kansas City shopping and thrift is where her audience is largest today.',
  };
}

/** Captions are hashtag-heavy; the kit shows a readable title, not the raw caption. */
function cleanCaption(value: unknown): string {
  const raw = typeof value === 'string' ? value : '';
  const withoutTags = raw
    .replace(/#[\p{L}\p{N}_]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!withoutTags) return 'Untitled post';
  if (withoutTags.length <= 90) return withoutTags;
  // Cut at a word boundary — "…feels different fr…" reads like a rendering bug.
  const clipped = withoutTags.slice(0, 90);
  const lastSpace = clipped.lastIndexOf(' ');
  const base = lastSpace > 40 ? clipped.slice(0, lastSpace) : clipped;
  return `${base.replace(/[,;:.\s]+$/, '')}\u2026`;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export type BuildMediaKitResult =
  | { ok: true; content: MediaKitContent }
  | { ok: false; missing: string[] };

/**
 * Assembles kit content, or refuses and says what is missing.
 *
 * Refusing matters: a kit built without live analytics would show blank or invented
 * reach, and it is attached to pitches. Better to have no kit and an honest block than
 * a kit that misstates Kellie's audience.
 */
export async function buildMediaKitContent(input: {
  variant: MediaKitVariant;
  contactEmail?: string | null;
}): Promise<BuildMediaKitResult> {
  const audience = await resolvePitchAudienceEvidence();
  const missing: string[] = [];

  if (!audience.followersAvailable) {
    missing.push(
      audience.unavailableReason ??
        'Live follower analytics did not resolve, so the kit cannot state Kellie\u2019s reach.',
    );
  }
  if (audience.stale) {
    missing.push('The analytics connector is stale, so the kit would show out-of-date numbers.');
  }

  const { examples, note: examplesNote } = await examplesForVariant(input.variant);
  if (examples.length === 0) {
    missing.push('No posts with metrics are available, so the kit has no work to show.');
  }

  if (missing.length > 0) return { ok: false, missing };

  return {
    ok: true,
    content: {
      variant: input.variant,
      creatorName: 'Kellie',
      headline: VARIANT_HEADLINES[input.variant],
      bio: VARIANT_POSITIONING[input.variant],
      market: 'Kansas City metro (Missouri and Kansas)',
      coverage: [
        'Kansas City, MO',
        'Overland Park and Johnson County, KS',
        'Kansas City, KS',
        'Independence and Lee\u2019s Summit, MO',
      ],
      contentCategories: [
        'Restaurants and bars',
        'Hotels and staycations',
        'Local events',
        'Shopping and resale',
      ],
      services: VARIANT_SERVICES[input.variant],
      audience,
      examples,
      examplesNote,
      // Deliberately empty until a partnership is actually delivered and evidenced.
      verifiedPartnerships: [],
      contactEmail: input.contactEmail ?? null,
      disclosure: DISCLOSURE,
      generatedAt: new Date().toISOString(),
    },
  };
}

/** Stable slug per variant so a pitch link stays valid as the kit is regenerated. */
export function mediaKitSlug(variant: MediaKitVariant): string {
  return variant === 'core' ? 'kellie' : `kellie-${variant}`;
}

/**
 * Writes or refreshes the kit row for a variant and returns its id.
 *
 * Creates an immutable version (migration 89). Same content hash reuses the
 * current version; content changes mint a new version so approvals stay pinned.
 */
export async function persistMediaKit(content: MediaKitContent): Promise<{
  id: string;
  slug: string;
  webUrl: string;
  versionId?: string;
  contentHash?: string;
  versionNumber?: number;
}> {
  // Re-entry through versioned path so every persist is approval-safe.
  const { persistVersionedMediaKit } = await import('./versions.js');
  const result = await persistVersionedMediaKit({
    variant: content.variant,
    contactEmail: content.contactEmail,
  });
  if (!result.ok) {
    throw new Error(result.missing.join(' '));
  }
  return {
    id: result.result.kitId,
    slug: result.result.slug,
    webUrl: result.result.webUrl,
    versionId: result.result.versionId,
    contentHash: result.result.contentHash,
    versionNumber: result.result.versionNumber,
  };
}

export function mediaKitWebUrl(slug: string): string {
  const base = process.env.PUBLIC_DASHBOARD_URL?.replace(/\/$/, '') ?? 'https://benson.kckellie.com';
  return `${base}/media-kit/${slug}`;
}

/** The kit a given business kind should receive. */
export function variantForBusinessKind(kind: string | null | undefined): MediaKitVariant {
  const value = (kind ?? '').toLowerCase();
  if (/hotel|lodging|resort|inn|stay/.test(value)) return 'hotel';
  if (/restaurant|dining|food|bar|cafe|brewery/.test(value)) return 'restaurant';
  if (/tourism|destination|dmo|visit|convention/.test(value)) return 'destination';
  return 'core';
}

/** Reads a persisted kit for rendering. */
export async function loadMediaKitBySlug(slug: string): Promise<{
  id: string;
  name: string;
  content: MediaKitContent;
  generatedAt: string | null;
} | null> {
  const rows = await db
    .select({
      id: mediaKits.id,
      name: mediaKits.name,
      analyticsSnapshot: mediaKits.analyticsSnapshot,
      generatedAt: mediaKits.generatedAt,
    })
    .from(mediaKits)
    .where(eq(mediaKits.webSlug, slug))
    .orderBy(desc(mediaKits.updatedAt))
    .limit(1);

  const row = rows[0];
  if (!row?.analyticsSnapshot) return null;
  return {
    id: row.id,
    name: row.name,
    content: row.analyticsSnapshot as unknown as MediaKitContent,
    generatedAt: row.generatedAt ? row.generatedAt.toISOString() : null,
  };
}
