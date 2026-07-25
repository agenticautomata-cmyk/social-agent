import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import {
  creatorDraftAssets,
  shareIntakeSubmissions,
} from '../schema.js';
import { resolveOperatorCreatorId } from '../tiktok-operator/resolve-creator.js';
import { humanIntakeTitle } from './display-title.js';

export async function createDraftFromShareIntake(intakeId: string): Promise<string | null> {
  const intake = await db.query.shareIntakeSubmissions.findFirst({
    where: eq(shareIntakeSubmissions.id, intakeId),
  });
  if (!intake) return null;

  const existing = await db.query.creatorDraftAssets.findFirst({
    where: eq(creatorDraftAssets.shareIntakeId, intakeId),
  });
  if (existing) return existing.id;

  const creatorId = intake.creatorId ?? (await resolveOperatorCreatorId().catch(() => null));
  if (!creatorId) return null;

  const sourceType =
    intake.intakeType === 'video'
      ? 'video'
      : intake.intakeType === 'audio'
        ? 'audio'
        : intake.intakeType === 'image'
          ? 'screenshot'
          : intake.rawText || intake.notes
            ? 'transcript'
            : 'mixed';

  const title =
    humanIntakeTitle({
      extractedTitle: intake.extractedTitle,
      hookSummary: intake.hookSummary,
      aiSummary: intake.aiSummary,
      intakeType: intake.intakeType,
      captionSuggestionsJson: intake.captionSuggestionsJson,
    }) ?? 'Unposted draft';

  const [row] = await db
    .insert(creatorDraftAssets)
    .values({
      creatorId,
      sourceChannel: 'share_to_benson',
      sourceType,
      shareIntakeId: intakeId,
      originalFilename: intake.originalFilename,
      mimeType: intake.mimeType,
      fileSize: intake.fileSize,
      durationSeconds: intake.durationSeconds,
      tempFilePath: intake.tempFilePath,
      draftTitle: title,
      userNote: intake.notes,
      rawCaptionOrText: intake.rawText,
      status: 'received',
      metadata: { shareChannel: 'share_to_benson', intakeType: intake.intakeType },
    })
    .returning({ id: creatorDraftAssets.id });

  return row?.id ?? null;
}

export async function createDraftFromText(input: {
  creatorId?: string;
  text: string;
  title?: string;
  userNote?: string;
  sourceChannel?: 'share_to_benson' | 'telegram' | 'manual_upload' | 'transcript_paste' | 'future_tiktok_api';
}): Promise<string> {
  const creatorId = input.creatorId ?? (await resolveOperatorCreatorId());
  const [row] = await db
    .insert(creatorDraftAssets)
    .values({
      creatorId,
      sourceChannel: input.sourceChannel ?? 'transcript_paste',
      sourceType: 'transcript',
      draftTitle: input.title ?? input.text.slice(0, 80),
      userNote: input.userNote ?? null,
      rawCaptionOrText: input.text,
      transcriptText: input.text,
      contextLimitations:
        'Benson only has caption/transcript text — no video or audio to watch.',
      status: 'received',
    })
    .returning({ id: creatorDraftAssets.id });

  return row!.id;
}

export async function queueDraftProcessing(draftId: string): Promise<void> {
  await db
    .update(creatorDraftAssets)
    .set({
      status: 'processing',
      processingError: null,
      updatedAt: new Date(),
    })
    .where(eq(creatorDraftAssets.id, draftId));
}
