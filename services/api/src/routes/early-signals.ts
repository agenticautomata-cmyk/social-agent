import { Hono } from 'hono';
import {
  approveSignalAsOpportunity,
  dismissSignal,
  skipSignal,
  getAlertPreferences,
  getSignalDetail,
  ingestManualTip,
  keepSignalAsUnverifiedOpportunity,
  listFailedWatchers,
  listSignals,
  markSignalVerified,
  mergeSignals,
  reportMalformedSignal,
  researchSignalOfficialSource,
  runEarlySignalPipeline,
  saveAlertPreferences,
  seedDefaultWatchers,
  sendTestSignalAlert,
  sendEarlySignalsReleaseNotification,
  probeAllCatalogSources,
  probeActiveSourcesOnly,
  KC_SOURCE_CATALOG,
  snoozeSignal,
  disableWatcher,
} from '@social-agent/core/early-signals';
import { structuredError } from '../lib/structured-error.js';

function actionError(c: import('hono').Context, err: unknown, code: string, fallback: string) {
  const message = err instanceof Error ? err.message : fallback;
  if (/not found/i.test(message)) {
    return structuredError(c, 'SIGNAL_NOT_FOUND', 'That verification record could not be found.', 404);
  }
  return structuredError(c, code, message, 400);
}

export const earlySignalsRoute = new Hono();

earlySignalsRoute.get('/', async (c) => {
  const urgency = c.req.query('urgency')?.split(',').filter(Boolean);
  const confidence = c.req.query('confidence')?.split(',').filter(Boolean);
  const state = c.req.query('state')?.split(',').filter(Boolean);
  const signals = await listSignals({ urgency, confidence, state, limit: 200 });
  const failedWatchers = await listFailedWatchers();
  return c.json({ signals, failedWatchers, count: signals.length });
});

earlySignalsRoute.get('/settings/alerts', async (c) => {
  const prefs = await getAlertPreferences();
  return c.json({ preferences: prefs });
});

earlySignalsRoute.put('/settings/alerts', async (c) => {
  const body = await c.req.json();
  await saveAlertPreferences(body);
  return c.json({ ok: true });
});

earlySignalsRoute.post('/run', async (c) => {
  const result = await runEarlySignalPipeline();
  return c.json(result);
});

earlySignalsRoute.post('/seed-watchers', async (c) => {
  const result = await seedDefaultWatchers();
  return c.json(result);
});

earlySignalsRoute.get('/source-inventory', async (c) => {
  return c.json({
    inventory: KC_SOURCE_CATALOG,
    activeCount: KC_SOURCE_CATALOG.filter((s) => s.catalogStatus === 'active').length,
  });
});

earlySignalsRoute.post('/probe-sources', async (c) => {
  const result = await probeAllCatalogSources();
  return c.json(result);
});

earlySignalsRoute.post('/tips', async (c) => {
  const body = await c.req.json();
  const result = await ingestManualTip(body);
  return c.json(result, 201);
});

earlySignalsRoute.post('/release-notification', async (c) => {
  const result = await sendEarlySignalsReleaseNotification();
  return c.json(result);
});

earlySignalsRoute.get('/:id', async (c) => {
  const detail = await getSignalDetail(c.req.param('id'));
  if (!detail) return c.json({ error: 'Not found' }, 404);
  return c.json(detail);
});

earlySignalsRoute.post('/:id/approve', async (c) => {
  try {
    const result = await approveSignalAsOpportunity(c.req.param('id'));
    return c.json({ ok: true, ...result });
  } catch (err) {
    return actionError(c, err, 'APPROVE_FAILED', 'Approve failed');
  }
});

earlySignalsRoute.post('/:id/keep-unverified', async (c) => {
  try {
    const result = await keepSignalAsUnverifiedOpportunity(c.req.param('id'));
    return c.json({ ok: true, ...result });
  } catch (err) {
    return actionError(c, err, 'KEEP_UNVERIFIED_FAILED', 'Keep unverified failed');
  }
});

earlySignalsRoute.post('/:id/dismiss', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const result = await dismissSignal(c.req.param('id'), body.reason);
    return c.json(result);
  } catch (err) {
    return actionError(c, err, 'DISMISS_FAILED', 'Dismiss failed');
  }
});

earlySignalsRoute.post('/:id/skip', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const result = await skipSignal(
      c.req.param('id'),
      body.sourceScreen ?? 'early_signals',
      body.reason,
    );
    return c.json(result);
  } catch (err) {
    return actionError(c, err, 'SKIP_FAILED', 'Skip failed');
  }
});

earlySignalsRoute.post('/:id/snooze', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const result = await snoozeSignal(c.req.param('id'), body.hours ?? 24);
    return c.json(result);
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : 'Snooze failed' }, 400);
  }
});

earlySignalsRoute.post('/:id/verify', async (c) => {
  try {
    const result = await markSignalVerified(c.req.param('id'));
    return c.json(result);
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : 'Verify failed' }, 400);
  }
});

earlySignalsRoute.post('/:id/report-malformed', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const result = await reportMalformedSignal(c.req.param('id'), body.note);
    return c.json(result);
  } catch (err) {
    return actionError(c, err, 'REPORT_MALFORMED_FAILED', 'Report malformed failed');
  }
});

earlySignalsRoute.post('/:id/research', async (c) => {
  try {
    const result = await researchSignalOfficialSource(c.req.param('id'));
    return c.json(result);
  } catch (err) {
    console.error('[early-signals] research failed', err);
    return c.json({ ok: false, error: err instanceof Error ? err.message : 'Research failed' }, 400);
  }
});

earlySignalsRoute.post('/:id/merge', async (c) => {
  try {
    const body = await c.req.json();
    await mergeSignals(c.req.param('id'), body.duplicateId);
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : 'Merge failed' }, 400);
  }
});

earlySignalsRoute.post('/:id/test-alert', async (c) => {
  const result = await sendTestSignalAlert(c.req.param('id'));
  return c.json(result);
});

earlySignalsRoute.post('/watchers/:id/disable', async (c) => {
  await disableWatcher(c.req.param('id'));
  return c.json({ ok: true });
});
