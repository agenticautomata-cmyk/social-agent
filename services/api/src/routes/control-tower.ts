import { Hono } from 'hono';
import {
  buildControlTowerSummary,
  getHealthReadiness,
  checkProductionDependencies,
} from '@social-agent/core/control-tower';
import { buildSpendSummary } from '@social-agent/core/llm-spend';
import { listRecentJobRuns } from '@social-agent/core/worker-heartbeat';
import { isControlTowerAuthorized, controlTowerUnauthorizedMessage } from '../lib/admin-auth.js';
import { structuredError } from '../lib/structured-error.js';

export const controlTowerRoute = new Hono();

controlTowerRoute.use('*', async (c, next) => {
  const key = c.req.header('x-benson-admin-key');
  if (!isControlTowerAuthorized(key)) {
    return structuredError(
      c,
      'CONTROL_TOWER_UNAUTHORIZED',
      controlTowerUnauthorizedMessage(),
      401,
    );
  }
  await next();
});

controlTowerRoute.get('/summary', async (c) => {
  const periodDays = Number(c.req.query('days') ?? 7);
  const [summary, spend] = await Promise.all([
    buildControlTowerSummary(),
    buildSpendSummary(periodDays),
  ]);
  return c.json({ ...summary, spend });
});

controlTowerRoute.get('/spend', async (c) => {
  const periodDays = Number(c.req.query('days') ?? 7);
  const spend = await buildSpendSummary(periodDays);
  return c.json(spend);
});

controlTowerRoute.get('/workers/:workerId/runs', async (c) => {
  const runs = await listRecentJobRuns(c.req.param('workerId'), 30);
  return c.json({ runs });
});

controlTowerRoute.get('/dependencies', async (c) => {
  const dependencies = await checkProductionDependencies();
  return c.json({ dependencies });
});

controlTowerRoute.get('/readiness', async (c) => {
  const readiness = await getHealthReadiness();
  const status = readiness.ready ? (readiness.state === 'degraded' ? 200 : 200) : 503;
  return c.json(readiness, status);
});
