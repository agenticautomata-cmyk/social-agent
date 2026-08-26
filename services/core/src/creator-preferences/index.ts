// Creator preferences — server-side learned preferences (single-creator pre-alpha).
// Persists excluded categories + notes; learned from chat ("I'm not ready for
// estate sales yet") or set via the dashboard category filter bar.

import { eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems, creatorPreferences } from '../schema.js';

const GLOBAL_ID = 'global';

export type PreferenceLogEntry = {
  at: string;
  action: 'exclude' | 'include' | 'pass';
  category: string;
  topic?: string | null;
  note: string | null;
  via: 'chat' | 'dashboard' | 'api';
};

export type CreatorPreferences = {
  excludedCategories: string[];
  categoryNotes: Record<string, string>;
  updatedAt: string;
};

export type PreferenceUpdate = {
  action: 'exclude' | 'include';
  category: string;
  note?: string | null;
};

export async function getCreatorPreferences(): Promise<CreatorPreferences> {
  const [row] = await db
    .select()
    .from(creatorPreferences)
    .where(eq(creatorPreferences.id, GLOBAL_ID))
    .limit(1);

  if (!row) {
    return { excludedCategories: [], categoryNotes: {}, updatedAt: new Date(0).toISOString() };
  }
  return {
    excludedCategories: row.excludedCategories ?? [],
    categoryNotes: (row.categoryNotes ?? {}) as Record<string, string>,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function ensureRow(): Promise<void> {
  await db
    .insert(creatorPreferences)
    .values({ id: GLOBAL_ID })
    .onConflictDoNothing();
}

export async function setExcludedCategories(
  excludedCategories: string[],
  via: PreferenceLogEntry['via'] = 'api',
): Promise<CreatorPreferences> {
  await ensureRow();
  const current = await getCreatorPreferences();
  const next = [...new Set(excludedCategories.map((c) => c.trim()).filter(Boolean))].sort();

  const added = next.filter((c) => !current.excludedCategories.includes(c));
  const removed = current.excludedCategories.filter((c) => !next.includes(c));
  const logEntries: PreferenceLogEntry[] = [
    ...added.map((category) => ({
      at: new Date().toISOString(),
      action: 'exclude' as const,
      category,
      note: null,
      via,
    })),
    ...removed.map((category) => ({
      at: new Date().toISOString(),
      action: 'include' as const,
      category,
      note: null,
      via,
    })),
  ];

  await db
    .update(creatorPreferences)
    .set({
      excludedCategories: next,
      preferenceLog: sql`(${creatorPreferences.preferenceLog} || ${JSON.stringify(logEntries)}::jsonb)`,
      updatedAt: new Date(),
    })
    .where(eq(creatorPreferences.id, GLOBAL_ID));

  return getCreatorPreferences();
}

export async function applyPreferenceUpdates(
  updates: PreferenceUpdate[],
  via: PreferenceLogEntry['via'] = 'chat',
): Promise<{ applied: PreferenceUpdate[]; preferences: CreatorPreferences }> {
  if (updates.length === 0) {
    return { applied: [], preferences: await getCreatorPreferences() };
  }

  await ensureRow();
  const current = await getCreatorPreferences();
  const excluded = new Set(current.excludedCategories);
  const notes: Record<string, string> = { ...current.categoryNotes };
  const applied: PreferenceUpdate[] = [];
  const logEntries: PreferenceLogEntry[] = [];

  for (const update of updates) {
    const category = update.category.trim();
    if (!category) continue;
    if (update.action === 'exclude' && !excluded.has(category)) {
      excluded.add(category);
      applied.push(update);
    } else if (update.action === 'include' && excluded.has(category)) {
      excluded.delete(category);
      applied.push(update);
    } else {
      continue;
    }
    if (update.note) notes[category] = update.note;
    else if (update.action === 'include') delete notes[category];
    logEntries.push({
      at: new Date().toISOString(),
      action: update.action,
      category,
      note: update.note ?? null,
      via,
    });
  }

  if (applied.length === 0) {
    return { applied: [], preferences: current };
  }

  await db
    .update(creatorPreferences)
    .set({
      excludedCategories: [...excluded].sort(),
      categoryNotes: notes,
      preferenceLog: sql`(${creatorPreferences.preferenceLog} || ${JSON.stringify(logEntries)}::jsonb)`,
      updatedAt: new Date(),
    })
    .where(eq(creatorPreferences.id, GLOBAL_ID));

  return { applied, preferences: await getCreatorPreferences() };
}

// ----------------------------------------------------------------------------
// Chat intent detection — "I'm not ready for estate sales yet", "no more X",
// "show me X again". Deterministic regex + category resolution against the
// categories actually present in inventory.
// ----------------------------------------------------------------------------

let categoryCache: { categories: string[]; loadedAt: number } | null = null;
const CATEGORY_CACHE_MS = 5 * 60 * 1000;

export async function listKnownCategories(): Promise<string[]> {
  if (categoryCache && Date.now() - categoryCache.loadedAt < CATEGORY_CACHE_MS) {
    return categoryCache.categories;
  }
  const rows = await db.execute<{ category: string }>(
    sql`SELECT DISTINCT metadata->>'opportunityCategory' AS category
        FROM ${contentItems}
        WHERE metadata->>'opportunityCategory' IS NOT NULL`,
  );
  const categories = [...rows]
    .map((r) => r.category)
    .filter((c): c is string => Boolean(c))
    .sort();
  categoryCache = { categories, loadedAt: Date.now() };
  return categories;
}

function normalizePhrase(phrase: string): string {
  return phrase
    .toLowerCase()
    .replace(/[^a-z0-9\s_]/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

/** "estate sales" → "estate_sale" by matching known category ids (singular/plural tolerant). */
export function resolveCategory(phrase: string, knownCategories: string[]): string | null {
  const normalized = normalizePhrase(phrase);
  if (!normalized) return null;
  const singular = normalized.replace(/s$/, '');

  for (const candidate of [normalized, singular]) {
    const exact = knownCategories.find((c) => c === candidate);
    if (exact) return exact;
  }
  // Partial: phrase tokens all appear in the category id (e.g. "estate sales" → estate_sale).
  const tokens = normalized.split('_').filter(Boolean);
  if (tokens.length === 0) return null;
  const partial = knownCategories.find((c) =>
    tokens.every((t) => c.includes(t.replace(/s$/, ''))),
  );
  return partial ?? null;
}

const EXCLUDE_PATTERNS: RegExp[] = [
  /(?:i'?m|i am)\s+not\s+ready\s+(?:to\s+do\s+|for\s+)?(?:any\s+)?([a-z0-9\s_-]{3,40}?)(?:\s+yet)?\s*[.!]?$/i,
  /(?:no|stop|skip|hide|remove|drop)\s+(?:more\s+|showing\s+(?:me\s+)?|the\s+)?([a-z0-9\s_-]{3,40}?)(?:\s+(?:for now|please|stuff|content|posts?))?\s*[.!]?$/i,
  /don'?t\s+(?:show|recommend|suggest|give)\s+(?:me\s+)?(?:any\s+)?(?:more\s+)?([a-z0-9\s_-]{3,40}?)\s*[.!]?$/i,
  /not\s+interested\s+in\s+([a-z0-9\s_-]{3,40}?)\s*[.!]?$/i,
];

const INCLUDE_PATTERNS: RegExp[] = [
  /(?:i'?m|i am)\s+ready\s+(?:to\s+do\s+|for\s+)(?:some\s+)?([a-z0-9\s_-]{3,40}?)(?:\s+(?:again|now))?\s*[.!]?$/i,
  /(?:show|bring back|include|add)\s+(?:me\s+)?([a-z0-9\s_-]{3,40}?)\s+again\s*[.!]?$/i,
  /turn\s+([a-z0-9\s_-]{3,40}?)\s+back\s+on\s*[.!]?$/i,
];

const PASS_BUSINESS_PATTERNS: RegExp[] = [
  /not\s+interested\s+in\s+(?:the\s+)?([a-z0-9][a-z0-9\s&'.-]{2,60}?)(?:\s+(?:opening|thrift|store|restaurant|cafe|anymore|for now))?\s*[.!]?$/i,
  /(?:skip|pass on|don't suggest|stop suggesting)\s+(?:the\s+)?([a-z0-9][a-z0-9\s&'.-]{2,60}?)\s*[.!]?$/i,
];

export async function detectPreferenceUpdates(message: string): Promise<PreferenceUpdate[]> {
  const trimmed = message.trim();
  if (!trimmed || trimmed.length > 220) return [];

  const known = await listKnownCategories();
  if (known.length === 0) return [];
  const updates: PreferenceUpdate[] = [];

  for (const pattern of EXCLUDE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (!match?.[1]) continue;
    const category = resolveCategory(match[1], known);
    if (category) {
      updates.push({
        action: 'exclude',
        category,
        note: `Kellie said: "${trimmed.slice(0, 160)}"`,
      });
      break;
    }
  }

  if (updates.length === 0) {
    for (const pattern of INCLUDE_PATTERNS) {
      const match = trimmed.match(pattern);
      if (!match?.[1]) continue;
      const category = resolveCategory(match[1], known);
      if (category) {
        updates.push({ action: 'include', category, note: null });
        break;
      }
    }
  }

  return updates;
}

/** Specific business/title passes — "not interested in Maj-R Thrift". */
export async function detectPassedBusiness(message: string): Promise<string | null> {
  const trimmed = message.trim();
  if (!trimmed || trimmed.length > 220) return null;

  for (const pattern of PASS_BUSINESS_PATTERNS) {
    const match = trimmed.match(pattern);
    if (!match?.[1]) continue;
    const phrase = match[1].trim();
    if (phrase.length < 3) continue;
    const known = await listKnownCategories();
    if (resolveCategory(phrase, known)) continue;
    return phrase;
  }
  return null;
}

export {
  loadPassedOpportunities,
  recordPassedOpportunity,
  titleMatchesPassed,
  type PassedOpportunity,
} from './passed-opportunities.js';
export {
  applyDiscoverTasteVote,
  getDiscoverTasteWeights,
  discoverPreferenceFit,
  nextDiscoverTasteWeights,
  DISCOVER_TASTE_NOTE_KEY,
  DISCOVER_BROAD_TRAITS,
  type DiscoverTasteWeights,
  type DiscoverTasteDirection,
} from './discover-taste.js';
