/**
 * Backfill producer-authority fields without altering read/unread state.
 */
import { and, eq, isNull, ne } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems, creatorSkippedRecords, outreachInboundMessages } from '../schema.js';
import {
  isReplyActionable,
  resolveInboundActionability,
  senderDomainFromEmail,
} from '../gmail-inbox/inbound-actionability.js';
import {
  computeSkipMatchIdentity,
  resolveSkipIdentityKey,
} from '../creator-skip/index.js';
import { getLatestDiscovery } from '../benson-discovery/index.js';

async function backfillInboundActionability() {
  const rows = await db.select().from(outreachInboundMessages);
  let updated = 0;
  let replyTasksBefore = 0;
  let replyTasksAfter = 0;

  for (const row of rows) {
    const resolvedBefore = resolveInboundActionability({
      subject: row.subject ?? '',
      bodyText: row.snippet ?? row.subject ?? '',
      senderDomain: senderDomainFromEmail(row.fromEmail),
      matchKind: row.matchKind,
      outreachEmailId: row.outreachEmailId,
      verifiedOutreachThread: Boolean(row.outreachEmailId && row.matchKind === 'outreach_reply'),
    });
    const beforeActionability = row.actionability ?? 'none';
    if (isReplyActionable(beforeActionability)) replyTasksBefore += 1;

    const resolved = resolvedBefore;
    if (row.emailIntent !== resolved.emailIntent || row.actionability !== resolved.actionability) {
      await db
        .update(outreachInboundMessages)
        .set({ emailIntent: resolved.emailIntent, actionability: resolved.actionability })
        .where(eq(outreachInboundMessages.id, row.id));
      updated += 1;
    }

    if (isReplyActionable(resolved.actionability)) replyTasksAfter += 1;
  }

  return { total: rows.length, updated, replyTasksBefore, replyTasksAfter };
}

async function backfillSkipIdentityKeys() {
  const rows = await db
    .select({ skip: creatorSkippedRecords, item: contentItems })
    .from(creatorSkippedRecords)
    .leftJoin(contentItems, eq(contentItems.id, creatorSkippedRecords.contentItemId))
    .where(isNull(creatorSkippedRecords.restoredAt));

  let updated = 0;
  let duplicates = 0;
  let duplicatesReconciled = 0;
  let alreadySet = 0;
  let metadataEnriched = 0;

  for (const { skip, item } of rows) {
    const existingMetadata = (skip.metadata ?? {}) as {
      title?: string;
      skipMatchIdentity?: ReturnType<typeof computeSkipMatchIdentity>;
    };
    const title = item?.topic ?? existingMetadata.title;
    if (!title) continue;

    const skipIdentity = computeSkipMatchIdentity({
      title,
      eventDate: item?.eventStartsAt?.toISOString() ?? null,
      locationName: item?.locationName,
      formattedAddress: item?.formattedAddress,
      venue: item?.locationName,
    });
    const skipIdentityKey =
      skip.skipIdentityKey ??
      skipIdentity?.key ??
      resolveSkipIdentityKey({
        title,
        eventDate: item?.eventStartsAt?.toISOString() ?? null,
        eventEndDate: item?.eventEndsAt?.toISOString() ?? null,
        locationName: item?.locationName,
        formattedAddress: item?.formattedAddress,
        sourceUrl: item?.sourceUrl,
        summary: item?.hook,
      });

    if (skip.skipIdentityKey) {
      alreadySet += 1;
    } else {
      const [conflict] = await db
        .select({ id: creatorSkippedRecords.id })
        .from(creatorSkippedRecords)
        .where(
          and(
            eq(creatorSkippedRecords.skipIdentityKey, skipIdentityKey),
            isNull(creatorSkippedRecords.restoredAt),
            ne(creatorSkippedRecords.id, skip.id),
          ),
        )
        .limit(1);

      if (conflict) {
        duplicates += 1;
        await db
          .update(creatorSkippedRecords)
          .set({
            restoredAt: new Date(),
            metadata: {
              ...existingMetadata,
              canonicalSkipRecordId: conflict.id,
              reconciliationReason: 'duplicate_canonical_skip_identity',
              title,
            },
          })
          .where(eq(creatorSkippedRecords.id, skip.id));
        duplicatesReconciled += 1;
        continue;
      }
    }

    const needsMetadata =
      !existingMetadata.title ||
      (skipIdentity != null && existingMetadata.skipMatchIdentity == null);
    if (skip.skipIdentityKey && !needsMetadata) continue;

    await db
      .update(creatorSkippedRecords)
      .set({
        skipIdentityKey,
        metadata: {
          ...(skip.metadata as object),
          skipIdentityKey,
          skipMatchIdentity: skipIdentity,
          title,
        },
      })
      .where(eq(creatorSkippedRecords.id, skip.id));
    updated += 1;
    if (needsMetadata) metadataEnriched += 1;
  }

  return {
    total: rows.length,
    updated,
    alreadySet,
    duplicates,
    duplicatesReconciled,
    metadataEnriched,
  };
}

async function latestDiscoveryAuthorityCheck() {
  const snapshot = await getLatestDiscovery();
  return {
    pulseItemCount: snapshot?.items.length ?? 0,
    latestDiscoveryId: snapshot?.id ?? null,
  };
}

async function main() {
  const inbound = await backfillInboundActionability();
  const skip = await backfillSkipIdentityKeys();
  const pulse = await latestDiscoveryAuthorityCheck();
  console.log(JSON.stringify({ ok: true, inbound, skip, pulse }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
