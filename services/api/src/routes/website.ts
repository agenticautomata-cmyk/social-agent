import { Hono } from 'hono';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db, websiteSections } from '@social-agent/core';
import {
  listWebsiteMedia,
  getWebsiteMedia,
  uploadWebsiteMedia,
  readWebsiteMediaFile,
} from '@social-agent/core/website-manager';
import {
  listWebsiteDrafts,
  getWebsiteDraft,
  updateWebsiteDraft,
  approveWebsiteDraft,
  rejectWebsiteDraft,
} from '@social-agent/core/website-manager';
import { publishWebsiteDraft, unpublishWebsiteItem } from '@social-agent/core/website-manager';
import { getWebsiteSettings, updateWebsiteSettings } from '@social-agent/core/website-manager';
import { applyWebsiteDraftRevision } from '@social-agent/core/website-manager';
import { startWebsiteDraftRevisionJob, getWebsiteReviseJob } from '@social-agent/core/website-manager';
import { getWebsiteAnalysisJob } from '@social-agent/core/website-manager';
import { formatRevisionError } from '@social-agent/core/website-manager';

export const websiteRoute = new Hono();

websiteRoute.get('/sections', async (c) => {
  const rows = await db
    .select()
    .from(websiteSections)
    .where(eq(websiteSections.enabled, true))
    .orderBy(asc(websiteSections.sortOrder));
  return c.json({ ok: true, sections: rows });
});

websiteRoute.get('/media', async (c) => {
  const media = await listWebsiteMedia(100);
  return c.json({ ok: true, media });
});

websiteRoute.post('/media', async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body.file instanceof File ? body.file : null;
    if (!file || file.size <= 0) {
      return c.json({ ok: false, error: 'file is required' }, 400);
    }
    const uploadedBy = typeof body.uploadedBy === 'string' ? body.uploadedBy : 'kellie';
    const result = await uploadWebsiteMedia({ file, uploadedBy });
    const draft = result.draftId ? await getWebsiteDraft(result.draftId) : null;
    return c.json({ ok: true, ...result, draft }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return c.json({ ok: false, error: message }, 400);
  }
});

websiteRoute.get('/media/:id', async (c) => {
  const media = await getWebsiteMedia(c.req.param('id'));
  if (!media) return c.json({ ok: false, error: 'not found' }, 404);
  return c.json({ ok: true, media });
});

websiteRoute.get('/files/:filename', async (c) => {
  const file = await readWebsiteMediaFile(c.req.param('filename'));
  if (!file) return c.json({ error: 'not found' }, 404);
  return new Response(file.buffer, {
    headers: {
      'Content-Type': file.mimeType,
      'Cache-Control': 'private, max-age=3600',
    },
  });
});

websiteRoute.get('/drafts', async (c) => {
  const status = c.req.query('status') as 'draft' | 'approved' | 'published' | 'rejected' | undefined;
  const drafts = await listWebsiteDrafts(status);
  return c.json({ ok: true, drafts });
});

websiteRoute.get('/drafts/:id', async (c) => {
  const draft = await getWebsiteDraft(c.req.param('id'));
  if (!draft) return c.json({ ok: false, error: 'not found' }, 404);
  return c.json({ ok: true, draft });
});

const DraftPatchSchema = z.object({
  title: z.string().min(1).optional(),
  sectionId: z.string().min(1).optional(),
  caption: z.string().nullable().optional(),
  altText: z.string().nullable().optional(),
  headline: z.string().nullable().optional(),
  ctaLabel: z.string().nullable().optional(),
  ctaHref: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  category: z.string().nullable().optional(),
  contentType: z.string().nullable().optional(),
  suggestedPlacement: z.string().nullable().optional(),
});

websiteRoute.patch('/drafts/:id', async (c) => {
  try {
    const body = DraftPatchSchema.parse(await c.req.json());
    const draft = await updateWebsiteDraft(c.req.param('id'), body);
    if (!draft) return c.json({ ok: false, error: 'not found' }, 404);
    return c.json({ ok: true, draft });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid draft update';
    return c.json({ ok: false, error: message }, 400);
  }
});

