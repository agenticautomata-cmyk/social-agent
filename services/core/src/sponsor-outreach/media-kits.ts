import { desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { mediaKits } from '../schema.js';

export type MediaKitRecord = {
  id: string;
  name: string;
  description: string | null;
  targetAudience: string | null;
  fileUrl: string | null;
  version: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MediaKitInput = {
  name: string;
  description?: string | null;
  targetAudience?: string | null;
  fileUrl?: string | null;
  version?: string;
  active?: boolean;
};

function rowToRecord(row: typeof mediaKits.$inferSelect): MediaKitRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    targetAudience: row.targetAudience,
    fileUrl: row.fileUrl,
    version: row.version,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listMediaKits(activeOnly = false): Promise<MediaKitRecord[]> {
  const query = db.select().from(mediaKits).orderBy(desc(mediaKits.updatedAt));
  const rows = activeOnly
    ? await query.where(eq(mediaKits.active, true))
    : await query;
  return rows.map(rowToRecord);
}

export async function getMediaKit(id: string): Promise<MediaKitRecord | null> {
  const rows = await db.select().from(mediaKits).where(eq(mediaKits.id, id)).limit(1);
  return rows[0] ? rowToRecord(rows[0]) : null;
}

export async function createMediaKit(input: MediaKitInput): Promise<MediaKitRecord> {
  const [row] = await db
    .insert(mediaKits)
    .values({
      name: input.name,
      description: input.description ?? null,
      targetAudience: input.targetAudience ?? null,
      fileUrl: input.fileUrl ?? null,
      version: input.version ?? '1.0',
      active: input.active ?? true,
    })
    .returning();
  return rowToRecord(row!);
}

export async function updateMediaKit(
  id: string,
  input: Partial<MediaKitInput>,
): Promise<MediaKitRecord | null> {
  const patch: Partial<typeof mediaKits.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.targetAudience !== undefined) patch.targetAudience = input.targetAudience;
  if (input.fileUrl !== undefined) patch.fileUrl = input.fileUrl;
  if (input.version !== undefined) patch.version = input.version;
  if (input.active !== undefined) patch.active = input.active;

  const [row] = await db.update(mediaKits).set(patch).where(eq(mediaKits.id, id)).returning();
  return row ? rowToRecord(row) : null;
}
