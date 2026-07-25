import { execSync } from 'node:child_process';
import os from 'node:os';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { env } from '../env.js';
import {
  listFailedJobRuns,
  listWorkerStatuses,
  type WorkerStatusRow,
} from '../worker-heartbeat/index.js';
import { buildOutcomeAnalyticsSummary } from '../outcome-engine/analytics.js';

export type DependencyCheck = {
  id: string;
  label: string;
  status: 'healthy' | 'degraded' | 'failed' | 'unknown';
  detail: string;
};

export type ControlTowerSummary = {
  overall: 'healthy' | 'degraded' | 'failed';
  generatedAt: string;
  workers: WorkerStatusRow[];
  failedJobs: Awaited<ReturnType<typeof listFailedJobRuns>>;
  dependencies: DependencyCheck[];
  alerts: string[];
  system: {
    uptimeSeconds: number;
    loadAvg: number[];
    freeMemMb: number;
    totalMemMb: number;
    processCount: number;
  };
  oauthWarnings: string[];
  deployment: { label: string; at: string | null };
};

async function checkDatabase(): Promise<DependencyCheck> {
  try {
    const start = Date.now();
    await db.execute(sql`select 1 as ok`);
    const ms = Date.now() - start;
    return {
      id: 'database',
      label: 'Database',
      status: ms > 2000 ? 'degraded' : 'healthy',
      detail: `Responding in ${ms}ms`,
    };
  } catch (err) {
    return {
      id: 'database',
      label: 'Database',
      status: 'failed',
      detail: err instanceof Error ? err.message.slice(0, 120) : 'Connection failed',
    };
  }
}

function checkEnvConfigured(key: string, label: string): DependencyCheck {
  const value = (env as Record<string, unknown>)[key];
  const ok = typeof value === 'string' && value.trim().length > 0;
  return {
    id: key.toLowerCase(),
    label,
    status: ok ? 'healthy' : 'degraded',
    detail: ok ? 'Configured' : 'Not configured',
  };
}

function countBensonProcesses(): number {
  try {
    const out = execSync("pgrep -f 'kellie-assistant/social-agent' 2>/dev/null | wc -l", {
      encoding: 'utf8',
    }).trim();
    return parseInt(out, 10) || 0;
  } catch {
    return 0;
  }
}

export async function checkProductionDependencies(): Promise<DependencyCheck[]> {
  const checks = await Promise.all([
    checkDatabase(),
    Promise.resolve(checkEnvConfigured('OPENAI_API_KEY', 'OpenAI')),
    Promise.resolve(checkEnvConfigured('GMAIL_CLIENT_ID', 'Gmail OAuth')),
    Promise.resolve(checkEnvConfigured('TELEGRAM_BOT_TOKEN', 'Telegram')),
  ]);
  return checks;
}

export async function buildControlTowerSummary(): Promise<ControlTowerSummary> {
  const [workers, failedJobs, dependencies] = await Promise.all([
    listWorkerStatuses(),
    listFailedJobRuns(20),
    checkProductionDependencies(),
  ]);

  const alerts: string[] = [];
  const oauthWarnings: string[] = [];

  for (const w of workers) {
    if (w.status === 'failed') alerts.push(`${w.displayName} has failed repeatedly.`);
    else if (w.status === 'delayed') alerts.push(`${w.displayName} is delayed.`);
  }
  for (const job of failedJobs.slice(0, 5)) {
    alerts.push(`Failed job on ${job.workerId}: ${job.errorSummary ?? 'unknown error'}`);
  }
  for (const dep of dependencies) {
    if (dep.status === 'failed') alerts.push(`${dep.label} check failed.`);
    if (dep.id === 'gmail_client_id' && dep.status === 'degraded') {
      oauthWarnings.push('Gmail OAuth is not configured.');
    }
  }

  const workerFailed = workers.some((w) => w.status === 'failed');
  const workerDelayed = workers.some((w) => w.status === 'delayed');
  const depFailed = dependencies.some((d) => d.status === 'failed');
  const overall =
    workerFailed || depFailed ? 'failed' : workerDelayed || alerts.length > 0 ? 'degraded' : 'healthy';

  return {
    overall,
    generatedAt: new Date().toISOString(),
    workers,
    failedJobs,
    dependencies,
    alerts,
    oauthWarnings,
    system: {
      uptimeSeconds: Math.floor(process.uptime()),
      loadAvg: os.loadavg(),
      freeMemMb: Math.round(os.freemem() / 1024 / 1024),
      totalMemMb: Math.round(os.totalmem() / 1024 / 1024),
      processCount: countBensonProcesses(),
    },
    deployment: {
      label: process.env.BENSON_DEPLOYMENT_LABEL ?? 'production',
      at: process.env.BENSON_DEPLOYED_AT ?? null,
    },
  };
}

export async function getHealthReadiness(): Promise<{
  ready: boolean;
  state: 'healthy' | 'degraded' | 'not_ready';
  dependencies: DependencyCheck[];
}> {
  const dependencies = await checkProductionDependencies();
  const dbOk = dependencies.find((d) => d.id === 'database')?.status !== 'failed';
  const anyFailed = dependencies.some((d) => d.status === 'failed');
  const anyDegraded = dependencies.some((d) => d.status === 'degraded');

  if (!dbOk) return { ready: false, state: 'not_ready', dependencies };
  if (anyFailed) return { ready: false, state: 'not_ready', dependencies };
  if (anyDegraded) return { ready: true, state: 'degraded', dependencies };
  return { ready: true, state: 'healthy', dependencies };
}

export async function getBriefSystemHealthForAskBenson() {
  const summary = await buildControlTowerSummary();
  const failedWorkers = summary.workers.filter((w) => w.status === 'failed' || w.status === 'delayed');
  return {
    overall: summary.overall,
    alertCount: summary.alerts.length,
    failedWorkers: failedWorkers.map((w) => ({
      name: w.displayName,
      status: w.status,
      lastError: w.lastErrorSummary,
    })),
    oauthWarnings: summary.oauthWarnings,
  };
}

export async function getBriefOutcomeContextForAskBenson() {
  const summary = await buildOutcomeAnalyticsSummary(60);
  return {
    acceptanceRate: summary.acceptanceRate,
    plannedToFilmedRate: summary.plannedToFilmedRate,
    filmedToPostedRate: summary.filmedToPostedRate,
    ignoredCategories: summary.ignoredCategories.slice(0, 5),
    topViewCategories: summary.topViewCategories.slice(0, 5),
    recentOutcomes: summary.recentOutcomes.slice(0, 6),
  };
}
