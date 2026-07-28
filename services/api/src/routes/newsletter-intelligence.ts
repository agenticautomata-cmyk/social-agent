import { Hono } from 'hono';
import { z } from 'zod';
import { ZodError } from 'zod';
import { env } from '@social-agent/core';
import {
  computeSourceRates,
  getNewsletterSource,
  listNewsletterSources,
  runNewsletterBackfill,
  setNewsletterSourceCategory,
  setNewsletterSourceStatus,
  NEWSLETTER_CATEGORIES,
  persistApprovedNewsletterBackfill,
  APPROVED_CORPUS_HASH,
} from '@social-agent/core/newsletter-intelligence';
import { isControlTowerAuthorized, controlTowerUnauthorizedMessage } from '../lib/admin-auth.js';
import { resolve } from 'node:path';

export const newsletterIntelligenceRoute = new Hono();

function jsonError(
  c: { json: (body: unknown, status: 400 | 401 | 403 | 404 | 500) => Response },
  status: 400 | 401 | 403 | 404 | 500,
  code: string,
  message: string,
) {
  return c.json({ ok: false, error: { code, message } }, status);
}

newsletterIntelligenceRoute.use('*', async (c, next) => {
  const key = c.req.header('x-benson-admin-key');
  if (!isControlTowerAuthorized(key)) {
    return jsonError(c, 401, 'UNAUTHORIZED', controlTowerUnauthorizedMessage());
  }
  await next();
});

newsletterIntelligenceRoute.onError((err, c) => {
  if (err instanceof ZodError) {
    return jsonError(c, 400, 'VALIDATION_ERROR', err.issues.map((i) => i.message).join('; '));
  }
  console.error('[newsletter-intelligence]', err);
  return jsonError(
    c,
    500,
    'INTERNAL_ERROR',
    err instanceof Error ? err.message : 'Internal server error',
  );
});

/** Public-safe source projection — never include raw email bodies or OAuth material. */
function projectSource(source: Awaited<ReturnType<typeof listNewsletterSources>>[number]) {
  return {
    id: source.id,
    senderDomain: source.senderDomain,
    senderEmail: source.senderEmail,
    displayName: source.senderName,
    category: source.category,
    status: source.status,
    emailsProcessed: source.emailsProcessed,
    entitiesExtracted: source.entitiesExtracted,
    occurrencesExtracted: source.occurrencesExtracted,
    lastSeenAt: source.lastEmailReceivedAt,
    rates: computeSourceRates(source),
  };
}

newsletterIntelligenceRoute.get('/sources', async (c) => {
  const sources = await listNewsletterSources();
  return c.json({
    ok: true,
    demoMode: env.DEMO_MODE,
    count: sources.length,
    sources: sources.map(projectSource),
  });
});

newsletterIntelligenceRoute.get('/sources/:id', async (c) => {
  const source = await getNewsletterSource(c.req.param('id'));
  if (!source) return jsonError(c, 404, 'NOT_FOUND', 'Newsletter source not found');
  return c.json({ ok: true, source: projectSource(source) });
});

const StatusSchema = z.object({
  status: z.enum(['enabled', 'paused', 'ignored', 'suggested']),
});

newsletterIntelligenceRoute.post('/sources/:id/status', async (c) => {
  const body = StatusSchema.parse(await c.req.json());
  const source = await setNewsletterSourceStatus(c.req.param('id'), body.status);
  if (!source) return jsonError(c, 404, 'NOT_FOUND', 'Newsletter source not found');
  return c.json({ ok: true, source: projectSource(source) });
});

const CategorySchema = z.object({
  category: z.enum(NEWSLETTER_CATEGORIES as unknown as [string, ...string[]]),
});

newsletterIntelligenceRoute.post('/sources/:id/category', async (c) => {
  const body = CategorySchema.parse(await c.req.json());
  const source = await setNewsletterSourceCategory(c.req.param('id'), body.category as never);
  if (!source) return jsonError(c, 404, 'NOT_FOUND', 'Newsletter source not found');
  return c.json({ ok: true, source: projectSource(source) });
});

