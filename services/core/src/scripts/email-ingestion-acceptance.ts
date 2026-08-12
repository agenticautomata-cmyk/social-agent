/**
 * End-to-end acceptance report for email ingestion reliability.
 */
import fs from 'node:fs';
import { desc, eq, ilike, or } from 'drizzle-orm';
import { db } from '../db.js';
import {
  creatorPartnerships,
  creatorPlatformActivities,
  gmailDigestMessages,
  workerJobRuns,
} from '../schema.js';
import { getGmailConnectionStatus } from '../gmail-oauth/connections.js';
import { checkGmailIngestionWatchdog } from '../gmail-inbox/ingestion-watchdog.js';
import { listWorkerStatuses } from '../worker-heartbeat/index.js';
import {
  readWorkersProcessRunning,
  recoverStaleWorkersStartLock,
  workersRuntimePaths,
} from '../workers-runtime/lock.js';
import { findPlatformActivityByGmailMessage } from '../creator-partnership/platform-activities.js';
import { findExistingPartnershipActivityByGmailMessage } from '../creator-partnership/activities.js';

const REKLAIM_PARTNERSHIP_ID = 'a4c52e13-e2d7-45b8-8dea-d91a80e3c894';
const FIXTURE_GMAIL_ID = 'replay_shopmy_application_fixture_2026_08_08';
const root = process.env.BENSON_REPO_ROOT ?? `${process.cwd()}/../..`;
const paths = workersRuntimePaths(root);

const lockRecovery = recoverStaleWorkersStartLock(root);
const workersProcessRunning = readWorkersProcessRunning(root);
let workerPid: number | null = null;
let workerStartedAt: string | null = null;
try {
  workerPid = Number(fs.readFileSync(paths.pidFile, 'utf8').trim());
} catch {
  workerPid = null;
}
if (fs.existsSync(paths.metaFile)) {
  try {
    workerStartedAt = JSON.parse(fs.readFileSync(paths.metaFile, 'utf8')).startedAt ?? null;
  } catch {
    workerStartedAt = null;
  }
}

const gmail = await getGmailConnectionStatus();
const watchdog = await checkGmailIngestionWatchdog();
const workers = await listWorkerStatuses();
const gmailSync = workers.find((w) => w.workerId === 'gmail-inbox-sync') ?? null;
const gmailDigest = workers.find((w) => w.workerId === 'gmail-inbox-digest') ?? null;

const latestSponsors = await db
  .select()
  .from(gmailDigestMessages)
  .where(eq(gmailDigestMessages.channelId, 'sponsors'))
  .orderBy(desc(gmailDigestMessages.receivedAt))
  .limit(3);

const shopmyDigest = await db
  .select()
  .from(gmailDigestMessages)
  .where(or(ilike(gmailDigestMessages.subject, '%thank you for your shopmy application%')))
  .orderBy(desc(gmailDigestMessages.receivedAt))
  .limit(1);

const shopmyGmailMessageId = shopmyDigest[0]?.gmailMessageId ?? null;
const shopmyPlatform = shopmyGmailMessageId
  ? await findPlatformActivityByGmailMessage(shopmyGmailMessageId)
  : null;
const shopmyPartnership = shopmyGmailMessageId
  ? await findExistingPartnershipActivityByGmailMessage(shopmyGmailMessageId)
  : null;

const [reklaim] = await db
  .select({ pipelineStatus: creatorPartnerships.pipelineStatus })
  .from(creatorPartnerships)
  .where(eq(creatorPartnerships.id, REKLAIM_PARTNERSHIP_ID))
  .limit(1);

const fixtureRows = await db
  .select({ id: creatorPlatformActivities.id })
  .from(creatorPlatformActivities)
  .where(eq(creatorPlatformActivities.gmailMessageId, FIXTURE_GMAIL_ID));

async function recentRun(workerId: string) {
  const [row] = await db
    .select()
    .from(workerJobRuns)
    .where(eq(workerJobRuns.workerId, workerId))
    .orderBy(desc(workerJobRuns.startedAt))
    .limit(1);
  return row
    ? {
        startedAt: row.startedAt.toISOString(),
        finishedAt: row.finishedAt?.toISOString() ?? null,
        status: row.status,
        errorSummary: row.errorSummary,
      }
    : null;
}

const report = {
  generatedAt: new Date().toISOString(),
  worker: {
    pid: workerPid,
    startedAt: workerStartedAt,
    processRunning: workersProcessRunning,
    lockState: {
      lockFileExists: fs.existsSync(paths.lockFile),
      metaFileExists: fs.existsSync(paths.metaFile),
      lockRecovery,
    },
  },
  gmail: {
    connectionStatus: gmail.status,
    email: gmail.connection?.email ?? null,
    latestSuccessfulSync: gmailSync?.lastSuccessAt ?? null,
    latestSuccessfulDigest: gmailDigest?.lastSuccessAt ?? null,
    syncStatus: gmailSync?.status ?? null,
    digestStatus: gmailDigest?.status ?? null,
    syncRecentRun: await recentRun('gmail-inbox-sync'),
    digestRecentRun: await recentRun('gmail-inbox-digest'),
  },
  sponsorsPipeline: {
    latestMessages: latestSponsors.map((row) => ({
      gmailMessageId: row.gmailMessageId,
      subject: row.subject,
      receivedAt: row.receivedAt?.toISOString() ?? null,
      emailCategory: row.emailCategory,
      actionStatus: row.actionStatus,
    })),
    matcherHook: 'gmail-inbox/digest.ts → processCreatorEmailMatchFromGmailId for channelId=sponsors',
  },
  shopmy: {
    found: Boolean(shopmyDigest[0]),
    gmailMessageId: shopmyGmailMessageId,
    subject: shopmyDigest[0]?.subject ?? null,
    receivedAt: shopmyDigest[0]?.receivedAt?.toISOString() ?? null,
    platformActivity: shopmyPlatform
      ? {
          id: shopmyPlatform.activity.id,
          activityType: shopmyPlatform.activity.activityType,
          suggestedAction: shopmyPlatform.activity.suggestedAction,
          followUpAt: shopmyPlatform.activity.followUpAt?.toISOString() ?? null,
        }
      : null,
    partnershipActivity: shopmyPartnership,
    reklaimPipelineStatus: reklaim?.pipelineStatus ?? null,
    fixtureStillPresent: fixtureRows.length > 0,
  },
  health: {
    ingestionWatchdog: watchdog,
    gmailInboxSync: gmailSync,
    gmailInboxDigest: gmailDigest,
  },
};

console.log(JSON.stringify(report, null, 2));

const failures: string[] = [];
if (!workersProcessRunning) failures.push('workers_process_not_running');
if (gmail.status !== 'connected') failures.push('gmail_not_connected');
if (watchdog.active && gmailSync?.status !== 'healthy') failures.push('gmail_sync_not_healthy');
if (shopmyDigest[0] && !shopmyPlatform) failures.push('shopmy_platform_activity_missing');
if (shopmyPartnership?.creatorPartnershipId) failures.push('shopmy_incorrectly_linked_to_partnership');
if (shopmyPlatform && fixtureRows.length > 0 && shopmyGmailMessageId !== FIXTURE_GMAIL_ID) {
  failures.push('fixture_pollution_remaining');
}

if (failures.length > 0) {
  console.error('\nACCEPTANCE FAILURES:', failures.join(', '));
  process.exit(1);
}

process.exit(0);
