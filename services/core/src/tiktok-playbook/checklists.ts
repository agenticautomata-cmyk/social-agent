import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { playbookChecklists } from '../schema.js';

export type PlaybookChecklistRecord = {
  id: string;
  slug: string;
  title: string;
  capability: string;
  description: string | null;
  steps: Array<{ title: string; detail: string }>;
  updatedAt: string;
};

export async function listPlaybookChecklists(): Promise<PlaybookChecklistRecord[]> {
  const rows = await db.select().from(playbookChecklists);
  return rows.map(mapChecklist);
}

export async function getPlaybookChecklistBySlug(slug: string): Promise<PlaybookChecklistRecord | null> {
  const row = await db.query.playbookChecklists.findFirst({
    where: eq(playbookChecklists.slug, slug),
  });
  return row ? mapChecklist(row) : null;
}

function mapChecklist(row: typeof playbookChecklists.$inferSelect): PlaybookChecklistRecord {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    capability: row.capability,
    description: row.description,
    steps: row.steps as Array<{ title: string; detail: string }>,
    updatedAt: row.updatedAt.toISOString(),
  };
}
