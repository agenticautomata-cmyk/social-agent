import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { entitySuppressions } from '../schema.js';
import type { SuppressionScope } from './types.js';

export type SuppressionRecord = {
  id: string;
  canonicalName: string;
  aliases: string[];
  domains: string[];
  suppressionScope: SuppressionScope;
  permanent: boolean;
};

let cache: { loadedAt: number; rows: SuppressionRecord[] } | null = null;
const CACHE_MS = 60_000;

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

function domainFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

export async function loadActiveSuppressions(force = false): Promise<SuppressionRecord[]> {
  const now = Date.now();
  if (!force && cache && now - cache.loadedAt < CACHE_MS) return cache.rows;

  const rows = await db
    .select({
      id: entitySuppressions.id,
      canonicalName: entitySuppressions.canonicalName,
      aliases: entitySuppressions.aliases,
      domains: entitySuppressions.domains,
      suppressionScope: entitySuppressions.suppressionScope,
      permanent: entitySuppressions.permanent,
    })
    .from(entitySuppressions)
    .where(
      and(
        isNull(entitySuppressions.restoredAt),
        or(isNull(entitySuppressions.expiresAt), sql`${entitySuppressions.expiresAt} > now()`),
      ),
    );

  cache = {
    loadedAt: now,
    rows: rows.map((row) => ({
      id: row.id,
      canonicalName: row.canonicalName,
      aliases: row.aliases ?? [],
      domains: row.domains ?? [],
      suppressionScope: row.suppressionScope as SuppressionScope,
      permanent: row.permanent,
    })),
  };
  return cache.rows;
}

export function invalidateSuppressionCache(): void {
  cache = null;
}

export function textMatchesSuppression(
  text: string,
  suppressions: SuppressionRecord[],
  scope: SuppressionScope | 'any' = 'any',
): SuppressionRecord | null {
  const normalized = normalizeText(text);
  if (!normalized) return null;

  for (const row of suppressions) {
    if (scope !== 'any' && row.suppressionScope !== scope && row.suppressionScope !== 'suppress_everywhere') {
      continue;
    }
    const names = [row.canonicalName, ...row.aliases].map(normalizeText).filter(Boolean);
    for (const name of names) {
      if (!name) continue;
      if (normalized === name || normalized.includes(name) || name.includes(normalized)) {
        return row;
      }
    }
  }
  return null;
}

export function recordMatchesSuppression(input: {
  title: string;
  businessName?: string | null;
  summary?: string | null;
  sourceUrl?: string | null;
  suppressions: SuppressionRecord[];
  scope?: SuppressionScope | 'any';
}): SuppressionRecord | null {
  const byTitle = textMatchesSuppression(input.title, input.suppressions, input.scope ?? 'any');
  if (byTitle) return byTitle;
  if (input.businessName) {
    const byBusiness = textMatchesSuppression(input.businessName, input.suppressions, input.scope ?? 'any');
    if (byBusiness) return byBusiness;
  }
  if (input.summary) {
    const bySummary = textMatchesSuppression(input.summary, input.suppressions, input.scope ?? 'any');
    if (bySummary) return bySummary;
  }
  const domain = domainFromUrl(input.sourceUrl);
  if (domain) {
    for (const row of input.suppressions) {
      if (row.domains.some((d) => domain.includes(d.toLowerCase()) || d.toLowerCase().includes(domain))) {
        return row;
      }
    }
  }
  return null;
}

export async function createEntitySuppression(input: {
  canonicalName: string;
  aliases?: string[];
  domains?: string[];
  suppressionReason: string;
  suppressionScope?: SuppressionScope;
  permanent?: boolean;
  createdBy?: string;
}): Promise<string> {
  const [row] = await db
    .insert(entitySuppressions)
    .values({
      canonicalName: input.canonicalName,
      aliases: input.aliases ?? [],
      domains: input.domains ?? [],
      suppressionReason: input.suppressionReason,
      suppressionScope: input.suppressionScope ?? 'suppress_everywhere',
      permanent: input.permanent ?? true,
      createdBy: input.createdBy ?? 'kellie',
    })
    .returning({ id: entitySuppressions.id });
  invalidateSuppressionCache();
  return row!.id;
}

export async function restoreEntitySuppression(id: string): Promise<void> {
  await db
    .update(entitySuppressions)
    .set({ restoredAt: new Date(), updatedAt: new Date() })
    .where(eq(entitySuppressions.id, id));
  invalidateSuppressionCache();
}

export async function listEntitySuppressions(limit = 100) {
  const rows = await db
    .select()
    .from(entitySuppressions)
    .where(isNull(entitySuppressions.restoredAt))
    .orderBy(sql`${entitySuppressions.createdAt} DESC`)
    .limit(limit);
  return rows;
}
