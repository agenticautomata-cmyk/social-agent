import { asc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { equipmentChecklists } from '../schema.js';

export type EquipmentChecklistRecord = {
  id: string;
  slug: string;
  title: string;
  shootType: string;
  description: string | null;
  gearToBring: string[];
  steps: Array<{ title: string; detail: string }>;
  commonMistakes: string[];
  recoverySteps: string[];
  updatedAt: string;
};

function rowToRecord(row: typeof equipmentChecklists.$inferSelect): EquipmentChecklistRecord {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    shootType: row.shootType,
    description: row.description,
    gearToBring: row.gearToBring as string[],
    steps: row.steps as Array<{ title: string; detail: string }>,
    commonMistakes: row.commonMistakes as string[],
    recoverySteps: row.recoverySteps as string[],
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listEquipmentChecklists(): Promise<EquipmentChecklistRecord[]> {
  const rows = await db
    .select()
    .from(equipmentChecklists)
    .orderBy(asc(equipmentChecklists.title));
  return rows.map(rowToRecord);
}

export async function getEquipmentChecklistBySlug(
  slug: string,
): Promise<EquipmentChecklistRecord | null> {
  const row = await db.query.equipmentChecklists.findFirst({
    where: eq(equipmentChecklists.slug, slug),
  });
  return row ? rowToRecord(row) : null;
}
