import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { tiktokHandoffEvents, tiktokPostPackages } from '../schema.js';
import { refreshPostingTimeAnalytics } from '../creator-analytics/posting-times.js';
import { env } from '../env.js';
import { generateOperatorJson } from './ai-helper.js';
import { linkRecommendationPackage } from './recommendations.js';
import { loadAccountBaselines } from './metrics.js';
import { resolveOperatorCreatorId } from './resolve-creator.js';
import type {
  PostPackageRow,
  PreparePackageInput,
  UpdatePostPackageInput,
} from './types.js';

function mapPackage(row: typeof tiktokPostPackages.$inferSelect): PostPackageRow {
  return {
    id: row.id,
    creatorId: row.creatorId,
    platform: row.platform,
    recommendationId: row.recommendationId,
    creatorVideoId: row.creatorVideoId,
    sourceVideoId: row.sourceVideoId,
    relatedContentItemId: row.relatedContentItemId,
    hook: row.hook,
    caption: row.caption,
    hashtags: row.hashtags ?? [],
    coverText: row.coverText,
    firstComment: row.firstComment,
    disclosureText: row.disclosureText,
    suggestedPostTime: row.suggestedPostTime?.toISOString() ?? null,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    sponsorAngle: row.sponsorAngle,
    contentTheme: row.contentTheme,
    formatLabel: row.formatLabel,
    reason: row.reason,
    checklist: (row.checklist as string[]) ?? [],
    shotList: (row.shotList as string[]) ?? [],
    cta: row.cta,
    locationBrandNotes: row.locationBrandNotes,
    status: row.status,
    mediaSourceType: row.mediaSourceType,
    mediaReferenceText: row.mediaReferenceText,
    temporaryAssetId: row.temporaryAssetId,
    handoffMethod: row.handoffMethod,
    handoffStatus: row.handoffStatus,
    handoffError: row.handoffError,
    handedOffAt: row.handedOffAt?.toISOString() ?? null,
    postedAt: row.postedAt?.toISOString() ?? null,
    postedUrl: row.postedUrl,
    metadata: row.metadata as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function defaultHashtags(theme?: string | null): string[] {
  const base = ['KansasCity', 'KC', 'kclife', 'tiktokkc'];
  if (theme) base.unshift(theme.replace(/\s+/g, ''));
  return [...new Set(base)].slice(0, 8);
}

function fallbackPackage(input: {
  title: string;
  theme?: string | null;
  reason?: string | null;
  sponsorAngle?: string | null;
  location?: string | null;
}): {
  hook: string;
  caption: string;
  hashtags: string[];
  coverText: string;
  firstComment: string;
  checklist: string[];
  shotList: string[];
  cta: string;
} {
  const hook = input.title.slice(0, 100);
  const caption = [
    hook,
    '',
    input.reason ?? 'Ready for TikTok — film on your phone and post when the window opens.',
    input.location ? `📍 ${input.location}` : null,
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 2200);

  return {
    hook,
    caption,
    hashtags: defaultHashtags(input.theme),
    coverText: hook.slice(0, 40),
    firstComment: 'Save this for your KC weekend plans ✨',
    checklist: [
      'Film vertical 9:16 on your phone',
      'Use natural light for product/location shots',
      'Paste caption from Benson before posting',
      'Add disclosure if sponsored',
    ],
    shotList: ['Hook on camera (3 sec)', 'B-roll of location/product', 'Price reveal or reaction', 'CTA close'],
    cta: 'Follow for more KC finds',
  };
}

async function suggestPostTimeIso(): Promise<string | null> {
  try {
    const creatorId = await resolveOperatorCreatorId();
    const posting = await refreshPostingTimeAnalytics({
      creatorId,
      platform: 'tiktok',
      demoMode: env.DEMO_MODE,
    });
    const slot = posting?.recommendedSlots?.[0];
    if (!slot) return null;
    const now = new Date();
    const target = new Date(now);
    target.setHours(slot.hour, slot.minute, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    return target.toISOString();
  } catch {
    return null;
  }
}

export async function listPostPackages(
  creatorId?: string,
  options?: { status?: string[]; limit?: number },
): Promise<PostPackageRow[]> {
  const cid = await resolveOperatorCreatorId(creatorId);
  const rows = await db
    .select()
    .from(tiktokPostPackages)
    .where(eq(tiktokPostPackages.creatorId, cid))
    .orderBy(desc(tiktokPostPackages.updatedAt))
    .limit(options?.limit ?? 30);
  return rows.map(mapPackage);
}

export async function getPostPackage(id: string): Promise<PostPackageRow | null> {
  const [row] = await db
    .select()
    .from(tiktokPostPackages)
    .where(eq(tiktokPostPackages.id, id))
    .limit(1);
  return row ? mapPackage(row) : null;
}

export async function preparePostPackage(
  input: PreparePackageInput,
  creatorId?: string,
): Promise<PostPackageRow> {
  const cid = await resolveOperatorCreatorId(creatorId);
  const baselines = await loadAccountBaselines();

  let sourceVideo = input.creatorVideoId
    ? baselines.videos.find((v) => v.id === input.creatorVideoId)
    : undefined;
  if (!sourceVideo && input.sequelOfVideoId) {
    sourceVideo = baselines.videos.find((v) => v.id === input.sequelOfVideoId);
  }

  const title =
    sourceVideo?.title ??
    sourceVideo?.caption?.slice(0, 80) ??
    input.contentTheme ??
    'New TikTok post';

  const fb = fallbackPackage({
    title,
    theme: input.contentTheme ?? sourceVideo?.contentCategory,
    reason: input.reason,
    sponsorAngle: sourceVideo?.sponsorTag,
    location: sourceVideo?.locationTag,
  });

  const ai = await generateOperatorJson<{
    hook?: string;
    caption?: string;
    hashtags?: string[];
    coverText?: string;
    firstComment?: string;
    disclosureText?: string;
    checklist?: string[];
    shotList?: string[];
    cta?: string;
    sponsorAngle?: string;
    formatLabel?: string;
    contentTheme?: string;
    reason?: string;
  }>(
    'You are Benson, a TikTok operator for Kansas City lifestyle creators. Return JSON for a TikTok post package: hook, caption, hashtags (array), coverText, firstComment, disclosureText (nullable), checklist (array), shotList (array), cta, sponsorAngle (nullable), formatLabel, contentTheme, reason. Keep caption under 400 chars.',
    {
      title,
      sourceVideo: sourceVideo
        ? {
            views: sourceVideo.views,
            performanceIndex: sourceVideo.performanceIndex,
            category: sourceVideo.contentCategory,
            location: sourceVideo.locationTag,
            caption: sourceVideo.caption,
          }
        : null,
      contentTheme: input.contentTheme,
      formatLabel: input.formatLabel,
      reason: input.reason,
      sequel: Boolean(input.sequelOfVideoId),
    },
    {},
  );

  const suggestedPostTime = await suggestPostTimeIso();
  const now = new Date();

  const [row] = await db
    .insert(tiktokPostPackages)
    .values({
      creatorId: cid,
      platform: 'tiktok',
      recommendationId: input.recommendationId ?? null,
      creatorVideoId: sourceVideo?.id ?? input.creatorVideoId ?? null,
      sourceVideoId: sourceVideo?.videoId ?? null,
      relatedContentItemId: input.relatedContentItemId ?? null,
      hook: ai.hook?.trim() || fb.hook,
      caption: ai.caption?.trim() || fb.caption,
      hashtags: ai.hashtags?.length ? ai.hashtags : fb.hashtags,
      coverText: ai.coverText?.trim() || fb.coverText,
      firstComment: ai.firstComment?.trim() || fb.firstComment,
      disclosureText: ai.disclosureText?.trim() || null,
      suggestedPostTime: suggestedPostTime ? new Date(suggestedPostTime) : null,
      sponsorAngle: ai.sponsorAngle?.trim() || sourceVideo?.sponsorTag || null,
      contentTheme: ai.contentTheme?.trim() || input.contentTheme || sourceVideo?.contentCategory || undefined,
      formatLabel: ai.formatLabel?.trim() || input.formatLabel || 'operator_package',
      reason:
        ai.reason?.trim() ||
        input.reason ||
        'Prepared by Benson for manual TikTok handoff.',
      checklist: ai.checklist?.length ? ai.checklist : fb.checklist,
      shotList: ai.shotList?.length ? ai.shotList : fb.shotList,
      cta: ai.cta?.trim() || fb.cta,
      locationBrandNotes: sourceVideo?.locationTag ?? null,
      status: 'ready',
      handoffMethod: 'manual',
      handoffStatus: 'ready',
      metadata: { preparedAt: now.toISOString(), replyInsightId: input.replyInsightId ?? null },
      updatedAt: now,
    })
    .returning();

  if (input.recommendationId) {
    await linkRecommendationPackage(input.recommendationId, row!.id);
  }

  return mapPackage(row!);
}

export async function updatePostPackage(
  id: string,
  patch: UpdatePostPackageInput,
): Promise<PostPackageRow | null> {
  const [row] = await db
    .update(tiktokPostPackages)
    .set({
      ...patch,
      suggestedPostTime: patch.suggestedPostTime ? new Date(patch.suggestedPostTime) : undefined,
      scheduledAt: patch.scheduledAt ? new Date(patch.scheduledAt) : undefined,
      updatedAt: new Date(),
    })
    .where(eq(tiktokPostPackages.id, id))
    .returning();
  return row ? mapPackage(row) : null;
}

export async function markPackageHandedOff(id: string): Promise<PostPackageRow | null> {
  const now = new Date();
  const [row] = await db
    .update(tiktokPostPackages)
    .set({
      status: 'handed_off',
      handoffStatus: 'handed_off',
      handedOffAt: now,
      updatedAt: now,
    })
    .where(eq(tiktokPostPackages.id, id))
    .returning();

  if (row) {
    await db.insert(tiktokHandoffEvents).values({
      creatorId: row.creatorId,
      postPackageId: row.id,
      handoffMethod: row.handoffMethod,
      handoffStatus: 'handed_off',
      metadata: { manual: true },
    });
  }
  return row ? mapPackage(row) : null;
}

export async function markPackagePosted(
  id: string,
  postedUrl?: string | null,
): Promise<PostPackageRow | null> {
  const now = new Date();
  const [row] = await db
    .update(tiktokPostPackages)
    .set({
      status: 'posted_confirmed',
      handoffStatus: 'posted',
      postedAt: now,
      postedUrl: postedUrl ?? null,
      updatedAt: now,
    })
    .where(eq(tiktokPostPackages.id, id))
    .returning();
  return row ? mapPackage(row) : null;
}

export async function schedulePackageReminder(
  id: string,
  scheduledAt: string,
): Promise<PostPackageRow | null> {
  const [row] = await db
    .update(tiktokPostPackages)
    .set({
      scheduledAt: new Date(scheduledAt),
      status: 'scheduled',
      updatedAt: new Date(),
    })
    .where(eq(tiktokPostPackages.id, id))
    .returning();
  return row ? mapPackage(row) : null;
}

export function formatPackageForClipboard(pkg: PostPackageRow): string {
  const tags = pkg.hashtags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ');
  return [
    '--- HOOK ---',
    pkg.hook ?? '',
    '',
    '--- CAPTION ---',
    pkg.caption,
    '',
    '--- HASHTAGS ---',
    tags,
    '',
    '--- COVER TEXT ---',
    pkg.coverText ?? '',
    '',
    '--- FIRST COMMENT ---',
    pkg.firstComment ?? '',
    pkg.disclosureText ? `\n--- DISCLOSURE ---\n${pkg.disclosureText}` : '',
    pkg.suggestedPostTime ? `\n--- SUGGESTED TIME ---\n${pkg.suggestedPostTime}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function listReadyPackages(creatorId?: string): Promise<PostPackageRow[]> {
  const cid = await resolveOperatorCreatorId(creatorId);
  const rows = await db
    .select()
    .from(tiktokPostPackages)
    .where(
      and(
        eq(tiktokPostPackages.creatorId, cid),
        eq(tiktokPostPackages.status, 'ready'),
      ),
    )
    .orderBy(desc(tiktokPostPackages.updatedAt))
    .limit(10);
  return rows.map(mapPackage);
}
