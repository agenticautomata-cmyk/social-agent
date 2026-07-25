import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { bensonRecommendationEvents } from '../schema.js';
import type { RecommendationSource, UserRecommendationResponse } from './types.js';

export type RecordRecommendationInput = {
  source: RecommendationSource;
  contentItemId?: string | null;
  plannerItemId?: string | null;
  operatorRecommendationId?: string | null;
  confidence?: number | null;
  rationale?: string | null;
  category?: string | null;
  metadata?: Record<string, unknown>;
};

export async function recordRecommendationEvent(input: RecordRecommendationInput) {
  const [row] = await db
    .insert(bensonRecommendationEvents)
    .values({
      source: input.source,
      contentItemId: input.contentItemId ?? null,
      plannerItemId: input.plannerItemId ?? null,
      operatorRecommendationId: input.operatorRecommendationId ?? null,
      confidence: input.confidence != null ? String(input.confidence) : null,
      rationale: input.rationale ?? null,
      category: input.category ?? null,
      metadata: input.metadata ?? {},
    })
    .returning();
  if (!row) throw new Error('Failed to record recommendation event');
  return row;
}

export async function recordRecommendationResponse(
  eventId: string,
  response: UserRecommendationResponse,
  reason?: string | null,
) {
  const now = new Date();
  const [row] = await db
    .update(bensonRecommendationEvents)
    .set({
      userResponse: response,
      responseReason: reason ?? null,
      respondedAt: now,
      updatedAt: now,
    })
    .where(eq(bensonRecommendationEvents.id, eventId))
    .returning();
  return row ?? null;
}

export async function linkRecommendationToOutcome(eventId: string, outcomeLinkId: string) {
  await db
    .update(bensonRecommendationEvents)
    .set({ outcomeLinkId, updatedAt: new Date() })
    .where(eq(bensonRecommendationEvents.id, eventId));
}

export async function linkRecommendationToShoot(eventId: string, shootSessionId: string) {
  await db
    .update(bensonRecommendationEvents)
    .set({ shootSessionId, updatedAt: new Date() })
    .where(eq(bensonRecommendationEvents.id, eventId));
}
