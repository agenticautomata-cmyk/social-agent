import { Hono } from 'hono';
import { z } from 'zod';
import {
  backfillOpeningsRadar,
  dismissOpening,
  getOpeningDetail,
  ingestOpeningRoundup,
  listOpenings,
  markOpeningStatus,
  mergeOpeningLocations,
  OPENING_LIFECYCLE_STATUSES,
  ensureKcinsidersOpeningsWatchers,
  runOpeningsRadarWatcherCheck,
} from '@social-agent/core/openings-radar';

export const openingsRadarRoute = new Hono();

openingsRadarRoute.get('/', async (c) => {
  const q = c.req.query('q') ?? undefined;
  const status = c.req.query('status') ?? undefined;
  const filter = c.req.query('filter') ?? undefined;
  const city = c.req.query('city') ?? undefined;
  const neighborhood = c.req.query('neighborhood') ?? undefined;
  const sort = (c.req.query('sort') as 'urgency' | 'discovered' | 'expected' | undefined) ?? 'urgency';
  const includeDismissed = c.req.query('includeDismissed') === '1';
  const limit = Number(c.req.query('limit') ?? 100);
  const result = await listOpenings({
    q,
    status,
    filter,
    city,
    neighborhood,
    sort,
    includeDismissed,
    limit,
  });
  return c.json({ ok: true, ...result });
});

openingsRadarRoute.get('/:id', async (c) => {
  const detail = await getOpeningDetail(c.req.param('id'));
  if (!detail) return c.json({ ok: false, error: 'Not found' }, 404);
  return c.json({ ok: true, ...detail });
});

openingsRadarRoute.post('/:id/dismiss', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const ok = await dismissOpening(c.req.param('id'), (body as { reason?: string }).reason);
  return c.json({ ok });
});

const StatusSchema = z.object({
  status: z.enum(OPENING_LIFECYCLE_STATUSES),
  evidence: z.string().max(1000).optional(),
});

openingsRadarRoute.post('/:id/status', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = StatusSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'Invalid status' }, 400);
  const ok = await markOpeningStatus(c.req.param('id'), parsed.data.status, parsed.data.evidence);
  return c.json({ ok });
});

const MergeSchema = z.object({
  keepId: z.string().uuid(),
  mergeId: z.string().uuid(),
});

openingsRadarRoute.post('/merge', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = MergeSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'Invalid merge payload' }, 400);
  const result = await mergeOpeningLocations(parsed.data);
  return c.json(result, result.ok ? 200 : 400);
});

const IngestSchema = z.object({
  subject: z.string().min(1).max(500),
  bodyText: z.string().min(1).max(200_000),
  urls: z.array(z.string().url()).optional(),
  socialPostUrl: z.string().url().optional(),
  gmailMessageId: z.string().optional(),
  dryRun: z.boolean().optional(),
  fetchArticle: z.boolean().optional(),
  /** force is refused in production API — live path must recognize roundups honestly */
  force: z.boolean().optional(),
  channel: z.enum(['email', 'article', 'rss', 'social', 'manual']).optional(),
});

openingsRadarRoute.post('/ingest', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = IngestSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'Invalid ingest payload' }, 400);
  if (parsed.data.force) {
    return c.json(
      { ok: false, error: 'force:true is not allowed — use ordinary roundup recognition' },
      400,
    );
  }
  const result = await ingestOpeningRoundup({
    subject: parsed.data.subject,
    bodyText: parsed.data.bodyText,
    urls: parsed.data.urls ?? [],
    socialPostUrl: parsed.data.socialPostUrl,
    gmailMessageId: parsed.data.gmailMessageId,
    dryRun: parsed.data.dryRun,
    fetchArticle: parsed.data.fetchArticle ?? false,
    force: false,
    channel: parsed.data.channel ?? 'manual',
  });
  return c.json({ ok: true, result });
});

openingsRadarRoute.post('/backfill', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const report = await backfillOpeningsRadar({
    sinceDays: Number((body as { sinceDays?: number }).sinceDays ?? 90),
    limit: Number((body as { limit?: number }).limit ?? 40),
    dryRun: Boolean((body as { dryRun?: boolean }).dryRun),
    fetchArticle: (body as { fetchArticle?: boolean }).fetchArticle ?? false,
  });
  return c.json({ ok: true, report });
});

/** Ensure Substack/Facebook watchers and run ordinary check (no fixture). */
openingsRadarRoute.post('/check-configured', async (c) => {
  const ensured = await ensureKcinsidersOpeningsWatchers();
  const first = await runOpeningsRadarWatcherCheck(ensured.substackFeedWatcherId, 'manual');
  const second = await runOpeningsRadarWatcherCheck(ensured.substackFeedWatcherId, 'manual');
  const facebook = ensured.facebookEvidenceWatcherId
    ? await runOpeningsRadarWatcherCheck(ensured.facebookEvidenceWatcherId, 'manual')
    : null;
  return c.json({
    ok: true,
    ensured,
    substackFirst: first,
    substackSecond: second,
    facebook,
  });
});
