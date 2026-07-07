import { asc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import {
  equipmentChecklists,
  equipmentItems,
  equipmentManuals,
  equipmentTroubleshooting,
} from '../schema.js';

export type EquipmentItemRecord = {
  id: string;
  slug: string;
  name: string;
  brand: string;
  model: string;
  category: string;
  owner: string;
  manualFilePath: string | null;
  notes: string | null;
  manual: {
    id: string;
    title: string;
    chunkCount: number;
    pageCount: number | null;
    ingestedAt: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export async function listEquipmentItems(): Promise<EquipmentItemRecord[]> {
  const rows = await db.select().from(equipmentItems).orderBy(asc(equipmentItems.name));
  return Promise.all(rows.map(enrichItem));
}

export async function getEquipmentItemBySlug(slug: string): Promise<EquipmentItemRecord | null> {
  const row = await db.query.equipmentItems.findFirst({
    where: eq(equipmentItems.slug, slug),
  });
  return row ? enrichItem(row) : null;
}

async function enrichItem(row: typeof equipmentItems.$inferSelect): Promise<EquipmentItemRecord> {
  const manual = await db.query.equipmentManuals.findFirst({
    where: eq(equipmentManuals.equipmentId, row.id),
  });
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    brand: row.brand,
    model: row.model,
    category: row.category,
    owner: row.owner,
    manualFilePath: row.manualFilePath,
    notes: row.notes,
    manual: manual
      ? {
          id: manual.id,
          title: manual.title,
          chunkCount: manual.chunkCount,
          pageCount: manual.pageCount,
          ingestedAt: manual.ingestedAt?.toISOString() ?? null,
        }
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type EquipmentManualSummary = {
  id: string;
  equipmentId: string;
  equipmentName: string;
  equipmentSlug: string;
  title: string;
  originalFilename: string;
  chunkCount: number;
  pageCount: number | null;
  ingestedAt: string | null;
  sourcePath: string | null;
};

export async function listEquipmentManuals(): Promise<EquipmentManualSummary[]> {
  const rows = await db
    .select({
      manual: equipmentManuals,
      item: equipmentItems,
    })
    .from(equipmentManuals)
    .innerJoin(equipmentItems, eq(equipmentManuals.equipmentId, equipmentItems.id))
    .orderBy(asc(equipmentItems.name));

  return rows.map(({ manual, item }) => ({
    id: manual.id,
    equipmentId: item.id,
    equipmentName: item.name,
    equipmentSlug: item.slug,
    title: manual.title,
    originalFilename: manual.originalFilename,
    chunkCount: manual.chunkCount,
    pageCount: manual.pageCount,
    ingestedAt: manual.ingestedAt?.toISOString() ?? null,
    sourcePath: manual.sourcePath,
  }));
}

export async function getEquipmentManualDetail(id: string) {
  const manual = await db.query.equipmentManuals.findFirst({
    where: eq(equipmentManuals.id, id),
  });
  if (!manual) return null;
  const item = await db.query.equipmentItems.findFirst({
    where: eq(equipmentItems.id, manual.equipmentId),
  });
  return { manual, item };
}

export type TroubleshootingRecord = {
  id: string;
  slug: string;
  label: string;
  equipmentSlug: string | null;
  quickPrompt: string;
  symptoms: string[];
  steps: Array<{ title: string; detail: string }>;
  sortOrder: number;
};

export async function listTroubleshooting(): Promise<TroubleshootingRecord[]> {
  const rows = await db
    .select({
      row: equipmentTroubleshooting,
      item: equipmentItems,
    })
    .from(equipmentTroubleshooting)
    .leftJoin(equipmentItems, eq(equipmentTroubleshooting.equipmentId, equipmentItems.id))
    .orderBy(asc(equipmentTroubleshooting.sortOrder));

  return rows.map(({ row, item }) => ({
    id: row.id,
    slug: row.slug,
    label: row.label,
    equipmentSlug: item?.slug ?? null,
    quickPrompt: row.quickPrompt,
    symptoms: row.symptoms as string[],
    steps: row.steps as Array<{ title: string; detail: string }>,
    sortOrder: row.sortOrder,
  }));
}
