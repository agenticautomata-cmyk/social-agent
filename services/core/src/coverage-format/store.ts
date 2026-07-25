import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems } from '../schema.js';
import {
  parseCoverageFormat,
  type CoverageFormat,
} from './constants.js';
import { recommendCoverageFormatFromItem } from './recommend.js';

function categoryFromItem(item: typeof contentItems.$inferSelect): string | null {
  const metadata = (item.metadata ?? {}) as Record<string, unknown>;
  const cat = metadata.opportunityCategory;
  return typeof cat === 'string' && cat ? cat : null;
}

export async function getCoverageFormat(contentItemId: string): Promise<{
  coverageFormat: CoverageFormat | null;
  suggestedCoverageFormat: CoverageFormat | null;
  firsthandVisited: boolean;
}> {
  const row = await db.query.contentItems.findFirst({
    where: eq(contentItems.id, contentItemId),
  });
  if (!row) throw new Error('Content item not found');
  return {
    coverageFormat: parseCoverageFormat(row.coverageFormat),
    suggestedCoverageFormat: parseCoverageFormat(row.suggestedCoverageFormat),
    firsthandVisited: row.firsthandVisited,
  };
}

export async function setCoverageFormat(
  contentItemId: string,
  patch: {
    coverageFormat?: CoverageFormat | null;
    firsthandVisited?: boolean;
  },
): Promise<void> {
  await db
    .update(contentItems)
    .set({
      coverageFormat: patch.coverageFormat ?? undefined,
      firsthandVisited: patch.firsthandVisited,
      updatedAt: new Date(),
    })
    .where(eq(contentItems.id, contentItemId));
}

export async function refreshSuggestedCoverageFormat(contentItemId: string): Promise<CoverageFormat | null> {
  const row = await db.query.contentItems.findFirst({
    where: eq(contentItems.id, contentItemId),
  });
  if (!row) throw new Error('Content item not found');

  const suggested = recommendCoverageFormatFromItem(row, categoryFromItem(row));
  await db
    .update(contentItems)
    .set({
      suggestedCoverageFormat: suggested,
      updatedAt: new Date(),
    })
    .where(eq(contentItems.id, contentItemId));

  return suggested;
}