const BackfillSchema = z.object({
  /** Must be true to perform live writes. Default / omitted = dry-run only. */
  live: z.boolean().optional().default(false),
  sinceDays: z.number().int().min(1).max(365).optional().default(180),
  maxMessages: z.number().int().min(1).max(500).optional().default(200),
  confirmLiveBackfill: z.literal('NEWSLETTER_LIVE_BACKFILL').optional(),
  /** Persist the approved pinned-corpus proposal report (preferred controlled path). */
  mode: z.enum(['discovery_scan', 'approved_pinned']).optional().default('discovery_scan'),
  approvedReportPath: z.string().min(1).optional(),
  expectedCorpusHash: z.string().min(8).optional(),
});

newsletterIntelligenceRoute.post('/backfill', async (c) => {
  const body = BackfillSchema.parse(await c.req.json().catch(() => ({})));
  const live = body.live === true;

  if (live) {
    if (body.confirmLiveBackfill !== 'NEWSLETTER_LIVE_BACKFILL') {
      return jsonError(
        c,
        403,
        'LIVE_BACKFILL_CONFIRMATION_REQUIRED',
        'Live backfill requires live:true and confirmLiveBackfill:"NEWSLETTER_LIVE_BACKFILL".',
      );
    }
    if (process.env.BENSON_API_MODE === 'production' && !process.env.BENSON_CONTROL_TOWER_KEY?.trim()) {
      return jsonError(
        c,
        403,
        'LIVE_BACKFILL_LOCKED',
        'Live newsletter backfill is locked until BENSON_CONTROL_TOWER_KEY is configured.',
      );
    }
  }

  if (body.mode === 'approved_pinned') {
    const reportPath =
      body.approvedReportPath ??
      resolve(
        process.cwd(),
        '../../reports/newsletter-dry-run-reclassified-2026-07-28T01-46-57-054Z.json',
      );
    const result = await persistApprovedNewsletterBackfill({
      approvedReportPath: reportPath,
      live,
      confirmLiveBackfill: body.confirmLiveBackfill,
      expectedCorpusHash: body.expectedCorpusHash ?? APPROVED_CORPUS_HASH,
    });
    return c.json({
      ok: true,
      dryRun: !live,
      live,
      mode: 'approved_pinned',
      runId: result.runId,
      corpusCount: result.corpusCount,
      corpusHash: result.corpusHash,
      proposalTotals: result.proposalTotals,
      counters: result.counters,
      postWriteCounts: result.postWriteCounts,
      materialMismatch: result.materialMismatch,
      mismatchNotes: result.mismatchNotes,
    });
  }

  const result = await runNewsletterBackfill({
    dryRun: !live,
    sinceDays: body.sinceDays,
    maxMessages: body.maxMessages,
  });

  return c.json({
    ok: true,
    dryRun: !live,
    live,
    mode: 'discovery_scan',
    runId: result.runId,
    report: {
      emailsScanned: result.report.emailsScanned,
      relevantNewsletters: result.report.relevantNewsletters,
      ignoredTransactional: result.report.ignoredTransactional,
      ignoredPersonal: result.report.ignoredPersonal,
      entitiesFound: result.report.entitiesFound,
      occurrencesExtracted: result.report.occurrencesExtracted,
      recordsCreated: result.report.recordsCreated,
      recordsUpdated: result.report.recordsUpdated,
      unchangedRerun: result.report.unchangedRerun,
      errorCount: result.report.errors.length,
    },
  });
});

newsletterIntelligenceRoute.post('/sources/:id/reprocess', async (c) => {
  const source = await getNewsletterSource(c.req.param('id'));
  if (!source) return jsonError(c, 404, 'NOT_FOUND', 'Newsletter source not found');
  return c.json({
    ok: true,
    message: 'Use dry-run backfill or Gmail discovery sync to reprocess. No message bodies are returned.',
    senderDomain: source.senderDomain,
  });
});
