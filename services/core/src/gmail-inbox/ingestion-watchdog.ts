import { getGmailConnectionStatus } from '../gmail-oauth/connections.js';
import { listWorkerStatuses, type WorkerStatusRow } from '../worker-heartbeat/index.js';
import { readWorkersProcessRunning } from '../workers-runtime/lock.js';

export type GmailIngestionWatchdogResult = {
  active: boolean;
  warning: string | null;
  gmailConnected: boolean;
  workersProcessRunning: boolean;
  gmailInboxSync: Pick<
    WorkerStatusRow,
    'status' | 'lastSuccessAt' | 'lastStartedAt' | 'expectedIntervalMs' | 'lastErrorSummary'
  > | null;
  gmailInboxDigest: Pick<
    WorkerStatusRow,
    'status' | 'lastSuccessAt' | 'lastStartedAt' | 'expectedIntervalMs' | 'lastErrorSummary'
  > | null;
};

function formatAgeMs(ms: number): string {
  const totalMinutes = Math.max(1, Math.round(ms / 60_000));
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function pickWorker(workers: WorkerStatusRow[], workerId: string) {
  const row = workers.find((w) => w.workerId === workerId);
  if (!row) return null;
  return {
    status: row.status,
    lastSuccessAt: row.lastSuccessAt,
    lastStartedAt: row.lastStartedAt,
    expectedIntervalMs: row.expectedIntervalMs,
    lastErrorSummary: row.lastErrorSummary,
  };
}

function staleMessage(label: string, row: NonNullable<ReturnType<typeof pickWorker>>): string {
  const last = row.lastSuccessAt ? new Date(row.lastSuccessAt).getTime() : null;
  const age = last ? formatAgeMs(Date.now() - last) : 'never';
  if (row.status === 'error') {
    return `Gmail sponsor ingestion error — ${label} failed (${row.lastErrorSummary ?? 'see worker log'}).`;
  }
  return `Gmail sponsor ingestion is stale — ${label} last successful run ${age} ago.`;
}

/** One persistent warning when Gmail ingestion workers miss their freshness window. */
export async function checkGmailIngestionWatchdog(): Promise<GmailIngestionWatchdogResult> {
  const [gmailStatus, workers] = await Promise.all([
    getGmailConnectionStatus(),
    listWorkerStatuses(),
  ]);
  const gmailConnected = gmailStatus.status === 'connected';
  const workersProcessRunning = readWorkersProcessRunning();

  const gmailInboxSync = pickWorker(workers, 'gmail-inbox-sync');
  const gmailInboxDigest = pickWorker(workers, 'gmail-inbox-digest');

  const base: GmailIngestionWatchdogResult = {
    active: false,
    warning: null,
    gmailConnected,
    workersProcessRunning,
    gmailInboxSync,
    gmailInboxDigest,
  };

  if (!gmailConnected) return base;

  if (!workersProcessRunning) {
    return {
      ...base,
      active: true,
      warning: 'Gmail sponsor ingestion is stopped — Benson workers process is not running.',
    };
  }

  const syncStale = gmailInboxSync && gmailInboxSync.status !== 'healthy' && gmailInboxSync.status !== 'running';
  const digestStale =
    gmailInboxDigest && gmailInboxDigest.status !== 'healthy' && gmailInboxDigest.status !== 'running';

  if (!syncStale && !digestStale) return base;

  let warning: string | null = null;
  if (syncStale && digestStale) {
    warning = `${staleMessage('inbox sync', gmailInboxSync!)} ${staleMessage('digest', gmailInboxDigest!)}`;
  } else if (syncStale) {
    warning = staleMessage('inbox sync', gmailInboxSync!);
  } else if (digestStale) {
    warning = staleMessage('digest', gmailInboxDigest!);
  }

  return {
    ...base,
    active: Boolean(warning),
    warning,
  };
}
