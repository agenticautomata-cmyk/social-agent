import { asc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { playbookSources, playbookDocuments } from '../schema.js';

export type PlaybookSourceRecord = {
  id: string;
  slug: string;
  name: string;
  category: string;
  notes: string | null;
  document: {
    id: string;
    title: string;
    chunkCount: number;
    pageCount: number | null;
    ingestedAt: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export async function listPlaybookSources(): Promise<PlaybookSourceRecord[]> {
  const rows = await db.select().from(playbookSources).orderBy(asc(playbookSources.name));
  return Promise.all(rows.map(enrichSource));
}

async function enrichSource(row: typeof playbookSources.$inferSelect): Promise<PlaybookSourceRecord> {
  const document = await db.query.playbookDocuments.findFirst({
    where: eq(playbookDocuments.sourceId, row.id),
  });
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    notes: row.notes,
    document: document
      ? {
          id: document.id,
          title: document.title,
          chunkCount: document.chunkCount,
          pageCount: document.pageCount,
          ingestedAt: document.ingestedAt?.toISOString() ?? null,
        }
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type PlaybookQuickActionRecord = {
  id: string;
  slug: string;
  label: string;
  prompt: string;
  capability: string;
  sourceSlug: string | null;
  sortOrder: number;
};

export async function listPlaybookQuickActions(): Promise<PlaybookQuickActionRecord[]> {
  const { listPlaybookQuickActionsFromDb } = await import('./seed-data.js');
  const rows = await listPlaybookQuickActionsFromDb();
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    label: row.label,
    prompt: row.prompt,
    capability: row.capability,
    sourceSlug: row.sourceSlug,
    sortOrder: row.sortOrder,
  }));
}
