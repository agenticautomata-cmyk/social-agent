import { asc, eq, inArray } from 'drizzle-orm';
import { db, env, shareIntakeSubmissions, creatorDraftAssets } from '@social-agent/core';
import { createCronWorker } from '../runtime.js';
import { processShareIntakeMedia } from '@social-agent/core/intake';

async function claimNextMediaIntake(): Promise<string | null> {
  const rows = await db
    .select({ id: shareIntakeSubmissions.id })
    .from(shareIntakeSubmissions)
    .where(inArray(shareIntakeSubmissions.processingStatus, ['received', 'queued']))
    .orderBy(asc(shareIntakeSubmissions.submittedAt))
    .limit(5);

  for (const candidate of rows) {
    const draft = await db.query.creatorDraftAssets.findFirst({
      where: eq(creatorDraftAssets.shareIntakeId, candidate.id),
    });
    if (draft) {
      await db
        .update(shareIntakeSubmissions)
        .set({
          processingStatus: 'ready',
          reviewStatus: 'pending_ai',
          aiSummary: 'Benson is reading this draft in Draft Intelligence…',
          updatedAt: new Date(),
        })
        .where(eq(shareIntakeSubmissions.id, candidate.id));
      continue;
    }
    const [claimed] = await db
      .update(shareIntakeSubmissions)
      .set({ processingStatus: 'queued', updatedAt: new Date() })
      .where(eq(shareIntakeSubmissions.id, candidate.id))
      .returning({ id: shareIntakeSubmissions.id });
    if (claimed) return claimed.id;
  }
  return null;
}

export const shareIntakeMediaWorker = createCronWorker({
  name: 'share-intake-media',
  intervalMs: env.INTAKE_MEDIA_WORKER_MS,
  initialDelayMs: 4000,
  run: async () => {
    const intakeId = await claimNextMediaIntake();
    if (!intakeId) return { processed: 0 };
    await processShareIntakeMedia(intakeId);
    return { processed: 1, intakeId };
  },
});
