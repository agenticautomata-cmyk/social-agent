import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { openingLocations, openingStatusTransitions } from '../schema.js';
import { shouldRecordStatusTransition } from './lifecycle.js';
import type { OpeningLifecycleStatus } from './types.js';

export async function dismissOpening(id: string, reason?: string): Promise<boolean> {
  const [row] = await db
    .update(openingLocations)
    .set({
      dismissedAt: new Date(),
      dismissReason: reason ?? 'dismissed',
      updatedAt: new Date(),
    })
    .where(eq(openingLocations.id, id))
    .returning({ id: openingLocations.id });
  return Boolean(row);
}

export async function markOpeningStatus(
  id: string,
  status: OpeningLifecycleStatus,
  evidence?: string,
): Promise<boolean> {
  const existing = await db.query.openingLocations.findFirst({
    where: eq(openingLocations.id, id),
  });
  if (!existing) return false;

  const human = { ...(existing.humanEditedFields as Record<string, unknown>), status: true };

  if (shouldRecordStatusTransition(existing.status as OpeningLifecycleStatus, status)) {
    await db.insert(openingStatusTransitions).values({
      locationId: id,
      fromStatus: existing.status,
      toStatus: status,
      evidence: evidence ?? `manual:${status}`,
      source: 'human',
    });
  }

  await db
    .update(openingLocations)
    .set({
      status,
      actualOpeningDate: status === 'open' ? new Date().toISOString().slice(0, 10) : existing.actualOpeningDate,
      humanEditedFields: human,
      lastConfirmedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(openingLocations.id, id));

  return true;
}

export async function mergeOpeningLocations(input: {
  keepId: string;
  mergeId: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (input.keepId === input.mergeId) return { ok: false, error: 'same_id' };
  const keep = await db.query.openingLocations.findFirst({
    where: eq(openingLocations.id, input.keepId),
  });
  const merge = await db.query.openingLocations.findFirst({
    where: eq(openingLocations.id, input.mergeId),
  });
  if (!keep || !merge) return { ok: false, error: 'not_found' };

  const meta = {
    ...(keep.metadata as Record<string, unknown>),
    mergedFrom: [
      ...((keep.metadata as { mergedFrom?: string[] })?.mergedFrom ?? []),
      input.mergeId,
    ],
  };

  await db
    .update(openingLocations)
    .set({
      opportunityContentItemId: keep.opportunityContentItemId ?? merge.opportunityContentItemId,
      calendarItemId: keep.calendarItemId ?? merge.calendarItemId,
      metadata: meta,
      lastConfirmedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(openingLocations.id, input.keepId));

  await db
    .update(openingLocations)
    .set({
      dismissedAt: new Date(),
      dismissReason: `merged_into:${input.keepId}`,
      updatedAt: new Date(),
    })
    .where(eq(openingLocations.id, input.mergeId));

  return { ok: true };
}
