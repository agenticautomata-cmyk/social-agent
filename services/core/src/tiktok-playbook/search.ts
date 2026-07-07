import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { PLAYBOOK_SCOPE_RULES } from './constants.js';

export type PlaybookSearchHit = {
  chunkId: string;
  sourceId: string;
  sourceName: string;
  sourceSlug: string;
  documentTitle: string;
  pageNumber: number | null;
  sectionTitle: string | null;
  chunkText: string;
  rank: number;
};

export function resolvePlaybookSourceSlugs(
  question: string,
  explicitSlug?: string | null,
): string[] | null {
  if (explicitSlug) return [explicitSlug];

  const q = question.toLowerCase();
  const matched = PLAYBOOK_SCOPE_RULES.filter((rule) => {
    if (rule.patterns.some((p) => p.test(q))) return true;
    return rule.keywords.some((k) => q.includes(k));
  }).map((r) => r.slug);

  if (matched.length === 0) return null;
  if (matched.length >= 4) return null;
  return [...new Set(matched)];
}

function slugFilterSql(slugs: string[] | null) {
  if (!slugs || slugs.length === 0) return sql``;
  if (slugs.length === 1) return sql`AND s.slug = ${slugs[0]}`;
  return sql`AND s.slug IN (${sql.join(
    slugs.map((slug) => sql`${slug}`),
    sql`, `,
  )})`;
}

export async function searchPlaybookChunks(input: {
  query: string;
  sourceSlug?: string | null;
  limit?: number;
}): Promise<PlaybookSearchHit[]> {
  const limit = input.limit ?? 8;
  const slugs = resolvePlaybookSourceSlugs(input.query, input.sourceSlug);
  const queryText = input.query.trim().slice(0, 500);
  if (!queryText) return [];

  const rows = await db.execute(sql`
    SELECT
      c.id AS chunk_id,
      c.source_id,
      s.name AS source_name,
      s.slug AS source_slug,
      d.title AS document_title,
      c.page_number,
      c.section_title,
      c.chunk_text,
      ts_rank(c.search_vector, plainto_tsquery('english', ${queryText})) AS rank
    FROM playbook_chunks c
    JOIN playbook_documents d ON d.id = c.document_id
    JOIN playbook_sources s ON s.id = c.source_id
    WHERE c.search_vector @@ plainto_tsquery('english', ${queryText})
    ${slugFilterSql(slugs)}
    ORDER BY rank DESC
    LIMIT ${limit}
  `);

  return mapSearchRows(rows);
}

export async function fallbackPlaybookKeywordSearch(input: {
  query: string;
  sourceSlug?: string | null;
  limit?: number;
}): Promise<PlaybookSearchHit[]> {
  const limit = input.limit ?? 6;
  const slugs = resolvePlaybookSourceSlugs(input.query, input.sourceSlug);
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
      c.source_id,
      s.name AS source_name,
      s.slug AS source_slug,
      d.title AS document_title,
      c.page_number,
      c.section_title,
      c.chunk_text,
      0.1 AS rank
    FROM playbook_chunks c
    JOIN playbook_documents d ON d.id = c.document_id
    JOIN playbook_sources s ON s.id = c.source_id
    WHERE (${whereLike})
    ${slugFilterSql(slugs)}
    ORDER BY c.page_number NULLS LAST, c.chunk_index
    LIMIT ${limit}
  `);

  return mapSearchRows(rows);
}

export async function searchPlaybookForQuestion(input: {
  question: string;
  sourceSlug?: string | null;
}): Promise<PlaybookSearchHit[]> {
  let hits = await searchPlaybookChunks({
    query: input.question,
    sourceSlug: input.sourceSlug,
    limit: 8,
  });
  if (hits.length === 0) {
    hits = await fallbackPlaybookKeywordSearch({
      query: input.question,
      sourceSlug: input.sourceSlug,
      limit: 6,
    });
  }
  return hits;
}

function mapSearchRows(rows: unknown): PlaybookSearchHit[] {
  return (rows as Array<Record<string, unknown>>).map((r) => ({
    chunkId: String(r.chunk_id),
    sourceId: String(r.source_id),
    sourceName: String(r.source_name),
    sourceSlug: String(r.source_slug),
    documentTitle: String(r.document_title),
    pageNumber: r.page_number != null ? Number(r.page_number) : null,
    sectionTitle: r.section_title != null ? String(r.section_title) : null,
    chunkText: String(r.chunk_text),
    rank: Number(r.rank ?? 0),
  }));
}
