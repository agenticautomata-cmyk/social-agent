import { eq, ilike, or, and, ne } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems } from '../schema.js';

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function findDuplicateOpportunity(input: {
  contentItemId: string;
  title: string;
  sourceUrl?: string | null;
}): Promise<{ id: string; title: string } | null> {
  if (input.sourceUrl?.trim()) {
    const byUrl = await db.query.contentItems.findFirst({
      where: and(
        eq(contentItems.sourceUrl, input.sourceUrl.trim()),
        ne(contentItems.id, input.contentItemId),
      ),
    });
    if (byUrl) return { id: byUrl.id, title: byUrl.topic };
  }

  const normalized = normalizeTitle(input.title);
  if (normalized.length < 8) return null;

  const words = normalized.split(' ').filter((w) => w.length > 3).slice(0, 4);
  if (words.length === 0) return null;

  const pattern = `%${words.join('%')}%`;
  const rows = await db
    .select({ id: contentItems.id, topic: contentItems.topic })
    .from(contentItems)
    .where(
      and(ne(contentItems.id, input.contentItemId), ilike(contentItems.topic, pattern)),
    )
    .limit(5);

  for (const row of rows) {
    if (normalizeTitle(row.topic) === normalized) {
      return { id: row.id, title: row.topic };
    }
  }

  const first = rows[0];
  return first ? { id: first.id, title: first.topic } : null;
}

export async function findDuplicateBySubjectTitle(
  title: string,
  excludeContentItemId?: string,
): Promise<{ id: string; title: string } | null> {
  const normalized = normalizeTitle(title);
  if (normalized.length < 6) return null;

  const conditions = [ilike(contentItems.topic, `%${title.slice(0, 40)}%`)];
  if (excludeContentItemId) {
    const row = await db.query.contentItems.findFirst({
      where: and(...conditions, ne(contentItems.id, excludeContentItemId)),
    });
    return row ? { id: row.id, title: row.topic } : null;
  }

  const row = await db.query.contentItems.findFirst({
    where: or(...conditions),
  });
  return row ? { id: row.id, title: row.topic } : null;
}
