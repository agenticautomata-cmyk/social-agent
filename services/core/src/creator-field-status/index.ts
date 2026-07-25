import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { creatorPreferences } from '../schema.js';

const GLOBAL_ID = 'global';
/** Reserved key in category_notes — not a content category. */
export const FIELD_STATUS_NOTE_KEY = '__liveFieldStatus';

export type CreatorFieldStatus = {
  active: boolean;
  headline: string;
  eventName: string;
  location: string;
  eventDate: string;
  activity: string;
  updatedAt: string;
  expiresAt: string;
};

async function ensureRow(): Promise<void> {
  await db.insert(creatorPreferences).values({ id: GLOBAL_ID }).onConflictDoNothing();
}

export async function getCreatorFieldStatus(): Promise<CreatorFieldStatus | null> {
  const [row] = await db
    .select({ categoryNotes: creatorPreferences.categoryNotes })
    .from(creatorPreferences)
    .where(eq(creatorPreferences.id, GLOBAL_ID))
    .limit(1);

  const raw = (row?.categoryNotes as Record<string, string> | null)?.[FIELD_STATUS_NOTE_KEY];
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as CreatorFieldStatus;
    if (!parsed.active) return null;
    if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function setCreatorFieldStatus(
  status: CreatorFieldStatus | null,
): Promise<CreatorFieldStatus | null> {
  await ensureRow();
  const current = await db.query.creatorPreferences.findFirst({
    where: eq(creatorPreferences.id, GLOBAL_ID),
  });
  const notes = { ...((current?.categoryNotes ?? {}) as Record<string, string>) };

  if (status?.active) {
    notes[FIELD_STATUS_NOTE_KEY] = JSON.stringify(status);
  } else {
    delete notes[FIELD_STATUS_NOTE_KEY];
  }

  await db
    .update(creatorPreferences)
    .set({ categoryNotes: notes, updatedAt: new Date() })
    .where(eq(creatorPreferences.id, GLOBAL_ID));

  return status?.active ? status : null;
}
