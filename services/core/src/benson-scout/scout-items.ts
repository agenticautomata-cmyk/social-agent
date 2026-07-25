import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { scoutItems } from '../schema.js';

export async function upsertScoutItemFromSignal(input: {
  watcherId: string;
  itemUrl: string;
  captionText?: string | null;
  itemType?: string;
  contentHash: string;
  linkedEarlySignalId?: string | null;
  creatorValueStatus?: string;
}): Promise<{ created: boolean; scoutItemId: string }> {
  const fingerprint = createHash('sha256')
    .update(`${input.watcherId}:${input.contentHash}`)
    .digest('hex')
    .slice(0, 32);

  const [existing] = await db
    .select({ id: scoutItems.id })
    .from(scoutItems)
    .where(eq(scoutItems.occurrenceFingerprint, fingerprint))
    .limit(1);

  if (existing) {
    if (input.linkedEarlySignalId) {
      await db
        .update(scoutItems)
        .set({
          linkedEarlySignalId: input.linkedEarlySignalId,
          updatedAt: new Date(),
        })
        .where(eq(scoutItems.id, existing.id));
    }
    return { created: false, scoutItemId: existing.id };
  }

  const [row] = await db
    .insert(scoutItems)
    .values({
      watcherId: input.watcherId,
      itemUrl: input.itemUrl,
      captionText: input.captionText ?? null,
      itemType: input.itemType ?? 'signal',
      contentHash: input.contentHash,
      occurrenceFingerprint: fingerprint,
      linkedEarlySignalId: input.linkedEarlySignalId ?? null,
      creatorValueStatus: input.creatorValueStatus ?? 'pending',
    })
    .returning({ id: scoutItems.id });

  return { created: true, scoutItemId: row!.id };
}
