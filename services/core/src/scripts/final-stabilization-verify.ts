import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  gmailConnections,
  scoutSourceRuns,
  sourceWatchers,
  workerHeartbeats,
  workerIncidents,
  workerJobRuns,
} from '../schema.js';
import { getGmailConnectionStatus, getDecryptedGmailTokens } from '../gmail-oauth/connections.js';
import { listGmailMessageIds } from '../gmail-inbox/messages.js';
import { isSchedulerLive } from '../curator-watchlist/scheduler.js';
import { getCuratorSourceHealth } from '../curator-watchlist/store.js';

const JAS_ID = '6cd867ad-9bdf-441b-b30f-d51bed11376b';

// Gmail
const gmailStatus = await getGmailConnectionStatus();
const tokens = await getDecryptedGmailTokens();
let healthOk = false;
let healthError: string | null = null;
let healthMessageCount = 0;
if (tokens?.accessToken) {
  try {
    const ids = await listGmailMessageIds('in:inbox newer_than:1d', 1);
    healthOk = true;
    healthMessageCount = ids.length;
  } catch (err) {
    healthError = err instanceof Error ? err.message : String(err);
  }
}

const gmailIncidents = await db
  .select({
    id: workerIncidents.id,
    workerId: workerIncidents.workerId,
    state: workerIncidents.state,
    lastErrorCode: workerIncidents.lastErrorCode,
    resolvedAt: workerIncidents.resolvedAt,
    detectedAt: workerIncidents.detectedAt,
  })
  .from(workerIncidents)
  .where(
    and(
      isNull(workerIncidents.resolvedAt),
      or(
        ilike(workerIncidents.workerId, '%gmail%'),
        ilike(workerIncidents.lastErrorCode, '%gmail%'),
      ),
    ),
  );

const gmailWorkerRuns = await db
  .select({
    workerId: workerJobRuns.workerId,
    status: workerJobRuns.status,
    startedAt: workerJobRuns.startedAt,
    errorSummary: workerJobRuns.errorSummary,
  })
  .from(workerJobRuns)
  .where(
    or(
      eq(workerJobRuns.workerId, 'gmail-inbox-sync'),
      eq(workerJobRuns.workerId, 'gmail-discovery-sync'),
      eq(workerJobRuns.workerId, 'gmail-inbox-digest'),
    ),
  )
  .orderBy(desc(workerJobRuns.startedAt))
  .limit(6);

// Jas / scheduler
const jasRows = await db
  .select({
    id: sourceWatchers.id,
    sourceName: sourceWatchers.sourceName,
    canonicalKey: sourceWatchers.canonicalKey,
    sessionStatus: sourceWatchers.sessionStatus,
    authenticationRequired: sourceWatchers.authenticationRequired,
    lastSuccessfulCheck: sourceWatchers.lastSuccessfulCheck,
    lastAttemptedCheck: sourceWatchers.lastAttemptedCheck,
    checkFrequencyMs: sourceWatchers.checkFrequencyMs,
    lastFailureMessage: sourceWatchers.lastFailureMessage,
  })
  .from(sourceWatchers)
  .where(
    or(
      ilike(sourceWatchers.canonicalKey, '%jasfood%'),
      ilike(sourceWatchers.sourceName, '%jasfood%'),
    ),
  );

const jasRuns = await db
  .select({
    id: scoutSourceRuns.id,
    triggerType: scoutSourceRuns.triggerType,
    startedAt: scoutSourceRuns.startedAt,
    finishedAt: scoutSourceRuns.finishedAt,
    itemCount: scoutSourceRuns.itemCount,
    newCount: scoutSourceRuns.newCount,
    sanitizedFailure: scoutSourceRuns.sanitizedFailure,
  })
  .from(scoutSourceRuns)
  .where(eq(scoutSourceRuns.watcherId, JAS_ID))
  .orderBy(desc(scoutSourceRuns.startedAt))
  .limit(5);

const curatorHealth = await getCuratorSourceHealth(JAS_ID);
const schedulerLive = await isSchedulerLive();

const bensonWorkers = await db
  .select({ workerId: workerHeartbeats.workerId, status: workerHeartbeats.status })
  .from(workerHeartbeats)
  .where(
    or(
      eq(workerHeartbeats.workerId, 'curator-watchlist-check'),
      eq(workerHeartbeats.workerId, 'gmail-inbox-sync'),
      eq(workerHeartbeats.workerId, 'gmail-discovery-sync'),
    ),
  );

const gmailConn = await db.select().from(gmailConnections).limit(1);

console.log(
  JSON.stringify(
    {
      gmail: {
        status: gmailStatus.status,
        connectedAt: gmailStatus.connection?.connectedAt,
        expiresAt: gmailStatus.connection?.expiresAt,
        lastError: gmailStatus.connection?.lastError,
        tokensPresent: Boolean(tokens?.accessToken && tokens.refreshToken),
        minimalHealthOk: healthOk,
        minimalHealthError: healthError,
        minimalHealthSampleCount: healthMessageCount,
        activeIncidents: gmailIncidents,
        recentWorkerRuns: gmailWorkerRuns,
        dbRow: gmailConn[0]
          ? {
              status: gmailConn[0].status,
              hasAccessToken: Boolean(gmailConn[0].accessTokenEncrypted),
              hasRefreshToken: Boolean(gmailConn[0].refreshTokenEncrypted),
              connectedAt: gmailConn[0].connectedAt,
            }
          : null,
      },
      instagram: {
        jasSourceCount: jasRows.length,
        sources: jasRows,
        curatorHealth,
        recentRuns: jasRuns,
      },
      scheduler: {
        schedulerLive,
        curatorWorkerHeartbeats: bensonWorkers.filter((w) => w.workerId === 'curator-watchlist-check'),
      },
    },
    null,
    2,
  ),
);