websiteRoute.post('/drafts/:id/approve', async (c) => {
  const draft = await approveWebsiteDraft(c.req.param('id'));
  if (!draft) return c.json({ ok: false, error: 'not found' }, 404);
  return c.json({ ok: true, draft });
});

websiteRoute.post('/drafts/:id/reject', async (c) => {
  const body = z.object({ reason: z.string().optional() }).optional().parse(await c.req.json().catch(() => ({})));
  const draft = await rejectWebsiteDraft(c.req.param('id'), body?.reason);
  if (!draft) return c.json({ ok: false, error: 'not found' }, 404);
  return c.json({ ok: true, draft });
});

websiteRoute.post('/drafts/:id/revise', async (c) => {
  try {
    const body = z
      .object({
        message: z.string().max(4000).default(''),
        async: z.boolean().optional(),
      })
      .parse(await c.req.json());
    if (body.async !== false) {
      const job = startWebsiteDraftRevisionJob(c.req.param('id'), body.message);
      return c.json({ ok: true, jobId: job.id, status: job.status }, 202);
    }
    const result = await applyWebsiteDraftRevision(c.req.param('id'), body.message);
    return c.json({ ok: true, ...result });
  } catch (err) {
    const message = formatRevisionError(err);
    return c.json({ ok: false, error: message }, 400);
  }
});

websiteRoute.get('/drafts/revise-jobs/:jobId', async (c) => {
  const job = getWebsiteReviseJob(c.req.param('jobId'));
  if (!job) return c.json({ ok: false, error: 'Job not found' }, 404);
  return c.json({ ok: true, job });
});

websiteRoute.get('/media/analysis-jobs/:jobId', async (c) => {
  const job = getWebsiteAnalysisJob(c.req.param('jobId'));
  if (!job) return c.json({ ok: false, error: 'Job not found' }, 404);
  return c.json({ ok: true, job });
});

websiteRoute.post('/drafts/:id/publish', async (c) => {
  const result = await publishWebsiteDraft(c.req.param('id'));
  if (!result.ok) return c.json({ ok: false, error: result.error }, 400);
  const draft = await getWebsiteDraft(c.req.param('id'));
  return c.json({ ok: true, publishedId: result.publishedId, draft });
});

websiteRoute.post('/published/:id/unpublish', async (c) => {
  const body = z.object({ confirm: z.literal(true) }).parse(await c.req.json());
  const result = await unpublishWebsiteItem(c.req.param('id'), body.confirm);
  if (!result.ok) return c.json({ ok: false, error: result.error }, 400);
  return c.json({ ok: true });
});

websiteRoute.get('/settings', async (c) => {
  const settings = await getWebsiteSettings();
  return c.json({ ok: true, settings });
});

websiteRoute.put('/settings', async (c) => {
  try {
    const body = z
      .object({
        siteTitle: z.string().min(1).optional(),
        siteTagline: z.string().nullable().optional(),
        heroHeadline: z.string().nullable().optional(),
        heroSubheadline: z.string().nullable().optional(),
        contactEmail: z.string().nullable().optional(),
        bookingHref: z.string().nullable().optional(),
        mediaKitHref: z.string().nullable().optional(),
        maxUploadBytes: z
          .number()
          .int()
          .min(1 * 1024 * 1024, 'Upload limit must be at least 1 MB')
          .max(500 * 1024 * 1024, 'Upload limit cannot exceed 500 MB')
          .optional(),
      })
      .parse(await c.req.json());
    const settings = await updateWebsiteSettings(body);
    return c.json({ ok: true, settings });
  } catch (err) {
    if (err instanceof z.ZodError) {
      const message = err.errors.map((e) => e.message).join(' — ') || 'Invalid settings';
      return c.json({ ok: false, error: message }, 400);
    }
    const message = err instanceof Error ? err.message : 'Invalid settings';
    return c.json({ ok: false, error: message }, 400);
  }
});
