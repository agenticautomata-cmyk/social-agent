import { Hono } from 'hono';
import { z } from 'zod';
import {
  listMediaKits,
  getMediaKit,
  createMediaKit,
  updateMediaKit,
  deleteMediaKit,
  saveMediaKitFile,
  readMediaKitFile,
} from '@social-agent/core/sponsor-outreach';
import { enrichMediaKitAfterUpload } from '@social-agent/core/sponsor-outreach/media-kit-extract';

export const mediaKitsRoute = new Hono();

mediaKitsRoute.get('/', async (c) => {
  const activeOnly = c.req.query('active') === 'true';
  const kits = await listMediaKits(activeOnly);
  return c.json({ kits });
});

mediaKitsRoute.get('/files/:filename', async (c) => {
  const filename = c.req.param('filename');
  const file = await readMediaKitFile(filename);
  if (!file) return c.json({ error: 'not found' }, 404);

  return new Response(file.buffer, {
    headers: {
      'Content-Type': file.mimeType,
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
});

mediaKitsRoute.get('/:id', async (c) => {
  const kit = await getMediaKit(c.req.param('id'));
  if (!kit) return c.json({ error: 'not found' }, 404);
  return c.json({ kit });
});

const MediaKitSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  targetAudience: z.string().nullable().optional(),
  fileUrl: z.string().nullable().optional(),
  version: z.string().optional(),
  active: z.boolean().optional(),
});

async function parseMediaKitCreate(c: {
  req: {
    header: (name: string) => string | undefined;
    parseBody: () => Promise<Record<string, string | File>>;
    json: () => Promise<unknown>;
  };
}) {
  const contentType = c.req.header('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const body = await c.req.parseBody();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const description = typeof body.description === 'string' ? body.description : null;
    const targetAudience =
      typeof body.targetAudience === 'string' ? body.targetAudience : null;
    const fileUrl = typeof body.fileUrl === 'string' ? body.fileUrl.trim() : '';
    const version = typeof body.version === 'string' ? body.version : '1.0';
    const file = body.file instanceof File && body.file.size > 0 ? body.file : null;

    if (!name) {
      return { ok: false as const, status: 400 as const, error: 'name is required' };
    }

    if (!file && !fileUrl) {
      return {
        ok: false as const,
        status: 400 as const,
        error: 'Provide an uploaded file or a file URL.',
      };
    }

    if (file) {
      try {
        const saved = await saveMediaKitFile(file);
        const kit = await createMediaKit({
          name,
          description: description || null,
          targetAudience: targetAudience || null,
          fileUrl: saved.fileUrl,
          originalFilename: saved.originalFilename,
          mimeType: saved.mimeType,
          fileSize: saved.fileSize,
          storageFilename: saved.storageFilename,
          version,
        });
        const enriched = await enrichMediaKitAfterUpload({
          kitId: kit.id,
          mimeType: kit.mimeType,
          storageFilename: kit.storageFilename,
          existingDescription: kit.description,
        });
        if (enriched.description && enriched.description !== kit.description) {
          const updated = await updateMediaKit(kit.id, { description: enriched.description });
          return { ok: true as const, kit: updated ?? kit };
        }
        return { ok: true as const, kit };
      } catch (err) {
        return {
          ok: false as const,
          status: 400 as const,
          error: err instanceof Error ? err.message : 'Upload failed',
        };
      }
    }

    const kit = await createMediaKit({
      name,
      description: description || null,
      targetAudience: targetAudience || null,
      fileUrl: fileUrl || null,
      version,
    });
    return { ok: true as const, kit };
  }

  const body = await c.req.json();
  const parsed = MediaKitSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false as const, status: 400 as const, error: parsed.error.flatten() };
  }

  if (!parsed.data.fileUrl?.trim()) {
    return {
      ok: false as const,
      status: 400 as const,
      error: 'Provide an uploaded file or a file URL.',
    };
  }

  const kit = await createMediaKit(parsed.data);
  return { ok: true as const, kit };
}

mediaKitsRoute.post('/', async (c) => {
  try {
    const result = await parseMediaKitCreate(c);
    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json({ kit: result.kit }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create media kit';
    return c.json({ error: message }, 400);
  }
});

mediaKitsRoute.put('/:id', async (c) => {
  const body = await c.req.json();
  const parsed = MediaKitSchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const kit = await updateMediaKit(c.req.param('id'), parsed.data);
  if (!kit) return c.json({ error: 'not found' }, 404);
  return c.json({ kit });
});

mediaKitsRoute.delete('/:id', async (c) => {
  const deleted = await deleteMediaKit(c.req.param('id'));
  if (!deleted) return c.json({ error: 'not found' }, 404);
  return c.json({ ok: true });
});
