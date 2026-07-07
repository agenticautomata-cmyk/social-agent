import { desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { creatorFormatTemplates, tiktokPostPackages } from '../schema.js';
import { generateOperatorJson } from './ai-helper.js';
import { loadAccountBaselines } from './metrics.js';
import { preparePostPackage } from './packages.js';
import { resolveOperatorCreatorId } from './resolve-creator.js';
import type { FormatTemplateRow } from './types.js';

function mapTemplate(row: typeof creatorFormatTemplates.$inferSelect): FormatTemplateRow {
  return {
    id: row.id,
    creatorId: row.creatorId,
    formatName: row.formatName,
    structure: row.structure,
    idealLength: row.idealLength,
    openingHookStyle: row.openingHookStyle,
    shotPattern: (row.shotPattern as string[]) ?? [],
    bestContentCategories: (row.bestContentCategories as string[]) ?? [],
    proofVideoIds: (row.proofVideoIds as string[]) ?? [],
    avgPerformanceIndex: row.avgPerformanceIndex != null ? Number(row.avgPerformanceIndex) : null,
    whenToUse: row.whenToUse,
    metadata: row.metadata as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listFormatTemplates(creatorId?: string): Promise<FormatTemplateRow[]> {
  const cid = await resolveOperatorCreatorId(creatorId);
  const rows = await db
    .select()
    .from(creatorFormatTemplates)
    .where(eq(creatorFormatTemplates.creatorId, cid))
    .orderBy(desc(creatorFormatTemplates.updatedAt))
    .limit(20);
  return rows.map(mapTemplate);
}

export async function createSequelPackage(
  creatorVideoId: string,
  recommendationId?: string,
  creatorId?: string,
) {
  const baselines = await loadAccountBaselines();
  const video = baselines.videos.find((v) => v.id === creatorVideoId);
  if (!video) throw new Error('Video not found');

  const ai = await generateOperatorJson<{
    sequelConcept?: string;
    hookOptions?: string[];
    talkingPoints?: string[];
    shotList?: string[];
    whatToReuse?: string;
    whatToChange?: string;
    sponsorAngle?: string;
  }>(
    'Generate a TikTok sequel plan. Return JSON: sequelConcept, hookOptions (array), talkingPoints (array), shotList (array), whatToReuse, whatToChange, sponsorAngle (nullable).',
    {
      original: {
        title: video.title,
        caption: video.caption,
        category: video.contentCategory,
        location: video.locationTag,
        performanceIndex: video.performanceIndex,
      },
    },
    {
      sequelConcept: `Part 2 of your ${video.contentCategory?.replace(/_/g, ' ') ?? 'hit video'}`,
      hookOptions: [`You asked for part 2 — here it is`, `The sequel you wanted`],
      talkingPoints: ['Reference the original hit', 'Deliver new value', 'Strong CTA'],
      shotList: ['Callback to original', 'New footage', 'Reaction/outro'],
      whatToReuse: 'Same location vibe and pacing',
      whatToChange: 'Fresh hook and new discovery',
    },
  );

  const pkg = await preparePostPackage(
    {
      recommendationId,
      sequelOfVideoId: creatorVideoId,
      creatorVideoId,
      contentTheme: video.contentCategory ?? undefined,
      formatLabel: 'sequel',
      reason: ai.sequelConcept ?? 'Sequel to an outperforming TikTok',
    },
    creatorId,
  );

  await updatePostPackageMetadata(pkg.id, {
    sequelPlan: ai,
    hookOptions: ai.hookOptions,
    talkingPoints: ai.talkingPoints,
    whatToReuse: ai.whatToReuse,
    whatToChange: ai.whatToChange,
  });

  return pkg;
}

export async function createRepostRemixPackage(
  creatorVideoId: string,
  recommendationId?: string,
  creatorId?: string,
) {
  const baselines = await loadAccountBaselines();
  const video = baselines.videos.find((v) => v.id === creatorVideoId);
  if (!video) throw new Error('Video not found');

  const ai = await generateOperatorJson<{
    recycleConcept?: string;
    hookOptions?: string[];
    whatToChange?: string[];
    whatToKeep?: string[];
    captionAngle?: string;
    soundNote?: string;
  }>(
    'Plan a TikTok content recycle/repost. Same core story, fresh packaging. Return JSON: recycleConcept, hookOptions (array), whatToChange (array — hook, caption, cover text, sound, opening shot), whatToKeep (array), captionAngle, soundNote.',
    {
      original: {
        title: video.title,
        caption: video.caption,
        category: video.contentCategory,
        location: video.locationTag,
        performanceIndex: video.performanceIndex,
        publishedAt: video.publishedAt,
      },
    },
    {
      recycleConcept: `Fresh cut of your ${video.contentCategory?.replace(/_/g, ' ') ?? 'hit'} — new hook and sound`,
      hookOptions: ['Stop scrolling — updated take on this KC spot', 'You loved this one — here it is with a new twist'],
      whatToChange: ['Opening hook', 'On-screen cover text', 'Caption CTA', 'Trending sound'],
      whatToKeep: ['Core location/story', 'Best b-roll beats', 'Pacing that already worked'],
      captionAngle: 'Call out what is new since the original post',
      soundNote: 'Pick a current trending sound that matches the vibe',
    },
  );

  const pkg = await preparePostPackage(
    {
      recommendationId,
      creatorVideoId,
      contentTheme: video.contentCategory ?? undefined,
      formatLabel: 'repost_or_remix',
      reason: ai.recycleConcept ?? 'Recycle an outperforming TikTok with fresh packaging',
    },
    creatorId,
  );

  await updatePostPackageMetadata(pkg.id, {
    recyclePlan: ai,
    hookOptions: ai.hookOptions,
    whatToChange: ai.whatToChange,
    whatToKeep: ai.whatToKeep,
    captionAngle: ai.captionAngle,
    soundNote: ai.soundNote,
    shotList: [
      'New hook in first 2 seconds',
      'Reuse strongest b-roll with new cover text',
      'Updated caption + trending sound',
    ],
  });

  return pkg;
}

async function updatePostPackageMetadata(id: string, extra: Record<string, unknown>) {
  const [row] = await db.select().from(tiktokPostPackages).where(eq(tiktokPostPackages.id, id)).limit(1);
  if (!row) return;
  await db
    .update(tiktokPostPackages)
    .set({
      metadata: { ...(row.metadata as Record<string, unknown>), ...extra },
      shotList: Array.isArray(extra.shotList) ? (extra.shotList as string[]) : (row.shotList as string[]),
      updatedAt: new Date(),
    })
    .where(eq(tiktokPostPackages.id, id));
}

export async function createRepeatFormatTemplate(
  creatorVideoId: string,
  creatorId?: string,
): Promise<FormatTemplateRow> {
  const cid = await resolveOperatorCreatorId(creatorId);
  const baselines = await loadAccountBaselines();
  const video = baselines.videos.find((v) => v.id === creatorVideoId);
  if (!video) throw new Error('Video not found');

  const formatName = `${video.contentPillar ?? video.contentCategory ?? 'winning'} format`;
  const ai = await generateOperatorJson<{
    structure?: string;
    idealLength?: string;
    openingHookStyle?: string;
    shotPattern?: string[];
    whenToUse?: string;
  }>(
    'Create a reusable TikTok format template from a winning video. Return JSON: structure, idealLength, openingHookStyle, shotPattern (array), whenToUse.',
    { video: { category: video.contentCategory, pillar: video.contentPillar, performanceIndex: video.performanceIndex } },
    {
      structure: 'Hook → context → reveal → CTA',
      idealLength: '30-60 sec',
      openingHookStyle: 'Direct question or price tease',
      shotPattern: ['Talking head', 'Product/location b-roll', 'Reaction'],
      whenToUse: 'When you have a strong location or deal to feature',
    },
  );

  const [row] = await db
    .insert(creatorFormatTemplates)
    .values({
      creatorId: cid,
      formatName,
      structure: ai.structure ?? '',
      idealLength: ai.idealLength ?? null,
      openingHookStyle: ai.openingHookStyle ?? null,
      shotPattern: ai.shotPattern ?? [],
      bestContentCategories: video.contentCategory ? [video.contentCategory] : [],
      proofVideoIds: [video.id],
      avgPerformanceIndex: String(video.performanceIndex),
      whenToUse: ai.whenToUse ?? null,
      metadata: { sourceVideoId: video.videoId },
    })
    .returning();

  return mapTemplate(row!);
}
