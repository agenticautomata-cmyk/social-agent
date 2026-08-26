/**
 * Discover taste weights stored in existing creator_preferences.category_notes.
 * Not a new preference system — same row Home/chat already use.
 *
 * more_like_this → bounded positive trait weights
 * less_like_this → bounded negative weights on SPECIFIC traits only (never "all events")
 * not_interested → optional mild specific-trait downweight; item hide is separate
 */
import { eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { creatorPreferences } from '../schema.js';

const GLOBAL_ID = 'global';

/** Reserved category_notes key — not a content category. */
export const DISCOVER_TASTE_NOTE_KEY = '__discoverTasteWeights';

export const DISCOVER_TASTE_MIN = -3;
export const DISCOVER_TASTE_MAX = 3;

/** Traits too broad for a single Less-like-this / Not-interested click. */
export const DISCOVER_BROAD_TRAITS = new Set([
  'event',
  'things_to_do',
  'place',
  'general',
  'watch',
  'food',
  'creator_partnership',
]);

export type DiscoverTasteWeights = Record<string, number>;

export type DiscoverTasteDirection = 'more' | 'less' | 'not_interested';

type TasteVia = 'chat' | 'dashboard' | 'api';

function clamp(n: number): number {
  return Math.max(DISCOVER_TASTE_MIN, Math.min(DISCOVER_TASTE_MAX, n));
}

function parseWeights(raw: string | undefined): DiscoverTasteWeights {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: DiscoverTasteWeights = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value) && key.trim()) {
        out[key] = clamp(value);
      }
    }
    return out;
  } catch {
    return {};
  }
}

async function ensureRow(): Promise<void> {
  await db.insert(creatorPreferences).values({ id: GLOBAL_ID }).onConflictDoNothing();
}

export async function getDiscoverTasteWeights(): Promise<DiscoverTasteWeights> {
  const [row] = await db
    .select({ categoryNotes: creatorPreferences.categoryNotes })
    .from(creatorPreferences)
    .where(eq(creatorPreferences.id, GLOBAL_ID))
    .limit(1);
  const notes = (row?.categoryNotes ?? {}) as Record<string, string>;
  return parseWeights(notes[DISCOVER_TASTE_NOTE_KEY]);
}

export function traitsForTasteDirection(traits: string[], _direction: DiscoverTasteDirection): string[] {
  const unique = [...new Set(traits.map((t) => t.trim()).filter(Boolean))];
  return unique.filter((t) => !DISCOVER_BROAD_TRAITS.has(t));
}

export function nextDiscoverTasteWeights(
  current: DiscoverTasteWeights,
  traits: string[],
  direction: DiscoverTasteDirection,
): DiscoverTasteWeights {
  const delta = direction === 'more' ? 1 : direction === 'not_interested' ? -1 : -1;
  const next = { ...current };
  for (const trait of traitsForTasteDirection(traits, direction)) {
    next[trait] = clamp((next[trait] ?? 0) + delta);
  }
  return next;
}

export function discoverPreferenceFit(itemTraits: string[], weights: DiscoverTasteWeights): number {
  if (itemTraits.length === 0) return 0;
  let sum = 0;
  for (const trait of new Set(itemTraits)) {
    sum += weights[trait] ?? 0;
  }
  return sum;
}

export async function applyDiscoverTasteVote(
  traits: string[],
  direction: DiscoverTasteDirection,
  via: TasteVia = 'dashboard',
): Promise<DiscoverTasteWeights> {
  const applicable = traitsForTasteDirection(traits, direction);
  await ensureRow();
  const [row] = await db
    .select({
      categoryNotes: creatorPreferences.categoryNotes,
      preferenceLog: creatorPreferences.preferenceLog,
    })
    .from(creatorPreferences)
    .where(eq(creatorPreferences.id, GLOBAL_ID))
    .limit(1);

  const notes = { ...((row?.categoryNotes ?? {}) as Record<string, string>) };
  const current = parseWeights(notes[DISCOVER_TASTE_NOTE_KEY]);
  const next = nextDiscoverTasteWeights(current, applicable, direction);
  notes[DISCOVER_TASTE_NOTE_KEY] = JSON.stringify(next);

  const actionNote =
    direction === 'more' ? 'more_like_this' : direction === 'less' ? 'less_like_this' : 'not_interested';
  const logEntries = applicable.map((trait) => ({
    at: new Date().toISOString(),
    action: direction === 'more' ? ('include' as const) : ('pass' as const),
    category: trait,
    topic: `discover_taste:${trait}`,
    note: actionNote,
    via,
  }));

  await db
    .update(creatorPreferences)
    .set({
      categoryNotes: notes,
      ...(logEntries.length > 0
        ? { preferenceLog: sql`(${creatorPreferences.preferenceLog} || ${JSON.stringify(logEntries)}::jsonb)` }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(creatorPreferences.id, GLOBAL_ID));

  return next;
}
