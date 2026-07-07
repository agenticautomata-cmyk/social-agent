// Benson opportunity scoring — KC_SCORING_MODEL v1 (lightweight implementation).
// Scores ingested opportunities on six 0-100 dimensions via OpenAI, stores the
// structured result in content_items.metadata.bensonScore for future ranking,
// and syncs relevance_score with the composite.

import { and, desc, eq, inArray, gte, isNotNull, sql } from 'drizzle-orm';
import OpenAI from 'openai';
import { z } from 'zod';
import { db } from '../db.js';
import { contentItems } from '../schema.js';
import { env } from '../env.js';
import { getCreatorPreferences } from '../creator-preferences/index.js';
import { getLatestLearnings } from '../benson-learning/index.js';

export const BENSON_SCORE_VERSION = 'v1';
const SCORE_MODEL = env.BENSON_ASK_MODEL;
const BATCH_SIZE = 12;

const ItemScoreSchema = z.object({
  id: z.string(),
  visualAppeal: z.number().min(0).max(100),
  uniqueness: z.number().min(0).max(100),
  affordability: z.number().min(0).max(100),
  localInterest: z.number().min(0).max(100),
  worldCupRelevance: z.number().min(0).max(100),
  socialMediaPotential: z.number().min(0).max(100),
  composite: z.number().min(0).max(100),
  rationale: z.string(),
});

const BatchSchema = z.object({
  scores: z.array(ItemScoreSchema),
});

export type BensonScore = Omit<z.infer<typeof ItemScoreSchema>, 'id'> & {
  version: string;
  scoredAt: string;
};

export type ScoreRunResult = {
  scanned: number;
  scored: number;
  batches: number;
  errors: number;
};

type ScorableItem = {
  id: string;
  topic: string;
  script: string | null;
  locationName: string | null;
  eventStartsAt: Date | null;
  metadata: Record<string, unknown>;
};

async function loadUnscoredItems(limit: number): Promise<ScorableItem[]> {
  const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      id: contentItems.id,
      topic: contentItems.topic,
      script: contentItems.script,
      locationName: contentItems.locationName,
      eventStartsAt: contentItems.eventStartsAt,
      metadata: contentItems.metadata,
    })
    .from(contentItems)
    .where(
      and(
        isNotNull(contentItems.sourceId),
        sql`${contentItems.state} = 'planned'`,
        sql`${contentItems.metadata}->>'ingest' IS NOT NULL`,
        sql`${contentItems.metadata}->'bensonScore' IS NULL`,
        sql`(${contentItems.eventStartsAt} IS NULL OR ${contentItems.eventStartsAt} >= NOW() - INTERVAL '1 day')`,
        gte(contentItems.createdAt, cutoff),
      ),
    )
    .orderBy(desc(contentItems.createdAt))
    .limit(limit);

  return rows.map((r) => ({ ...r, metadata: (r.metadata ?? {}) as Record<string, unknown> }));
}

