import type { InventoryItem } from '../inventory/normalize.js';
import type { CommandCenterCard } from '../inventory/command-center.js';
import { computeEditorHome, type EditorHomeResponse } from '../editor/home.js';
import { enrichCards, getBensonContext } from './enrich.js';
import { computeBriefingPriorities } from './briefing.js';
import type { BensonBriefingPriority, BensonCommandCenterCard } from './types.js';

export type BensonEditorHomeResponse = EditorHomeResponse & {
  briefingPriorities: BensonBriefingPriority[];
  weekItems: BensonCommandCenterCard[];
  savedItems: BensonCommandCenterCard[];
  coveredItems: BensonCommandCenterCard[];
};

function enrichSectionItems(
  sections: EditorHomeResponse['sections'],
  lookup: Map<string, InventoryItem>,
  now: Date,
): Promise<Record<string, { question: string; description: string; items: BensonCommandCenterCard[] }>> {
  return getBensonContext().then((context) => {
    const out = {} as Record<
      string,
      { question: string; description: string; items: BensonCommandCenterCard[] }
    >;
    for (const [key, section] of Object.entries(sections)) {
      out[key] = {
        ...section,
        items: enrichCards(section.items, lookup, context, now),
      };
    }
    return out;
  });
}

export async function computeBensonEditorHome(
  items: InventoryItem[],
  options?: { now?: Date; limit?: number; demoMode?: boolean },
): Promise<BensonEditorHomeResponse> {
  const now = options?.now ?? new Date();
  const home = await computeEditorHome(items, options);
  const lookup = new Map(items.map((item) => [item.id, item]));
  const context = await getBensonContext();

  const enrichedSections = await enrichSectionItems(home.sections, lookup, now);
  const weekItems = enrichCards(home.weekItems, lookup, context, now);
  const savedItems = enrichCards(home.savedItems, lookup, context, now);
  const coveredItems = enrichCards(home.coveredItems, lookup, context, now);

  const briefingPriorities = computeBriefingPriorities(
    { ...home, sections: home.sections },
    context,
    items,
  );

  return {
    ...home,
    sections: enrichedSections as EditorHomeResponse['sections'],
    weekItems,
    savedItems,
    coveredItems,
    briefingPriorities,
  } as BensonEditorHomeResponse;
}

export async function enrichCommandCenterCards(
  cards: CommandCenterCard[],
  items: InventoryItem[],
  options?: { now?: Date },
): Promise<BensonCommandCenterCard[]> {
  const lookup = new Map(items.map((item) => [item.id, item]));
  const context = await getBensonContext();
  return enrichCards(cards, lookup, context, options?.now ?? new Date());
}
