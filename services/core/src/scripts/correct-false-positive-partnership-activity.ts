/**
 * Correct a false-positive partnership activity while preserving audit metadata.
 * Does not mutate partnership lifecycle or delete Gmail/digest rows.
 */
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { creatorPartnershipActivities, creatorPartnerships } from '../schema.js';
import { correctFalsePositivePartnershipActivity } from '../creator-partnership/activities.js';
import { classifyEmailIntent } from '../creator-partnership/email-intent.js';

const ACTIVITY_ID = process.argv[2] ?? 'de48d020-1a30-402b-9df7-821c22ff077b';
const GMAIL_MESSAGE_ID = process.argv[3] ?? '19fe59fea23c7cb9';

async function main() {
  const [activity] = await db
    .select()
    .from(creatorPartnershipActivities)
    .where(eq(creatorPartnershipActivities.id, ACTIVITY_ID))
    .limit(1);

  if (!activity) {
    console.error(JSON.stringify({ ok: false, reason: 'activity_not_found', activityId: ACTIVITY_ID }));
    process.exit(1);
  }

  if (activity.gmailMessageId !== GMAIL_MESSAGE_ID) {
    console.warn(
      JSON.stringify({
        warning: 'gmail_message_id_mismatch',
        expected: GMAIL_MESSAGE_ID,
        actual: activity.gmailMessageId,
      }),
    );
  }

  const [partnershipBefore] = await db
    .select({
      id: creatorPartnerships.id,
      pipelineStatus: creatorPartnerships.pipelineStatus,
      brandName: creatorPartnerships.brandName,
    })
    .from(creatorPartnerships)
    .where(eq(creatorPartnerships.id, activity.creatorPartnershipId))
    .limit(1);

  const intent = classifyEmailIntent({
    subject: activity.subject ?? '',
    bodyText: activity.snippet ?? activity.subject ?? '',
    senderDomain: activity.senderDomain,
  });

  const corrected = await correctFalsePositivePartnershipActivity({
    activityId: activity.id,
    emailIntent: intent.intent === 'unknown' ? 'transactional_account' : intent.intent,
    correctionReason:
      'Consumer/customer account confirmation matched on brand name alone; not creator-partnership evidence.',
  });

  const [partnershipAfter] = await db
    .select({
      id: creatorPartnerships.id,
      pipelineStatus: creatorPartnerships.pipelineStatus,
    })
    .from(creatorPartnerships)
    .where(eq(creatorPartnerships.id, activity.creatorPartnershipId))
    .limit(1);

  console.log(
    JSON.stringify(
      {
        ok: true,
        activityId: ACTIVITY_ID,
        gmailMessageId: activity.gmailMessageId,
        classifiedIntent: intent.intent,
        correctedStatus: corrected?.confirmationStatus ?? null,
        partnershipLifecycleUnchanged:
          partnershipBefore?.pipelineStatus === partnershipAfter?.pipelineStatus,
        partnershipBefore: partnershipBefore ?? null,
        partnershipAfter: partnershipAfter ?? null,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
