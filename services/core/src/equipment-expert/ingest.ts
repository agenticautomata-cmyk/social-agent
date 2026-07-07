import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import {
  equipmentItems,
  equipmentManualChunks,
  equipmentManuals,
} from '../schema.js';
import { SEED_EQUIPMENT } from './constants.js';
import { findManualsInDownloads, extractAndChunkDocument } from './pdf-chunk.js';
import { copyManualToStorage, readEquipmentManualFile } from './storage.js';
import { seedEquipmentChecklists, seedEquipmentTroubleshooting } from './seed-data.js';

export type IngestResult = {
  ok: boolean;
  items: Array<{
    slug: string;
    name: string;
    manualFound: boolean;
    sourcePath: string | null;
    chunkCount: number;
    pageCount: number | null;
    message: string;
  }>;
  errors: string[];
};

export async function ingestEquipmentManuals(options?: {
  downloadsOnly?: boolean;
}): Promise<IngestResult> {
  const errors: string[] = [];
  const items: IngestResult['items'] = [];

  await seedEquipmentChecklists();
  await seedEquipmentTroubleshooting();

  const located = await findManualsInDownloads();
  const locatedBySlug = new Map(located.map((l) => [l.seedSlug, l]));

  for (const seed of SEED_EQUIPMENT) {
    try {
      const item = await upsertEquipmentItem(seed);
      const locatedManual = locatedBySlug.get(seed.slug);

      if (!locatedManual) {
        const existingManual = await db.query.equipmentManuals.findFirst({
          where: eq(equipmentManuals.equipmentId, item.id),
        });
        items.push({
          slug: seed.slug,
          name: seed.name,
          manualFound: !!existingManual,
          sourcePath: existingManual?.sourcePath ?? null,
          chunkCount: existingManual?.chunkCount ?? 0,
          pageCount: existingManual?.pageCount ?? null,
          message: existingManual
            ? 'Manual already ingested from storage.'
            : 'Source not found in ~/Downloads (PDF or saved web page) — item registered, ingest when ready.',
        });
        continue;
      }

      const result = await ingestManualForItem({
        itemId: item.id,
        seed,
        sourcePath: locatedManual.sourcePath,
        originalFilename: locatedManual.originalFilename,
        sourceKind: locatedManual.sourceKind,
      });

      items.push({
        slug: seed.slug,
        name: seed.name,
        manualFound: true,
        sourcePath: locatedManual.sourcePath,
        chunkCount: result.chunkCount,
        pageCount: result.pageCount,
        message: result.message,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ingest failed';
      errors.push(`${seed.slug}: ${msg}`);
      items.push({
        slug: seed.slug,
        name: seed.name,
        manualFound: false,
        sourcePath: null,
        chunkCount: 0,
        pageCount: null,
        message: msg,
      });
    }
  }

  return { ok: errors.length === 0, items, errors };
}

async function upsertEquipmentItem(seed: (typeof SEED_EQUIPMENT)[number]) {
  const existing = await db.query.equipmentItems.findFirst({
    where: eq(equipmentItems.slug, seed.slug),
  });
  if (existing) {
    const [updated] = await db
      .update(equipmentItems)
      .set({
        name: seed.name,
        brand: seed.brand,
        model: seed.model,
        category: seed.category,
        notes: seed.notes,
        updatedAt: new Date(),
      })
      .where(eq(equipmentItems.id, existing.id))
      .returning();
    return updated!;
  }

  const [created] = await db
    .insert(equipmentItems)
    .values({
      slug: seed.slug,
      name: seed.name,
      brand: seed.brand,
      model: seed.model,
      category: seed.category,
      notes: seed.notes,
    })
    .returning();
  return created!;
}

async function ingestManualForItem(input: {
  itemId: string;
  seed: (typeof SEED_EQUIPMENT)[number];
  sourcePath: string;
  originalFilename: string;
  sourceKind: 'pdf' | 'html';
}): Promise<{ chunkCount: number; pageCount: number | null; message: string }> {
  const existingManual = await db.query.equipmentManuals.findFirst({
    where: eq(equipmentManuals.equipmentId, input.itemId),
  });

  const copied = await copyManualToStorage({
    sourcePath: input.sourcePath,
    originalFilename: input.originalFilename,
    storageFilename: existingManual?.storageFilename,
  });
  const storageFilename = copied.storageFilename;
  const fileSize = copied.fileSize;

  const file = await readEquipmentManualFile(storageFilename);
  if (!file) throw new Error('Stored manual file missing');

  const { pageCount, chunks } = await extractAndChunkDocument({
    buffer: file.buffer,
    sourceKind: input.sourceKind,
  });
  if (chunks.length === 0) throw new Error('No text extracted from source document');

  const now = new Date();
  let manualId = existingManual?.id;

  if (existingManual) {
    await db
      .delete(equipmentManualChunks)
      .where(eq(equipmentManualChunks.manualId, existingManual.id));
    await db
      .update(equipmentManuals)
      .set({
        title: input.seed.manualTitle,
        originalFilename: input.originalFilename,
        fileSize,
        pageCount,
        chunkCount: chunks.length,
        ingestedAt: now,
        sourcePath: input.sourcePath,
        updatedAt: now,
      })
      .where(eq(equipmentManuals.id, existingManual.id));
    manualId = existingManual.id;
  } else {
    const [manual] = await db
      .insert(equipmentManuals)
      .values({
        equipmentId: input.itemId,
        title: input.seed.manualTitle,
        originalFilename: input.originalFilename,
        storageFilename: storageFilename!,
        fileSize,
        pageCount,
        chunkCount: chunks.length,
        ingestedAt: now,
        sourcePath: input.sourcePath,
      })
      .returning();
    manualId = manual!.id;
  }

  await db.insert(equipmentManualChunks).values(
    chunks.map((c) => ({
      manualId: manualId!,
      equipmentId: input.itemId,
      pageNumber: c.pageNumber,
      sectionTitle: c.sectionTitle,
      chunkIndex: c.chunkIndex,
      chunkText: c.chunkText,
    })),
  );

  await db
    .update(equipmentItems)
    .set({ manualFilePath: storageFilename!, updatedAt: now })
    .where(eq(equipmentItems.id, input.itemId));

  return {
    chunkCount: chunks.length,
    pageCount,
    message: `Ingested ${chunks.length} chunks from ${pageCount ?? '?'} pages.`,
  };
}

export async function reindexStoredManuals(): Promise<IngestResult> {
  return ingestEquipmentManuals();
}