async function scoreBatch(items: ScorableItem[]): Promise<Map<string, BensonScore>> {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required for opportunity scoring');

  const [preferences, learnings] = await Promise.all([
    getCreatorPreferences().catch(() => null),
    getLatestLearnings().catch(() => null),
  ]);

  const learningBlock = learnings
    ? `\n\nLearned operator memory (apply when scoring):\n${learnings.summary}\n${learnings.insights
        .slice(0, 6)
        .map((i) => `- [${i.confidence}] ${i.insight}`)
        .join('\n')}`
    : '';

  const excludedBlock =
    preferences && preferences.excludedCategories.length > 0
      ? `\n\nNever prioritize these excluded categories: ${preferences.excludedCategories.join(', ')}`
      : '';

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const payload = items.map((item) => ({
    id: item.id,
    title: item.topic,
    summary: item.script?.slice(0, 400) ?? null,
    category: (item.metadata.opportunityCategory as string) ?? null,
    location: item.locationName,
    eventDate: item.eventStartsAt?.toISOString() ?? null,
  }));

  const response = await client.chat.completions.create({
    model: SCORE_MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_tokens: 2400,
    messages: [
      {
        role: 'system',
        content: `You are Benson, a Kansas City content strategist scoring opportunities for a local TikTok creator (Kellie — KC lifestyle, food, events, hidden gems).

Score EVERY item on six 0-100 dimensions:
- visualAppeal: how filmable/photogenic for short-form video
- uniqueness: novel vs generic recurring content
- affordability: free/cheap for her audience scores high
- localInterest: KC-metro specificity and community pull
- worldCupRelevance: ties to KC 2026 World Cup buzz (0 if none)
- socialMediaPotential: hook strength, shareability, FOMO

composite = weighted: visual 0.25, uniqueness 0.20, social 0.25, local 0.20, affordability 0.05, worldCup 0.05.
rationale: ONE concrete sentence naming the deciding factors (e.g. "World Cup tie-in, free venue, strong filmability") — no marketing fluff.

Respond with strict JSON: { "scores": [ { "id", "visualAppeal", "uniqueness", "affordability", "localInterest", "worldCupRelevance", "socialMediaPotential", "composite", "rationale" } ] }
Include every input id exactly once.${excludedBlock}${learningBlock}`,
      },
      { role: 'user', content: JSON.stringify({ items: payload }) },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned empty scoring response');
  const parsed = BatchSchema.parse(JSON.parse(content));

  const result = new Map<string, BensonScore>();
  for (const score of parsed.scores) {
    const { id, ...rest } = score;
    result.set(id, {
      ...rest,
      composite: Math.round(rest.composite),
      version: BENSON_SCORE_VERSION,
      scoredAt: new Date().toISOString(),
    });
  }
  return result;
}

/** Score specific content items immediately after chat intake. */
export async function scoreContentItemIds(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await db
    .select({
      id: contentItems.id,
      topic: contentItems.topic,
      script: contentItems.script,
      locationName: contentItems.locationName,
      eventStartsAt: contentItems.eventStartsAt,
      metadata: contentItems.metadata,
    })
    .from(contentItems)
    .where(inArray(contentItems.id, ids));

  const items: ScorableItem[] = rows.map((r) => ({
    ...r,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
  }));
  if (items.length === 0) return 0;

  let scored = 0;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    try {
      const scores = await scoreBatch(batch);
      for (const item of batch) {
        const score = scores.get(item.id);
        if (!score) continue;
        await db
          .update(contentItems)
          .set({
            metadata: { ...item.metadata, bensonScore: score },
            relevanceScore: (score.composite / 100).toFixed(2),
          })
          .where(sql`${contentItems.id} = ${item.id}`);
        scored += 1;
      }
    } catch (err) {
      console.warn(
        '[opportunity-scoring] intake batch failed:',
        err instanceof Error ? err.message : err,
      );
    }
  }
  return scored;
}

export async function scoreUnscoredItems(options?: { limit?: number }): Promise<ScoreRunResult> {
  const limit = options?.limit ?? 36;
  const items = await loadUnscoredItems(limit);
  const result: ScoreRunResult = { scanned: items.length, scored: 0, batches: 0, errors: 0 };
  if (items.length === 0) return result;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    result.batches += 1;
    try {
      const scores = await scoreBatch(batch);
      for (const item of batch) {
        const score = scores.get(item.id);
        if (!score) continue;
        await db
          .update(contentItems)
          .set({
            metadata: { ...item.metadata, bensonScore: score },
            relevanceScore: (score.composite / 100).toFixed(2),
          })
          .where(sql`${contentItems.id} = ${item.id}`);
        result.scored += 1;
      }
    } catch (err) {
      result.errors += 1;
      console.warn(
        '[opportunity-scoring] batch failed:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  return result;
}

export type TopOpportunity = {
  id: string;
  title: string;
  category: string | null;
  location: string | null;
  eventDate: string | null;
  composite: number;
  rationale: string;
  sourceUrl: string | null;
};

/** Top scored, preference-filtered opportunities (for chat context + reports). */
export async function getTopScoredOpportunities(options?: {
  limit?: number;
  excludeCategories?: string[];
}): Promise<TopOpportunity[]> {
  const limit = options?.limit ?? 5;
  const excluded =
    options?.excludeCategories ?? (await getCreatorPreferences()).excludedCategories;
  const excludeSet = new Set(excluded);

  const rows = await db
    .select({
      id: contentItems.id,
      topic: contentItems.topic,
      locationName: contentItems.locationName,
      eventStartsAt: contentItems.eventStartsAt,
      sourceUrl: contentItems.sourceUrl,
      metadata: contentItems.metadata,
    })
    .from(contentItems)
    .where(
      and(
        sql`${contentItems.state} = 'planned'`,
        sql`${contentItems.metadata}->'bensonScore' IS NOT NULL`,
        sql`(${contentItems.eventStartsAt} IS NULL OR ${contentItems.eventStartsAt} >= NOW() - INTERVAL '1 day')`,
      ),
    )
    .orderBy(sql`(${contentItems.metadata}->'bensonScore'->>'composite')::numeric DESC`)
    .limit(limit * 3);

  const top: TopOpportunity[] = [];
  for (const row of rows) {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const category = (metadata.opportunityCategory as string) ?? null;
    if (category && excludeSet.has(category)) continue;
    const score = metadata.bensonScore as BensonScore | undefined;
    if (!score) continue;
    if (row.eventStartsAt && row.eventStartsAt.getTime() < Date.now() - 24 * 60 * 60 * 1000) continue;
    top.push({
      id: row.id,
      title: row.topic,
      category,
      location: row.locationName,
      eventDate: row.eventStartsAt?.toISOString() ?? null,
      composite: score.composite,
      rationale: score.rationale,
      sourceUrl: row.sourceUrl,
    });
    if (top.length >= limit) break;
  }
  return top;
}
