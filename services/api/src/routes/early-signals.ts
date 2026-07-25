import { Hono } from 'hono';
import {
  approveSignalAsOpportunity,
  dismissSignal,
  getAlertPreferences,
  getSignalDetail,
  ingestManualTip,
  listFailedWatchers,
  listSignals,
  markSignalVerified,
  mergeSignals,
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
  return c.json({ inventory: KC_SOURCE_CATALOG, activeCount: KC_SOURCE_CATALOG.filter((s) => s.catalogStatus === 'active').length });
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
  const result = await approveSignalAsOpportunity(c.req.param('id'));
  return c.json(result);
});

earlySignalsRoute.post('/:id/dismiss', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  await dismissSignal(c.req.param('id'), body.reason);
  return c.json({ ok: true });
});

earlySignalsRoute.post('/:id/snooze', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  await snoozeSignal(c.req.param('id'), body.hours ?? 24);
  return c.json({ ok: true });
});

earlySignalsRoute.post('/:id/verify', async (c) => {
  await markSignalVerified(c.req.param('id'));
  return c.json({ ok: true });
});

earlySignalsRoute.post('/:id/merge', async (c) => {
  const body = await c.req.json();
  await mergeSignals(c.req.param('id'), body.duplicateId);
  return c.json({ ok: true });
});

earlySignalsRoute.post('/:id/test-alert', async (c) => {
  const result = await sendTestSignalAlert(c.req.param('id'));
  return c.json(result);
});

earlySignalsRoute.post('/watchers/:id/disable', async (c) => {
  await disableWatcher(c.req.param('id'));
  return c.json({ ok: true });
});
