import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems } from '../schema.js';
import { findDuplicateOpportunity } from '../green-screen/duplicates.js';

export async function findInventoryDuplicate(input: {
  title: string;
  eventDate: string | null;
  venue: string | null;
  sourceUrl: string | null;
}): Promise<{ id: string; title: string } | null> {
  const dup = await findDuplicateOpportunity({
    contentItemId: '00000000-0000-0000-0000-000000000000',
    title: input.title,
    sourceUrl: input.sourceUrl ?? undefined,
  }).catch(() => null);

  if (dup?.id) {
    return { id: dup.id, title: dup.title ?? input.title };
  }

  if (input.eventDate && input.venue) {
    const rows = await db
      .select({ id: contentItems.id, topic: contentItems.topic })
      .from(contentItems)
      .where(eq(contentItems.locationName, input.venue))
      .limit(20);
    const match = rows.find((r) =>
      r.topic.toLowerCase().includes(input.title.toLowerCase().slice(0, 20)),
    );
    if (match) return { id: match.id, title: match.topic };
  }

  return null;
}

export function isPastEvent(eventDate: string | null): boolean {
  if (!eventDate) return false;
  const d = new Date(eventDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}
