import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { shareIntakeSubmissions, tiktokPostPackages, plannerItems } from '../schema.js';
import { upsertPlannerItem } from '../content-planner/items.js';
import { resolveOperatorCreatorId } from '../tiktok-operator/resolve-creator.js';
import { promoteIntakeToContentItem } from './promote.js';

export async function createPostPackageFromIntake(intakeId: string): Promise<string | null> {
  const intake = await db.query.shareIntakeSubmissions.findFirst({
    where: eq(shareIntakeSubmissions.id, intakeId),
  });
  if (!intake || intake.processingStatus !== 'ready') return null;
  if (intake.linkedPostPackageId) return intake.linkedPostPackageId;

  const creatorId =
    intake.creatorId ?? (await resolveOperatorCreatorId().catch(() => null));
  if (!creatorId) return null;

  const meta = intake.clientMetadata as Record<string, unknown>;
  const captions = (intake.captionSuggestionsJson as Array<{ text?: string }> | null) ?? [];
  const hashtags = (intake.hashtagSuggestionsJson as string[] | null) ?? [];
  const coverOptions = (meta.coverTextOptions as string[] | undefined) ?? [];
  const firstComments = (meta.firstCommentOptions as string[] | undefined) ?? [];
  const primaryCaption = (meta.primaryCaption as string | undefined) ?? captions[0]?.text ?? '';

  const [pkg] = await db
    .insert(tiktokPostPackages)
    .values({
      creatorId,
      platform: 'tiktok',
      hook: intake.hookSummary ?? intake.extractedTitle,
      caption: primaryCaption,
      hashtags: hashtags.length ? hashtags : ['KansasCity', 'KC', 'kclife'],
      coverText: coverOptions[0] ?? intake.hookSummary?.slice(0, 40) ?? null,
      firstComment: firstComments[0] ?? null,
      sponsorAngle: intake.sponsorRelevance,
      contentTheme: intake.contentTheme ?? intake.extractedCategory,
      formatLabel: 'share_intake_video',
      reason:
        (meta.plannerRecommendation as string | undefined) ??
        'Prepared from a video you shared to Benson.',
      checklist: [
        'Review Benson transcript summary',
        'Film or trim vertical clip on your phone',
        'Paste caption + hashtags before posting',
      ],
      shotList: Array.isArray(intake.keyMomentsJson)
        ? (intake.keyMomentsJson as Array<{ label?: string }>).map((m) => m.label ?? '').filter(Boolean)
        : [],
      cta: 'Follow for more KC finds',
      locationBrandNotes:
        Array.isArray(intake.detectedLocationsJson) && intake.detectedLocationsJson.length
          ? (intake.detectedLocationsJson as string[]).join(', ')
          : intake.extractedLocation,
      status: 'ready',
      handoffMethod: 'manual',
      handoffStatus: 'ready',
      metadata: {
        shareIntakeId: intake.id,
        transcriptPreview: intake.transcriptText?.slice(0, 500) ?? null,
        followUpIdeas: intake.followUpIdeasJson,
      },
    })
    .returning({ id: tiktokPostPackages.id });

  if (!pkg) return null;

  await db
    .update(shareIntakeSubmissions)
    .set({ linkedPostPackageId: pkg.id, updatedAt: new Date() })
    .where(eq(shareIntakeSubmissions.id, intakeId));

  return pkg.id;
}

export async function addIntakeToPlanner(intakeId: string, reviewedBy: string): Promise<string | null> {
  const intake = await db.query.shareIntakeSubmissions.findFirst({
    where: eq(shareIntakeSubmissions.id, intakeId),
  });
  if (!intake) return null;

  let contentItemId = intake.promotedContentItemId;
  if (!contentItemId) {
    const promoted = await promoteIntakeToContentItem(intake, reviewedBy);
    if (!promoted.ok) return null;
    contentItemId = promoted.contentItemId;
  }

  const meta = intake.clientMetadata as Record<string, unknown>;
  const captions = (intake.captionSuggestionsJson as Array<{ text?: string }> | null) ?? [];
  const primaryCaption = (meta.primaryCaption as string | undefined) ?? captions[0]?.text ?? null;

  await upsertPlannerItem(contentItemId, {
    action: 'plan_this_week',
    notes: intake.aiSummary ?? undefined,
    contentAngle: intake.contentTheme ?? intake.extractedCategory ?? undefined,
    draftCaption: primaryCaption ?? undefined,
  });

  const [plannerRow] = await db
    .select({ id: plannerItems.id })
    .from(plannerItems)
    .where(eq(plannerItems.contentItemId, contentItemId))
    .limit(1);

  if (!plannerRow) return null;

  await db
    .update(shareIntakeSubmissions)
    .set({ linkedPlannerItemId: plannerRow.id, updatedAt: new Date() })
    .where(eq(shareIntakeSubmissions.id, intakeId));

  return plannerRow.id;
}

export async function archiveShareIntake(
  intakeId: string,
  reviewedBy: string,
): Promise<boolean> {
  const [updated] = await db
    .update(shareIntakeSubmissions)
    .set({
      reviewStatus: 'rejected',
      rejectionReason: 'archived',
      reviewedBy,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(shareIntakeSubmissions.id, intakeId))
    .returning({ id: shareIntakeSubmissions.id });
  return Boolean(updated);
}
