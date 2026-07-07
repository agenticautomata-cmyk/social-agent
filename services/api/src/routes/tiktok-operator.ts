import { Hono } from 'hono';
import { z } from 'zod';
import {
  buildSponsorProof,
  computeTikTokCommandCenter,
  createRepeatFormatTemplate,
  createRepostRemixPackage,
  createReplyVideoPackage,
  createSequelPackage,
  formatPackageForClipboard,
  generateOperatorBriefing,
  getPostPackage,
  getRecommendation,
  linkProofToMediaKit,
  markPackageHandedOff,
  markPackagePosted,
  preparePostPackage,
  schedulePackageReminder,
  updateCommentInsightStatus,
  updatePostPackage,
  updateRecommendationStatus,
  updateSponsorProof,
} from '@social-agent/core/tiktok-operator';

export const tiktokOperatorRoute = new Hono();

tiktokOperatorRoute.get('/command-center', async (c) => {
  try {
    const hub = await computeTikTokCommandCenter();
    return c.json(hub);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load TikTok command center';
    return c.json({ ok: false, error: message }, 500);
  }
});

tiktokOperatorRoute.post('/briefing/refresh', async (c) => {
  try {
    const hub = await computeTikTokCommandCenter();
    const briefing = await generateOperatorBriefing(hub.signals);
    return c.json(briefing);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Briefing refresh failed';
    return c.json({ ok: false, error: message }, 500);
  }
});

const RecStatusSchema = z.object({
  status: z.enum([
    'new',
    'accepted',
    'in_progress',
    'prepared',
    'scheduled',
    'completed',
    'dismissed',
  ]),
});

tiktokOperatorRoute.patch('/recommendations/:id', async (c) => {
  const body = await c.req.json();
  const parsed = RecStatusSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const rec = await updateRecommendationStatus(c.req.param('id'), parsed.data.status);
  if (!rec) return c.json({ error: 'Not found' }, 404);
  return c.json({ recommendation: rec });
});

tiktokOperatorRoute.get('/recommendations/:id', async (c) => {
  const rec = await getRecommendation(c.req.param('id'));
  if (!rec) return c.json({ error: 'Not found' }, 404);
  return c.json({ recommendation: rec });
});

const PrepareSchema = z.object({
  recommendationId: z.string().uuid().optional(),
  creatorVideoId: z.string().uuid().optional(),
  relatedContentItemId: z.string().uuid().optional(),
  contentTheme: z.string().optional(),
  formatLabel: z.string().optional(),
  reason: z.string().optional(),
  sequelOfVideoId: z.string().uuid().optional(),
  replyInsightId: z.string().uuid().optional(),
});

tiktokOperatorRoute.post('/packages/prepare', async (c) => {
  const body = await c.req.json();
  const parsed = PrepareSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  try {
    const pkg = await preparePostPackage(parsed.data);
    return c.json({ package: pkg });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Prepare failed';
    return c.json({ ok: false, error: message }, 500);
  }
});

tiktokOperatorRoute.get('/packages/:id', async (c) => {
  const pkg = await getPostPackage(c.req.param('id'));
  if (!pkg) return c.json({ error: 'Not found' }, 404);
  return c.json({ package: pkg, clipboard: formatPackageForClipboard(pkg) });
});

const PackagePatchSchema = z.object({
  hook: z.string().nullable().optional(),
  caption: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
  coverText: z.string().nullable().optional(),
  firstComment: z.string().nullable().optional(),
  disclosureText: z.string().nullable().optional(),
  suggestedPostTime: z.string().nullable().optional(),
  scheduledAt: z.string().nullable().optional(),
  sponsorAngle: z.string().nullable().optional(),
  contentTheme: z.string().nullable().optional(),
  formatLabel: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
  checklist: z.array(z.string()).optional(),
  shotList: z.array(z.string()).optional(),
  cta: z.string().nullable().optional(),
  locationBrandNotes: z.string().nullable().optional(),
  status: z
    .enum([
      'draft',
      'ready',
      'scheduled',
      'handed_off',
      'posted_manual',
      'posted_confirmed',
      'failed',
      'canceled',
    ])
    .optional(),
  mediaSourceType: z
    .enum(['none', 'local_reference', 'temporary_upload', 'external_url', 'tiktok_draft', 'cloud_asset'])
    .optional(),
  mediaReferenceText: z.string().nullable().optional(),
  handoffMethod: z
    .enum(['manual', 'deep_link', 'clipboard', 'future_tiktok_upload', 'future_direct_post'])
    .optional(),
});

tiktokOperatorRoute.patch('/packages/:id', async (c) => {
  const body = await c.req.json();
  const parsed = PackagePatchSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const pkg = await updatePostPackage(c.req.param('id'), parsed.data);
  if (!pkg) return c.json({ error: 'Not found' }, 404);
  return c.json({ package: pkg });
});

tiktokOperatorRoute.post('/packages/:id/handoff', async (c) => {
  const pkg = await markPackageHandedOff(c.req.param('id'));
  if (!pkg) return c.json({ error: 'Not found' }, 404);
  return c.json({ package: pkg });
});

const PostedSchema = z.object({ postedUrl: z.string().url().nullable().optional() });

tiktokOperatorRoute.post('/packages/:id/posted', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = PostedSchema.safeParse(body);
  const postedUrl = parsed.success ? parsed.data.postedUrl : undefined;
  const pkg = await markPackagePosted(c.req.param('id'), postedUrl);
  if (!pkg) return c.json({ error: 'Not found' }, 404);
  return c.json({ package: pkg });
});

