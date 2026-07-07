import { Hono } from 'hono';
import { z } from 'zod';
import { eq, asc } from 'drizzle-orm';
import { db, equipmentManualChunks } from '@social-agent/core';
import {
  listEquipmentItems,
  listEquipmentManuals,
  getEquipmentManualDetail,
  listTroubleshooting,
} from '@social-agent/core/equipment-expert';
import { ingestEquipmentManuals } from '@social-agent/core/equipment-expert';
import { askEquipmentExpert, generateChecklistWithBenson } from '@social-agent/core/equipment-expert';
import { listEquipmentChecklists, getEquipmentChecklistBySlug } from '@social-agent/core/equipment-expert';
import {
  listEquipmentReferenceVideos,
  markReferenceVideoWatched,
  seedEquipmentReferenceVideos,
} from '@social-agent/core/equipment-expert';

export const equipmentRoute = new Hono();

equipmentRoute.get('/', async (c) => {
  const items = await listEquipmentItems();
  const troubleshooting = await listTroubleshooting();
  return c.json({ ok: true, items, troubleshooting });
});

equipmentRoute.get('/manuals', async (c) => {
  const manuals = await listEquipmentManuals();
  return c.json({ ok: true, manuals });
});

equipmentRoute.get('/manuals/:id', async (c) => {
  const detail = await getEquipmentManualDetail(c.req.param('id'));
  if (!detail?.manual) return c.json({ ok: false, error: 'not found' }, 404);

  const chunks = await db
    .select({
      id: equipmentManualChunks.id,
      pageNumber: equipmentManualChunks.pageNumber,
      sectionTitle: equipmentManualChunks.sectionTitle,
      chunkIndex: equipmentManualChunks.chunkIndex,
      chunkText: equipmentManualChunks.chunkText,
    })
    .from(equipmentManualChunks)
    .where(eq(equipmentManualChunks.manualId, detail.manual.id))
    .orderBy(asc(equipmentManualChunks.chunkIndex))
    .limit(200);

  return c.json({
    ok: true,
    manual: {
      id: detail.manual.id,
      title: detail.manual.title,
      equipmentName: detail.item?.name,
      equipmentSlug: detail.item?.slug,
      chunkCount: detail.manual.chunkCount,
      pageCount: detail.manual.pageCount,
      ingestedAt: detail.manual.ingestedAt?.toISOString() ?? null,
    },
    chunks: chunks.map((ch) => ({
      id: ch.id,
      pageNumber: ch.pageNumber,
      sectionTitle: ch.sectionTitle,
      chunkIndex: ch.chunkIndex,
      preview: ch.chunkText.slice(0, 220) + (ch.chunkText.length > 220 ? '…' : ''),
    })),
  });
});

equipmentRoute.post('/ingest', async (c) => {
  try {
    const result = await ingestEquipmentManuals();
    const items = await listEquipmentItems();
    return c.json({ ok: result.ok, result, items });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ingest failed';
    return c.json({ ok: false, error: message }, 500);
  }
});

equipmentRoute.post('/ask', async (c) => {
  try {
    const body = z
      .object({
        question: z.string().min(1).max(4000),
        equipmentSlug: z.string().nullable().optional(),
        shootType: z.string().nullable().optional(),
        mode: z.enum(['general', 'troubleshoot', 'setup']).optional(),
      })
      .parse(await c.req.json());

    const response = await askEquipmentExpert({
      question: body.question,
      equipmentSlug: body.equipmentSlug,
      shootType: body.shootType,
      mode: body.mode,
    });
    return c.json({ ok: true, ...response });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ask failed';
    return c.json({ ok: false, error: message }, 400);
  }
});

equipmentRoute.get('/checklists', async (c) => {
  const checklists = await listEquipmentChecklists();
  return c.json({ ok: true, checklists });
});

equipmentRoute.get('/checklists/:slug', async (c) => {
  const checklist = await getEquipmentChecklistBySlug(c.req.param('slug'));
  if (!checklist) return c.json({ ok: false, error: 'not found' }, 404);
  return c.json({ ok: true, checklist });
});

equipmentRoute.post('/checklists/generate', async (c) => {
  try {
    const body = z
      .object({
        shootType: z.string().min(1),
        notes: z.string().optional(),
      })
      .parse(await c.req.json());
    const result = await generateChecklistWithBenson(body);
    return c.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generate failed';
    return c.json({ ok: false, error: message }, 400);
  }
});

equipmentRoute.get('/troubleshooting', async (c) => {
  const items = await listTroubleshooting();
  return c.json({ ok: true, items });
});

equipmentRoute.get('/reference-videos', async (c) => {
  const equipmentSlug = c.req.query('equipmentSlug') ?? null;
  const videos = await listEquipmentReferenceVideos({ equipmentSlug });
  return c.json({ ok: true, videos });
});

equipmentRoute.patch('/reference-videos/:slug', async (c) => {
  try {
    const body = z
      .object({
        watchedByKellie: z.boolean(),
      })
      .parse(await c.req.json());
    const video = await markReferenceVideoWatched(c.req.param('slug'), body.watchedByKellie);
    if (!video) return c.json({ ok: false, error: 'not found' }, 404);
    return c.json({ ok: true, video });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed';
    return c.json({ ok: false, error: message }, 400);
  }
});

equipmentRoute.post('/reference-videos/seed', async (c) => {
  try {
    const result = await seedEquipmentReferenceVideos();
    const videos = await listEquipmentReferenceVideos();
    return c.json({ ok: true, result, videos });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Seed failed';
    return c.json({ ok: false, error: message }, 500);
  }
});
