import type { InventoryItem } from '../inventory/normalize.js';
import type { CommandCenterCard } from '../inventory/command-center.js';
import {
  buildBensonContext,
  getLinkedOpportunitiesForContent,
  type BensonIntelligenceContext,
} from './context.js';
import { computeBensonScores, buildWhyBensonPicked } from './scores.js';
import { lookupSimilarAnalytics } from './analytics-similar.js';
import type { BensonCommandCenterCard, BensonIntelligenceFields } from './types.js';

let contextCache: { at: number; ctx: BensonIntelligenceContext } | null = null;
const CACHE_MS = 30_000;

export async function getBensonContext(): Promise<BensonIntelligenceContext> {
  const now = Date.now();
  if (contextCache && now - contextCache.at < CACHE_MS) {
    return contextCache.ctx;
  }
  const ctx = await buildBensonContext();
  contextCache = { at: now, ctx };
  return ctx;
}

export function enrichCardWithItem(
  card: CommandCenterCard,
  item: InventoryItem,
  context: BensonIntelligenceContext,
  now: Date,
): BensonCommandCenterCard {
  const plannerRecords = context.plannerByContentId.get(item.id) ?? [];
  const listNames = plannerRecords.map((r) => r.listName);
  const linked = getLinkedOpportunitiesForContent(item.id, context, listNames);
  const bensonScores = computeBensonScores(item, context, linked, now);
  const whyBensonPicked = buildWhyBensonPicked(item, bensonScores, linked, context);
  const analyticsSimilar = lookupSimilarAnalytics(item.category, context.categoryAnalytics);

  const fields: BensonIntelligenceFields = {
    bensonScores,
    whyBensonPicked,
    analyticsSimilar,
    linkedPipelineOpportunities: linked,
  };

  return { ...card, ...fields };
}

export function enrichCards(
  cards: CommandCenterCard[],
  itemsById: Map<string, InventoryItem>,
  context: BensonIntelligenceContext,
  now: Date,
): BensonCommandCenterCard[] {
  return cards.map((card) => {
    const item = itemsById.get(card.id);
    if (!item) return { ...card, bensonScores: { audience: 0, sponsor: 0, revenue: 0, trend: 0, confidence: 0 }, whyBensonPicked: [card.whyItMatters], analyticsSimilar: null, linkedPipelineOpportunities: [] };
    return enrichCardWithItem(card, item, context, now);
  });
}

export async function enrichEditorCards(
  cards: CommandCenterCard[],
  itemsById: Map<string, InventoryItem>,
  options?: { now?: Date },
): Promise<BensonCommandCenterCard[]> {
  const now = options?.now ?? new Date();
  const context = await getBensonContext();
  return enrichCards(cards, itemsById, context, now);
}