const ScheduleSchema = z.object({ scheduledAt: z.string() });

tiktokOperatorRoute.post('/packages/:id/schedule', async (c) => {
  const body = await c.req.json();
  const parsed = ScheduleSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const pkg = await schedulePackageReminder(c.req.param('id'), parsed.data.scheduledAt);
  if (!pkg) return c.json({ error: 'Not found' }, 404);
  return c.json({ package: pkg });
});

const VideoIdSchema = z.object({
  creatorVideoId: z.string().uuid(),
  recommendationId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

tiktokOperatorRoute.post('/sponsor-proof', async (c) => {
  const body = await c.req.json();
  const parsed = VideoIdSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  try {
    const proof = await buildSponsorProof(
      parsed.data.creatorVideoId,
      undefined,
      parsed.data.notes,
    );
    return c.json({ proof });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Build proof failed';
    return c.json({ ok: false, error: message }, 500);
  }
});

const ProofPatchSchema = z.object({
  proofHeadline: z.string().optional(),
  proofSummary: z.string().optional(),
  notes: z.string().nullable().optional(),
  includedInMediaKit: z.boolean().optional(),
  mediaKitId: z.string().uuid().nullable().optional(),
});

tiktokOperatorRoute.patch('/sponsor-proof/:id', async (c) => {
  const body = await c.req.json();
  const parsed = ProofPatchSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const proof = await updateSponsorProof(c.req.param('id'), parsed.data);
  if (!proof) return c.json({ error: 'Not found' }, 404);
  return c.json({ proof });
});

const LinkKitSchema = z.object({ mediaKitId: z.string().uuid() });

tiktokOperatorRoute.post('/sponsor-proof/:id/media-kit', async (c) => {
  const body = await c.req.json();
  const parsed = LinkKitSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const proof = await linkProofToMediaKit(c.req.param('id'), parsed.data.mediaKitId);
  if (!proof) return c.json({ error: 'Not found' }, 404);
  return c.json({ proof });
});

tiktokOperatorRoute.post('/sequel', async (c) => {
  const body = await c.req.json();
  const parsed = VideoIdSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  try {
    const pkg = await createSequelPackage(
      parsed.data.creatorVideoId,
      parsed.data.recommendationId,
    );
    return c.json({ package: pkg });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sequel failed';
    return c.json({ ok: false, error: message }, 500);
  }
});

tiktokOperatorRoute.post('/repeat-format', async (c) => {
  const body = await c.req.json();
  const parsed = z.object({ creatorVideoId: z.string().uuid() }).safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  try {
    const template = await createRepeatFormatTemplate(parsed.data.creatorVideoId);
    return c.json({ template });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Repeat format failed';
    return c.json({ ok: false, error: message }, 500);
  }
});

tiktokOperatorRoute.post('/repost-remix', async (c) => {
  const body = await c.req.json();
  const parsed = VideoIdSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  try {
    const pkg = await createRepostRemixPackage(
      parsed.data.creatorVideoId,
      parsed.data.recommendationId,
    );
    return c.json({ package: pkg });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Repost remix failed';
    return c.json({ ok: false, error: message }, 500);
  }
});

const InsightStatusSchema = z.object({
  status: z.enum(['new', 'actioned', 'dismissed', 'handled']),
});

tiktokOperatorRoute.patch('/comment-insights/:id', async (c) => {
  const body = await c.req.json();
  const parsed = InsightStatusSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const insight = await updateCommentInsightStatus(c.req.param('id'), parsed.data.status);
  if (!insight) return c.json({ error: 'Not found' }, 404);
  return c.json({ insight });
});

tiktokOperatorRoute.post('/comment-insights/:id/reply-package', async (c) => {
  try {
    const pkg = await createReplyVideoPackage(c.req.param('id'));
    return c.json({ package: pkg });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reply package failed';
    return c.json({ ok: false, error: message }, 500);
  }
});

tiktokOperatorRoute.post('/recommendations/:id/prepare', async (c) => {
  const rec = await getRecommendation(c.req.param('id'));
  if (!rec) return c.json({ error: 'Not found' }, 404);
  try {
    let pkg;
    if (rec.recommendationType === 'repost_or_remix' && rec.creatorVideoId) {
      pkg = await createRepostRemixPackage(rec.creatorVideoId, rec.id);
    } else {
      pkg = await preparePostPackage({
        recommendationId: rec.id,
        creatorVideoId: rec.creatorVideoId ?? undefined,
        relatedContentItemId: rec.relatedContentItemId ?? undefined,
        contentTheme: (rec.metadata.contentCategory as string) ?? undefined,
        reason: rec.explanation,
      });
    }
    await updateRecommendationStatus(rec.id, 'prepared');
    return c.json({ package: pkg, recommendation: rec });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Prepare failed';
    return c.json({ ok: false, error: message }, 500);
  }
});

tiktokOperatorRoute.post('/recommendations/:id/accept', async (c) => {
  const rec = await updateRecommendationStatus(c.req.param('id'), 'accepted');
  if (!rec) return c.json({ error: 'Not found' }, 404);
  return c.json({ recommendation: rec });
});

tiktokOperatorRoute.post('/recommendations/:id/dismiss', async (c) => {
  const rec = await updateRecommendationStatus(c.req.param('id'), 'dismissed');
  if (!rec) return c.json({ error: 'Not found' }, 404);
  return c.json({ recommendation: rec });
});
