/**
 * Bounded replay of sponsors@ mail through the creator email match layer only.
 * Does not resend email, mutate CRM, or auto-apply partnership lifecycle statuses.
 */
import { and, desc, eq, gte } from 'drizzle-orm';
import { db } from '../db.js';
import { gmailDigestMessages } from '../schema.js';
import { getGmailConnectionStatus } from '../gmail-oauth/connections.js';
import { listGmailMessageIds } from '../gmail-inbox/messages.js';
import { processCreatorEmailMatch, processCreatorEmailMatchFromGmailId } from '../creator-partnership/process-email-match.js';
import { findPlatformActivityByGmailMessage, listPlatformActivities } from '../creator-partnership/platform-activities.js';
import { findExistingPartnershipActivityByGmailMessage } from '../creator-partnership/activities.js';

const LOOKBACK_DAYS = Number(process.env.REPLAY_LOOKBACK_DAYS ?? '7');
const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

type ReplayStats = {
  lookbackDays: number;
  messagesScanned: number;
  platformCreated: number;
  platformSkipped: number;
  partnershipCreated: number;
  partnershipSkipped: number;
  errors: number;
  gmailConnected: boolean;
  usedFixture: boolean;
};

const stats: ReplayStats = {
  lookbackDays: LOOKBACK_DAYS,
  messagesScanned: 0,
  platformCreated: 0,
  platformSkipped: 0,
  partnershipCreated: 0,
  partnershipSkipped: 0,
  errors: 0,
  gmailConnected: false,
  usedFixture: false,
};

async function recordResult(result: Awaited<ReturnType<typeof processCreatorEmailMatch>>) {
  if (result.platform.created) stats.platformCreated += 1;
  else if (result.platform.skipped) stats.platformSkipped += 1;
  if (result.partnership.created) stats.partnershipCreated += 1;
  else if (result.partnership.skipped) stats.partnershipSkipped += 1;
}

async function replayMessageId(gmailMessageId: string, emailCategory: string | null) {
  stats.messagesScanned += 1;
  const result = await processCreatorEmailMatchFromGmailId(gmailMessageId, {
    emailCategory,
    source: 'replay-bounded',
  });
  if ('ok' in result && result.ok === false) {
    console.warn(`  skip ${gmailMessageId}: ${result.reason}`);
    return;
  }
  if ('platform' in result) await recordResult(result);
}

const digestRows = await db
  .select()
  .from(gmailDigestMessages)
  .where(and(eq(gmailDigestMessages.channelId, 'sponsors'), gte(gmailDigestMessages.receivedAt, cutoff)))
  .orderBy(desc(gmailDigestMessages.receivedAt))
  .limit(200);

console.log(`Replay digest: ${digestRows.length} sponsors@ message(s) since ${cutoff.toISOString()}`);

for (const row of digestRows) {
  try {
    await replayMessageId(row.gmailMessageId, row.emailCategory);
  } catch (err) {
    stats.errors += 1;
    console.warn(`  error ${row.gmailMessageId}:`, err instanceof Error ? err.message : err);
  }
}

const gmailStatus = await getGmailConnectionStatus();
stats.gmailConnected = gmailStatus.status === 'connected';

if (stats.gmailConnected) {
  const gmailIds = await listGmailMessageIds(
    `to:sponsors@kckellie.com newer_than:${LOOKBACK_DAYS}d`,
    100,
  );
  const digestIds = new Set(digestRows.map((r) => r.gmailMessageId));
  for (const id of gmailIds) {
    if (digestIds.has(id)) continue;
    try {
      await replayMessageId(id, null);
    } catch (err) {
      stats.errors += 1;
      console.warn(`  gmail error ${id}:`, err instanceof Error ? err.message : err);
    }
  }
} else {
  console.warn(
    'Gmail disconnected — skipping live Gmail fetch. Reconnect Gmail to replay real message IDs.',
  );
}

let shopmyApplication =
  digestRows.find((row) => /thank you for your shopmy application/i.test(row.subject ?? '')) ?? null;

if (!shopmyApplication && stats.gmailConnected) {
  const shopmyIds = await listGmailMessageIds('subject:"Thank you for your ShopMy application" newer_than:30d', 3);
  if (shopmyIds[0]) {
    await replayMessageId(shopmyIds[0], 'sponsor');
    shopmyApplication = { gmailMessageId: shopmyIds[0], subject: 'Thank you for your ShopMy application' } as typeof digestRows[0];
  }
}

if (!shopmyApplication && process.env.ALLOW_MATCHER_FIXTURE === '1') {
  stats.usedFixture = true;
  const fixture = {
    gmailMessageId: 'replay_shopmy_application_fixture_2026_08_08',
    gmailThreadId: 'replay_shopmy_thread_fixture',
    senderEmail: 'hello@shopmy.us',
    senderDomain: 'shopmy.us',
    subject: 'Thank you for your ShopMy application',
    bodyText:
      'Thank you for applying to ShopMy.\n\nWe received your application and our team review takes 1-3 business days.\n\nYou will receive another email once a decision has been made.',
    snippet: 'We received your application and our team review takes 1-3 business days.',
    receivedAt: new Date('2026-08-08T14:22:00.000Z'),
    emailCategory: 'sponsor',
    source: 'replay-fixture-shopmy-application',
  };
  console.log('\nShopMy application not found in digest/Gmail — running matcher fixture replay.');
  const first = await processCreatorEmailMatch(fixture);
  const second = await processCreatorEmailMatch(fixture);
  await recordResult(first);
  await recordResult(second);
  shopmyApplication = { gmailMessageId: fixture.gmailMessageId, subject: fixture.subject } as typeof digestRows[0];
}

console.log(JSON.stringify({ replaySummary: stats }, null, 2));

if (shopmyApplication) {
  const platform = await findPlatformActivityByGmailMessage(shopmyApplication.gmailMessageId);
  const partnership = await findExistingPartnershipActivityByGmailMessage(shopmyApplication.gmailMessageId);
  console.log('\nShopMy application replay record:');
  console.log(
    JSON.stringify(
      {
        gmailMessageId: shopmyApplication.gmailMessageId,
        subject: shopmyApplication.subject,
        platformActivity: platform
          ? {
              id: platform.activity.id,
              activityType: platform.activity.activityType,
              platformName: platform.platformName,
              suggestedAction: platform.activity.suggestedAction,
              followUpAt: platform.activity.followUpAt?.toISOString() ?? null,
              createdAt: platform.activity.createdAt.toISOString(),
            }
          : null,
        partnershipActivity: partnership,
        reklaimMatch: partnership?.creatorPartnershipId ?? null,
        fixtureReplay: stats.usedFixture,
      },
      null,
      2,
    ),
  );
} else {
  console.log('\nShopMy platform activities:');
  console.log(JSON.stringify(await listPlatformActivities('ShopMy'), null, 2));
}

process.exit(stats.errors > 0 ? 1 : 0);
