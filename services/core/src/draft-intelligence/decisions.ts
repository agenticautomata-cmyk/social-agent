import { desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import {
  creatorDraftAssets,
  draftDecisions,
  type DraftAssetStatus,
  type DraftDecisionType,
} from '../schema.js';
import { appendDraftMemory } from './memory.js';

export async function recordDraftDecision(input: {
  draftAssetId: string;
  creatorId: string;
  decisionType: DraftDecisionType;
  decisionSummary: string;
  reason?: string | null;
  decidedBy?: string;
  scheduledFor?: Date | null;
  targetPlatforms?: string[];
  linkedPostPackageId?: string | null;
  newStatus?: DraftAssetStatus;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const [row] = await db
    .insert(draftDecisions)
    .values({
      draftAssetId: input.draftAssetId,
      creatorId: input.creatorId,
      decisionType: input.decisionType,
      decisionSummary: input.decisionSummary,
      reason: input.reason ?? null,
      decidedBy: input.decidedBy ?? 'creator',
      scheduledFor: input.scheduledFor ?? null,
      targetPlatformsJson: input.targetPlatforms ?? null,
      linkedPostPackageId: input.linkedPostPackageId ?? null,
      metadata: input.metadata ?? {},
    })
    .returning({ id: draftDecisions.id });

  const now = new Date();
  const statusPatch: Partial<typeof creatorDraftAssets.$inferInsert> = {
    decidedAt: now,
    updatedAt: now,
  };
  if (input.newStatus) statusPatch.status = input.newStatus;
  if (input.scheduledFor) statusPatch.status = input.newStatus ?? 'scheduled';

  await db
    .update(creatorDraftAssets)
    .set(statusPatch)
    .where(eq(creatorDraftAssets.id, input.draftAssetId));

  await appendDraftMemory({
    action: input.decisionType,
    draftAssetId: input.draftAssetId,
    summary: input.decisionSummary,
    via: input.decidedBy === 'benson' ? 'benson' : 'creator',
  });

  return row!.id;
}

export async function listDraftDecisions(draftAssetId: string) {
  return db
    .select()
    .from(draftDecisions)
    .where(eq(draftDecisions.draftAssetId, draftAssetId))
    .orderBy(desc(draftDecisions.createdAt));
}
