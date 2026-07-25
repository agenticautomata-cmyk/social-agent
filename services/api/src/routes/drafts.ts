import { Hono } from 'hono';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db, creatorDraftAssets } from '@social-agent/core';
import {
  createDraftFromText,
  listDraftDecisions,
  createPostPackageFromDraft,
  linkDraftToOpportunity,
  addDraftToPlanner,
  applyDraftDecisionAction,
  forgetDraft,
  queueDraftProcessing,
  processDraftAsset,
  refreshDraftPostingAdvice,
  humanDraftTitle,
  looksLikeDeviceFilename,
} from '@social-agent/core/draft-intelligence';
import { resolveOperatorCreatorId } from '@social-agent/core/tiktok-operator';

export const draftsRoute = new Hono();

function serializeDraft(row: typeof creatorDraftAssets.$inferSelect) {
  const rec = row.postingRecommendationJson as Record<string, unknown> | null;
  const displayTitle =
    humanDraftTitle({
      draftTitle: row.draftTitle,
      suggestedCaption: row.suggestedCaption,
      overallSummary: row.overallSummary,
      hookAssessment: row.hookAssessment,
    }) ?? 'untitled draft';
  return {
    id: row.id,
    creatorId: row.creatorId,
    sourceChannel: row.sourceChannel,
    sourceType: row.sourceType,
    shareIntakeId: row.shareIntakeId,
    draftTitle: looksLikeDeviceFilename(row.draftTitle) ? displayTitle : row.draftTitle,
    displayTitle,
    userNote: row.userNote,
    overallSummary: row.overallSummary,
    visualSummary: row.visualSummary,
    audioSummary: row.audioSummary,
    transcriptText: row.transcriptText,
    contextLimitations: row.contextLimitations,
    hookAssessment: row.hookAssessment,
    pacingAssessment: row.pacingAssessment,
    visualQualityNotes: row.visualQualityNotes,
    suggestedCaption: row.suggestedCaption,
    suggestedHashtagsJson: row.suggestedHashtagsJson,
    suggestedFirstComment: row.suggestedFirstComment,
    suggestedPostWindow: row.suggestedPostWindow,
    readinessScore: row.readinessScore,
    postNowScore: row.postNowScore,
    sponsorRelevanceScore: row.sponsorRelevanceScore,
    opportunityMatchScore: row.opportunityMatchScore,
    confidenceLevel: row.confidenceLevel,
    postingRecommendation: rec,
    opportunityMatch: row.opportunityMatchJson,
    frameSummariesJson: row.frameSummariesJson,
    detectedProductsJson: row.detectedProductsJson,
    detectedBrandsJson: row.detectedBrandsJson,
    detectedLocationsJson: row.detectedLocationsJson,
    detectedContentTheme: row.detectedContentTheme,
    status: row.status,
    processingError: row.processingError,
    linkedOpportunityId: row.linkedOpportunityId,
    linkedPlannerItemId: row.linkedPlannerItemId,
    linkedPostPackageId: row.linkedPostPackageId,
    linkedTiktokVideoId: row.linkedTiktokVideoId,
    originalFilename: row.originalFilename,
    fileSize: row.fileSize,
    durationSeconds: row.durationSeconds,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    analyzedAt: row.analyzedAt?.toISOString() ?? null,
    lastDiscussedAt: row.lastDiscussedAt?.toISOString() ?? null,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    postedAt: row.postedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    suggestedAction: rec?.recommended_action ?? null,
    shouldPost: rec?.should_post ?? null,
  };
}

draftsRoute.get('/', async (c) => {
  const status = c.req.query('status');
  const creatorId = await resolveOperatorCreatorId().catch(() => null);
  if (!creatorId) return c.json({ items: [] });

  const conditions = [eq(creatorDraftAssets.creatorId, creatorId)];
  if (status) {
    const statuses = status.split(',').map((s) => s.trim()).filter(Boolean);
    if (statuses.length === 1) {
      conditions.push(eq(creatorDraftAssets.status, statuses[0] as typeof creatorDraftAssets.$inferSelect.status));
    } else if (statuses.length > 1) {
      conditions.push(
        inArray(creatorDraftAssets.status, statuses as Array<typeof creatorDraftAssets.$inferSelect.status>),
      );
    }
  } else {
    conditions.push(
      inArray(creatorDraftAssets.status, [
        'received',
        'processing',
        'analyzed',
        'needs_review',
        'ready_to_post',
        'hold',
        'revise',
        'scheduled',
      ]),
    );
  }

  const rows = await db
    .select()
    .from(creatorDraftAssets)
    .where(and(...conditions))
    .orderBy(desc(creatorDraftAssets.updatedAt))
    .limit(100);

  return c.json({ items: rows.map(serializeDraft) });
});

