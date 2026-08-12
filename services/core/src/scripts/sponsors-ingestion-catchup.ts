/**
 * Bounded catch-up for sponsors@ mail missed during Gmail/worker downtime.
 * Uses normal classification + matching paths; idempotent; no CRM lifecycle changes.
 */
import { and, desc, eq, gte, ilike, or, sql } from 'drizzle-orm';
import { syncGmailOutreachReplies, runGmailTelegramDigest } from '../gmail-inbox/index.js';
import { getGmailConnectionStatus } from '../gmail-oauth/connections.js';
import { listGmailMessageIds } from '../gmail-inbox/messages.js';
import { db } from '../db.js';
import { creatorPartnerships, creatorPlatformActivities, gmailDigestMessages } from '../schema.js';
import { processCreatorEmailMatchFromGmailId } from '../creator-partnership/process-email-match.js';
import { findPlatformActivityByGmailMessage } from '../creator-partnership/platform-activities.js';
import { findExistingPartnershipActivityByGmailMessage } from '../creator-partnership/activities.js';

const LOOKBACK_DAYS = Number(process.env.CATCHUP_LOOKBACK_DAYS ?? '7');
const FIXTURE_GMAIL_ID = 'replay_shopmy_application_fixture_2026_08_08';
const REKLAIM_PARTNERSHIP_ID = 'a4c52e13-e2d7-45b8-8dea-d91a80e3c894';

const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

const gmail = await getGmailConnectionStatus();
if (gmail.status !== 'connected') {
  console.error(JSON.stringify({ ok: false, reason: 'gmail_not_connected', gmail }, null, 2));
  process.exit(1);
}

const [reklaimBefore] = await db
  .select({ pipelineStatus: creatorPartnerships.pipelineStatus })
  .from(creatorPartnerships)
  .where(eq(creatorPartnerships.id, REKLAIM_PARTNERSHIP_ID))
  .limit(1);

const digestBefore = await db
  .select({ n: sql<number>`count(*)::int` })
  .from(gmailDigestMessages)
  .where(and(eq(gmailDigestMessages.channelId, 'sponsors'), gte(gmailDigestMessages.receivedAt, cutoff)));

console.log('Running Gmail outreach sync…');
const syncResult = await syncGmailOutreachReplies();

console.log('Running Gmail digest (classification + sponsors matcher hook)…');
const digestResult = await runGmailTelegramDigest();

const gmailIds = await listGmailMessageIds(`to:sponsors@kckellie.com newer_than:${LOOKBACK_DAYS}d`, 200);

let matcherExamined = 0;
let platformCreated = 0;
let platformSkipped = 0;
let partnershipCreated = 0;
let partnershipSkipped = 0;
let matcherErrors = 0;
const missedCreatorEmails: Array<{ gmailMessageId: string; subject: string | null; reason: string }> = [];

for (const gmailMessageId of gmailIds) {
  matcherExamined += 1;
  try {
    const result = await processCreatorEmailMatchFromGmailId(gmailMessageId, {
      source: 'sponsors-catchup',
    });
    if ('ok' in result && result.ok === false) continue;
    if (!('platform' in result)) continue;
    if (result.platform.created) platformCreated += 1;
    else if (result.platform.skipped) platformSkipped += 1;
    if (result.partnership.created) partnershipCreated += 1;
    else if (result.partnership.skipped) partnershipSkipped += 1;

    if (!result.platform.created && !result.platform.skipped && !result.partnership.created) {
      const [digest] = await db
        .select({ subject: gmailDigestMessages.subject, emailCategory: gmailDigestMessages.emailCategory })
        .from(gmailDigestMessages)
        .where(eq(gmailDigestMessages.gmailMessageId, gmailMessageId))
        .limit(1);
      if (digest?.emailCategory === 'sponsor' || digest?.emailCategory === 'collab') {
        missedCreatorEmails.push({
          gmailMessageId,
          subject: digest.subject,
          reason: result.platform.reason ?? result.partnership.reason ?? 'unmatched',
        });
      }
    }
  } catch (err) {
    matcherErrors += 1;
    console.warn(`matcher error ${gmailMessageId}:`, err instanceof Error ? err.message : err);
  }
}

