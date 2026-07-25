import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  contentItems,
  creatorPreferences,
  plannerItems,
  sponsorContacts,
} from '../schema.js';
import type { PreferenceLogEntry } from './index.js';

export type PassedOpportunity = {
  phrase: string;
  reason: string;
  at: string;
};

const GLOBAL_ID = 'global';

function normalizePhrase(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Fuzzy match — "maj r thrift" matches "Maj-R Thrift grand opening in Overland Park". */
export function titleMatchesPassed(title: string, passed: PassedOpportunity[]): boolean {
  const normalizedTitle = normalizePhrase(title);
  if (!normalizedTitle) return false;

  for (const entry of passed) {
    const phrase = normalizePhrase(entry.phrase);
    if (!phrase || phrase.length < 3) continue;
    if (normalizedTitle.includes(phrase) || phrase.includes(normalizedTitle)) return true;

    const titleTokens = normalizedTitle.split(' ').filter((t) => t.length > 2);
    const phraseTokens = phrase.split(' ').filter((t) => t.length > 2);
    if (phraseTokens.length === 0) continue;
    const overlap = phraseTokens.filter((t) => titleTokens.some((tt) => tt.includes(t) || t.includes(tt)));
    if (overlap.length >= Math.min(2, phraseTokens.length)) return true;
  }
  return false;
}

export async function loadPassedOpportunities(): Promise<PassedOpportunity[]> {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const seen = new Set<string>();
  const results: PassedOpportunity[] = [];

  const push = (phrase: string, reason: string, at: string) => {
    const key = normalizePhrase(phrase);
    if (!key || key.length < 3 || seen.has(key)) return;
    seen.add(key);
    results.push({ phrase: phrase.trim(), reason, at });
  };

  const [prefRow, closedPlannerRows, dismissedRows] = await Promise.all([
    db.select().from(creatorPreferences).where(eq(creatorPreferences.id, GLOBAL_ID)).limit(1),
    db
      .select({
        title: contentItems.topic,
        status: plannerItems.status,
        updatedAt: plannerItems.updatedAt,
      })
      .from(plannerItems)
      .innerJoin(contentItems, sql`${plannerItems.contentItemId} = ${contentItems.id}`)
      .where(
        and(
          inArray(plannerItems.status, ['skipped', 'covered']),
          gte(plannerItems.updatedAt, since),
        ),
      )
      .orderBy(desc(plannerItems.updatedAt))
      .limit(80),
    db
      .select({
        title: contentItems.topic,
        updatedAt: sponsorContacts.updatedAt,
      })
      .from(sponsorContacts)
      .innerJoin(contentItems, sql`${sponsorContacts.sourceOpportunityId} = ${contentItems.id}`)
      .where(
        and(eq(sponsorContacts.status, 'not_interested'), gte(sponsorContacts.updatedAt, since)),
      )
      .orderBy(desc(sponsorContacts.updatedAt))
      .limit(40),
  ]);

  for (const entry of (prefRow[0]?.preferenceLog ?? []) as PreferenceLogEntry[]) {
    if (entry.action !== 'pass') continue;
    if (new Date(entry.at).getTime() < since.getTime()) continue;
    push(entry.topic ?? entry.note ?? '', 'chat preference', entry.at);
  }

  for (const row of closedPlannerRows) {
    push(
      row.title,
      row.status === 'covered' ? 'planner covered' : 'planner skip',
      row.updatedAt.toISOString(),
    );
  }

  for (const row of dismissedRows) {
    push(row.title, 'not interested', row.updatedAt.toISOString());
  }

  return results.sort((a, b) => b.at.localeCompare(a.at));
}

export async function recordPassedOpportunity(
  phrase: string,
  via: PreferenceLogEntry['via'],
  note?: string | null,
): Promise<void> {
  const trimmed = phrase.trim();
  if (!trimmed) return;

  const entry: PreferenceLogEntry = {
    at: new Date().toISOString(),
    action: 'pass',
    category: '',
    topic: trimmed,
    note: note ?? null,
    via,
  };

  await db
    .insert(creatorPreferences)
    .values({ id: GLOBAL_ID })
    .onConflictDoNothing();

  await db
    .update(creatorPreferences)
    .set({
      preferenceLog: sql`(${creatorPreferences.preferenceLog} || ${JSON.stringify([entry])}::jsonb)`,
      updatedAt: new Date(),
    })
    .where(eq(creatorPreferences.id, GLOBAL_ID));
}