draftsRoute.get('/:id', async (c) => {
  const id = c.req.param('id');
  const row = await db.query.creatorDraftAssets.findFirst({
    where: eq(creatorDraftAssets.id, id),
  });
  if (!row) return c.json({ error: 'not_found' }, 404);
  const decisions = await listDraftDecisions(id);
  return c.json({
    draft: serializeDraft(row),
    decisions: decisions.map((d) => ({
      id: d.id,
      decisionType: d.decisionType,
      decisionSummary: d.decisionSummary,
      reason: d.reason,
      decidedBy: d.decidedBy,
      scheduledFor: d.scheduledFor?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
    })),
  });
});

const TextDraftSchema = z.object({
  text: z.string().min(1),
  title: z.string().optional(),
  userNote: z.string().optional(),
});

draftsRoute.post('/from-text', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = TextDraftSchema.safeParse(body ?? {});
  if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);

  const id = await createDraftFromText({
    text: parsed.data.text,
    title: parsed.data.title,
    userNote: parsed.data.userNote,
  });
  await queueDraftProcessing(id);
  const row = await db.query.creatorDraftAssets.findFirst({ where: eq(creatorDraftAssets.id, id) });
  return c.json({ draftId: id, draft: row ? serializeDraft(row) : null }, 202);
});

draftsRoute.post('/:id/retry', async (c) => {
  const id = c.req.param('id');
  await queueDraftProcessing(id);
  await processDraftAsset(id);
  const row = await db.query.creatorDraftAssets.findFirst({ where: eq(creatorDraftAssets.id, id) });
  return c.json({ ok: true, draft: row ? serializeDraft(row) : null });
});

draftsRoute.post('/:id/refresh-posting-advice', async (c) => {
  const id = c.req.param('id');
  const result = await refreshDraftPostingAdvice(id);
  if (!result) return c.json({ error: 'not_ready' }, 400);
  const row = await db.query.creatorDraftAssets.findFirst({ where: eq(creatorDraftAssets.id, id) });
  return c.json({
    ok: true,
    suggestedPostWindow: result.suggestedPostWindow,
    draft: row ? serializeDraft(row) : null,
  });
});

draftsRoute.post('/:id/create-post-package', async (c) => {
  const id = c.req.param('id');
  const packageId = await createPostPackageFromDraft(id);
  if (!packageId) return c.json({ error: 'not_ready' }, 400);
  return c.json({ ok: true, postPackageId: packageId });
});

const LinkOppSchema = z.object({ opportunityId: z.string().uuid() });

draftsRoute.post('/:id/link-opportunity', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = LinkOppSchema.safeParse(body ?? {});
  if (!parsed.success) return c.json({ error: 'invalid' }, 400);
  const ok = await linkDraftToOpportunity(id, parsed.data.opportunityId);
  if (!ok) return c.json({ error: 'failed' }, 400);
  return c.json({ ok: true });
});

draftsRoute.post('/:id/add-to-planner', async (c) => {
  const id = c.req.param('id');
  const plannerItemId = await addDraftToPlanner(id);
  if (!plannerItemId) return c.json({ error: 'failed' }, 400);
  return c.json({ ok: true, plannerItemId });
});

const DecisionSchema = z.object({
  action: z.enum(['hold', 'revise', 'scrap', 'schedule', 'mark_posted']),
  reason: z.string().optional(),
  scheduledFor: z.string().datetime().optional(),
});

draftsRoute.post('/:id/decision', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = DecisionSchema.safeParse(body ?? {});
  if (!parsed.success) return c.json({ error: 'invalid' }, 400);
  const ok = await applyDraftDecisionAction(id, parsed.data.action, {
    reason: parsed.data.reason,
    scheduledFor: parsed.data.scheduledFor,
  });
  if (!ok) return c.json({ error: 'failed' }, 404);
  return c.json({ ok: true });
});

draftsRoute.post('/:id/forget', async (c) => {
  const id = c.req.param('id');
  const ok = await forgetDraft(id);
  if (!ok) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});