const digestAfter = await db
  .select({ n: sql<number>`count(*)::int` })
  .from(gmailDigestMessages)
  .where(and(eq(gmailDigestMessages.channelId, 'sponsors'), gte(gmailDigestMessages.receivedAt, cutoff)));

const shopmyCandidates = await db
  .select()
  .from(gmailDigestMessages)
  .where(
    or(
      ilike(gmailDigestMessages.subject, '%thank you for your shopmy application%'),
      ilike(gmailDigestMessages.fromEmail, '%shopmy%'),
    ),
  )
  .orderBy(desc(gmailDigestMessages.receivedAt))
  .limit(5);

let shopmyRecord: Record<string, unknown> | null = null;
for (const candidate of shopmyCandidates) {
  if (!/thank you for your shopmy application/i.test(candidate.subject ?? '')) continue;
  await processCreatorEmailMatchFromGmailId(candidate.gmailMessageId, { source: 'shopmy-catchup' });
  const platform = await findPlatformActivityByGmailMessage(candidate.gmailMessageId);
  const partnership = await findExistingPartnershipActivityByGmailMessage(candidate.gmailMessageId);
  shopmyRecord = {
    gmailMessageId: candidate.gmailMessageId,
    subject: candidate.subject,
    receivedAt: candidate.receivedAt?.toISOString() ?? null,
    platformActivity: platform
      ? {
          id: platform.activity.id,
          activityType: platform.activity.activityType,
          suggestedAction: platform.activity.suggestedAction,
          followUpAt: platform.activity.followUpAt?.toISOString() ?? null,
        }
      : null,
    partnershipActivity: partnership,
  };
  break;
}

if (shopmyRecord && shopmyRecord.gmailMessageId !== FIXTURE_GMAIL_ID) {
  await db.delete(creatorPlatformActivities).where(eq(creatorPlatformActivities.gmailMessageId, FIXTURE_GMAIL_ID));
}

const [reklaimAfter] = await db
  .select({ pipelineStatus: creatorPartnerships.pipelineStatus })
  .from(creatorPartnerships)
  .where(eq(creatorPartnerships.id, REKLAIM_PARTNERSHIP_ID))
  .limit(1);

console.log(
  JSON.stringify(
    {
      ok: true,
      lookbackDays: LOOKBACK_DAYS,
      sync: syncResult,
      digest: {
        newMessages: digestResult.newMessages,
        errors: digestResult.errors.slice(0, 5),
        autoHarvested: digestResult.autoHarvested,
      },
      sponsorsDigestCount: {
        before: digestBefore[0]?.n ?? 0,
        after: digestAfter[0]?.n ?? 0,
        newlyIngested: (digestAfter[0]?.n ?? 0) - (digestBefore[0]?.n ?? 0),
      },
      matcher: {
        examined: matcherExamined,
        platformCreated,
        platformSkipped,
        partnershipCreated,
        partnershipSkipped,
        errors: matcherErrors,
      },
      shopmy: shopmyRecord,
      reklaim: {
        pipelineStatusBefore: reklaimBefore?.pipelineStatus ?? null,
        pipelineStatusAfter: reklaimAfter?.pipelineStatus ?? null,
        unchanged: reklaimBefore?.pipelineStatus === reklaimAfter?.pipelineStatus,
      },
      missedCreatorEmails,
      fixtureRemoved: Boolean(shopmyRecord && shopmyRecord.gmailMessageId !== FIXTURE_GMAIL_ID),
    },
    null,
    2,
  ),
);

process.exit(matcherErrors > 0 ? 1 : 0);
