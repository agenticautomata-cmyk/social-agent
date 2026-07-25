import { eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { creatorPreferences } from '../schema.js';

const GLOBAL_ID = 'global';

export type DraftMemoryEntry = {
  at: string;
  action: string;
  draftAssetId: string;
  summary: string;
  via: 'creator' | 'benson' | 'system';
};

export async function appendDraftMemory(input: {
  action: string;
  draftAssetId: string;
  summary: string;
  via: DraftMemoryEntry['via'];
}): Promise<void> {
  await db
    .insert(creatorPreferences)
    .values({ id: GLOBAL_ID })
    .onConflictDoNothing();

  const entry: DraftMemoryEntry = {
    at: new Date().toISOString(),
    action: input.action,
    draftAssetId: input.draftAssetId,
    summary: input.summary,
    via: input.via,
  };

  await db
    .update(creatorPreferences)
    .set({
      preferenceLog: sql`(${creatorPreferences.preferenceLog} || ${JSON.stringify([entry])}::jsonb)`,
      updatedAt: new Date(),
    })
    .where(eq(creatorPreferences.id, GLOBAL_ID));
}

export async function getRecentDraftMemories(limit = 12): Promise<DraftMemoryEntry[]> {
  const [row] = await db
    .select({ preferenceLog: creatorPreferences.preferenceLog })
    .from(creatorPreferences)
    .where(eq(creatorPreferences.id, GLOBAL_ID))
    .limit(1);

  const log = (row?.preferenceLog as DraftMemoryEntry[] | null) ?? [];
  return log
    .filter((e) => e.draftAssetId)
    .slice(-limit)
    .reverse();
}
