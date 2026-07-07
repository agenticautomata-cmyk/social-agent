import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import {
  playbookSources,
  playbookDocuments,
  playbookChunks,
} from '../schema.js';
import { SEED_PLAYBOOK_SOURCES } from './constants.js';
import { findPlaybookDocsInDownloads } from './locate.js';
import { extractAndChunkDocument } from '../equipment-expert/pdf-chunk.js';
import { copyPlaybookToStorage, readPlaybookFile } from './storage.js';
import { seedPlaybookQuickActions, seedPlaybookChecklists } from './seed-data.js';

export type IngestPlaybookResult = {
  ok: boolean;
  items: Array<{
    slug: string;
    name: string;
    documentFound: boolean;
    sourcePath: string | null;
    chunkCount: number;
    pageCount: number | null;
    message: string;
  }>;
  errors: string[];
};

export async function ingestPlaybookSources(): Promise<IngestPlaybookResult> {
  const errors: string[] = [];
  const items: IngestPlaybookResult['items'] = [];

  await seedPlaybookQuickActions();
  await seedPlaybookChecklists();

  const located = await findPlaybookDocsInDownloads();
  const locatedBySlug = new Map(located.map((l) => [l.sourceSlug, l]));

  for (const seed of SEED_PLAYBOOK_SOURCES) {
    try {
      const source = await upsertPlaybookSource(seed);
      const locatedDoc = locatedBySlug.get(seed.slug);

      if (!locatedDoc) {
        const existingDoc = await db.query.playbookDocuments.findFirst({
          where: eq(playbookDocuments.sourceId, source.id),
        });
        items.push({
          slug: seed.slug,
          name: seed.name,
          documentFound: !!existingDoc,
          sourcePath: existingDoc?.sourcePath ?? null,
          chunkCount: existingDoc?.chunkCount ?? 0,
          pageCount: existingDoc?.pageCount ?? null,
          message: existingDoc
            ? 'Document already ingested from storage.'
            : 'Source not found in ~/Downloads — registered, ingest when ready.',
        });
        continue;
      }

      const result = await ingestDocumentForSource({
        sourceId: source.id,
        seed,
        sourcePath: locatedDoc.sourcePath,
        originalFilename: locatedDoc.originalFilename,
        sourceKind: locatedDoc.sourceKind,
      });

      items.push({
        slug: seed.slug,
        name: seed.name,
        documentFound: true,
        sourcePath: locatedDoc.sourcePath,
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
        documentFound: false,
        sourcePath: null,
        chunkCount: 0,
        pageCount: null,
        message: msg,
      });
    }
  }

  return { ok: errors.length === 0, items, errors };
}

async function upsertPlaybookSource(seed: (typeof SEED_PLAYBOOK_SOURCES)[number]) {
  const existing = await db.query.playbookSources.findFirst({
    where: eq(playbookSources.slug, seed.slug),
  });
  if (existing) {
    const [updated] = await db
      .update(playbookSources)
      .set({
        name: seed.name,
        category: seed.category,
        notes: seed.notes,
        updatedAt: new Date(),
      })
      .where(eq(playbookSources.id, existing.id))
      .returning();
    return updated!;
  }

  const [created] = await db
    .insert(playbookSources)
    .values({
      slug: seed.slug,
      name: seed.name,
      category: seed.category,
      notes: seed.notes,
    })
    .returning();
  return created!;
}

async function ingestDocumentForSource(input: {
  sourceId: string;
  seed: (typeof SEED_PLAYBOOK_SOURCES)[number];
  sourcePath: string;
  originalFilename: string;
  sourceKind: 'pdf' | 'html';
}): Promise<{ chunkCount: number; pageCount: number | null; message: string }> {
  const existingDoc = await db.query.playbookDocuments.findFirst({
    where: eq(playbookDocuments.sourceId, input.sourceId),
  });

  const copied = await copyPlaybookToStorage({
    sourcePath: input.sourcePath,
    originalFilename: input.originalFilename,
    storageFilename: existingDoc?.storageFilename,
  });

  const file = await readPlaybookFile(copied.storageFilename);
  if (!file) throw new Error('Stored playbook file missing');

  const { pageCount, chunks } = await extractAndChunkDocument({
    buffer: file.buffer,
    sourceKind: input.sourceKind,
  });
  if (chunks.length === 0) throw new Error('No text extracted from document');

  const now = new Date();
  let documentId = existingDoc?.id;

  if (existingDoc) {
    await db
      .delete(playbookChunks)
      .where(eq(playbookChunks.documentId, existingDoc.id));
    await db
      .update(playbookDocuments)
      .set({
        title: input.seed.documentTitle,
        originalFilename: input.originalFilename,
        fileSize: copied.fileSize,
        pageCount,
        chunkCount: chunks.length,
        ingestedAt: now,
        sourcePath: input.sourcePath,
        updatedAt: now,
      })
      .where(eq(playbookDocuments.id, existingDoc.id));
    documentId = existingDoc.id;
  } else {
    const [doc] = await db
      .insert(playbookDocuments)
      .values({
        sourceId: input.sourceId,
        title: input.seed.documentTitle,
        originalFilename: input.originalFilename,
        storageFilename: copied.storageFilename,
        fileSize: copied.fileSize,
        pageCount,
        chunkCount: chunks.length,
        ingestedAt: now,
        sourcePath: input.sourcePath,
      })
      .returning();
    documentId = doc!.id;
  }

  await db.insert(playbookChunks).values(
    chunks.map((c) => ({
      documentId: documentId!,
      sourceId: input.sourceId,
      pageNumber: c.pageNumber,
      sectionTitle: c.sectionTitle,
      chunkIndex: c.chunkIndex,
      chunkText: c.chunkText,
    })),
  );

  return {
    chunkCount: chunks.length,
    pageCount,
    message: `Ingested ${chunks.length} chunks from ${pageCount ?? '?'} sections.`,
  };
}
