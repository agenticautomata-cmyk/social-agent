import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { EQUIPMENT_SCOPE_RULES } from './constants.js';

export type ManualSearchHit = {
  chunkId: string;
  equipmentId: string;
  equipmentName: string;
  equipmentSlug: string;
  manualTitle: string;
  pageNumber: number | null;
  sectionTitle: string | null;
  chunkText: string;
  rank: number;
};

/** Return slug filter list, or null to search all manuals. */
export function resolveEquipmentSlugs(
  question: string,
  explicitSlug?: string | null,
): string[] | null {
  if (explicitSlug) return [explicitSlug];

  const q = question.toLowerCase();
  const matched = EQUIPMENT_SCOPE_RULES.filter((rule) => {
    if (rule.patterns.some((p) => p.test(q))) return true;
    return rule.keywords.some((k) => q.includes(k));
  }).map((r) => r.slug);

  if (matched.length === 0) return null;
  if (matched.length >= 4) return null;

  const unique = [...new Set(matched)];
  if (unique.includes('tiktok-studio') && unique.includes('tiktok') && q.includes('studio')) {
    return unique.filter((s) => s !== 'tiktok');
  }
  return unique;
}

function slugFilterSql(slugs: string[] | null) {
  if (!slugs || slugs.length === 0) return sql``;
  if (slugs.length === 1) return sql`AND i.slug = ${slugs[0]}`;
  return sql`AND i.slug IN (${sql.join(
    slugs.map((s) => sql`${s}`),
    sql`, `,
  )})`;
}

export async function searchEquipmentManuals(input: {
  query: string;
  equipmentSlug?: string | null;
  limit?: number;
}): Promise<ManualSearchHit[]> {
  const limit = input.limit ?? 8;
  const slugs = resolveEquipmentSlugs(input.query, input.equipmentSlug);

  const queryText = input.query.trim().slice(0, 500);
  if (!queryText) return [];

  const rows = await db.execute(sql`
    SELECT
      c.id AS chunk_id,
      c.equipment_id,
      i.name AS equipment_name,
      i.slug AS equipment_slug,
      m.title AS manual_title,
      c.page_number,
      c.section_title,
      c.chunk_text,
      ts_rank(c.search_vector, plainto_tsquery('english', ${queryText})) AS rank
    FROM equipment_manual_chunks c
    JOIN equipment_manuals m ON m.id = c.manual_id
    JOIN equipment_items i ON i.id = c.equipment_id
    WHERE c.search_vector @@ plainto_tsquery('english', ${queryText})
    ${slugFilterSql(slugs)}
    ORDER BY rank DESC
    LIMIT ${limit}
  `);

  return mapSearchRows(rows);
}

export async function fallbackKeywordSearch(input: {
  query: string;
  equipmentSlug?: string | null;
  limit?: number;
}): Promise<ManualSearchHit[]> {
  const limit = input.limit ?? 6;
  const slugs = resolveEquipmentSlugs(input.query, input.equipmentSlug);
  const terms = input.query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 3);

  const likeParts = terms.slice(0, 5).map((t) => sql`c.chunk_text ILIKE ${'%' + t + '%'}`);
  if (likeParts.length === 0) return [];

  const whereLike = sql.join(likeParts, sql` OR `);

  const rows = await db.execute(sql`
    SELECT
      c.id AS chunk_id,
      c.equipment_id,
      i.name AS equipment_name,
      i.slug AS equipment_slug,
      m.title AS manual_title,
      c.page_number,
      c.section_title,
      c.chunk_text,
      0.1 AS rank
    FROM equipment_manual_chunks c
    JOIN equipment_manuals m ON m.id = c.manual_id
    JOIN equipment_items i ON i.id = c.equipment_id
    WHERE (${whereLike})
    ${slugFilterSql(slugs)}
    ORDER BY c.page_number NULLS LAST, c.chunk_index
    LIMIT ${limit}
  `);

  return mapSearchRows(rows);
}

export async function searchManualsForQuestion(input: {
  question: string;
  equipmentSlug?: string | null;
}): Promise<ManualSearchHit[]> {
  let hits = await searchEquipmentManuals({
    query: input.question,
    equipmentSlug: input.equipmentSlug,
    limit: 8,
  });
  if (hits.length === 0) {
    hits = await fallbackKeywordSearch({
      query: input.question,
      equipmentSlug: input.equipmentSlug,
      limit: 6,
    });
  }
  return hits;
}

function mapSearchRows(rows: unknown): ManualSearchHit[] {
  return (rows as Array<Record<string, unknown>>).map((r) => ({
    chunkId: String(r.chunk_id),
    equipmentId: String(r.equipment_id),
    equipmentName: String(r.equipment_name),
    equipmentSlug: String(r.equipment_slug),
    manualTitle: String(r.manual_title),
    pageNumber: r.page_number != null ? Number(r.page_number) : null,
    sectionTitle: r.section_title != null ? String(r.section_title) : null,
    chunkText: String(r.chunk_text),
    rank: Number(r.rank ?? 0),
  }));
}
