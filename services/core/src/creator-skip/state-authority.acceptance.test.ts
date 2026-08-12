import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { eq, inArray } from 'drizzle-orm';
import { getLatestDiscovery } from '../benson-discovery/index.js';
import { db } from '../db.js';
import {
  bensonDiscoveries,
  campaigns,
  contentItems,
  creatorSkippedRecords,
} from '../schema.js';
import {
  isSkippedByMatchers,
  loadSkipMatchers,
  restoreSkippedRecord,
  skipDiscoveryRecord,
} from './index.js';

const PREFIX = `ZZZ_STATE_AUTHORITY_${randomUUID()}`;
const EVENT_DATE = new Date('2031-09-12T01:30:00.000Z');
const LATER_DATE = new Date('2031-10-04T01:30:00.000Z');
const CITY = 'Kansas City, MO';

let campaignId: string;
const contentIds: string[] = [];
const skipIds: string[] = [];
const discoveryIds: string[] = [];

async function insertEvent(input: {
  title: string;
  eventDate?: Date;
  sourceUrl: string;
}): Promise<string> {
  const [row] = await db
    .insert(contentItems)
    .values({
      campaignId,
      type: 'industry_insight',
      language: 'en',
      state: 'planned',
      topic: input.title,
      eventStartsAt: input.eventDate ?? EVENT_DATE,
      locationName: CITY,
      sourceUrl: input.sourceUrl,
      creatorValueStatus: 'creator_candidate',
    })
    .returning({ id: contentItems.id });
  assert.ok(row);
  contentIds.push(row.id);
  return row.id;
}

async function skipFixture(
  contentItemId: string,
  snoozeUntil?: Date,
): Promise<void> {
  const result = await skipDiscoveryRecord({
    contentItemId,
    sourceScreen: 'unknown',
    snoozeUntil,
  });
  const [row] = await db
    .select({ id: creatorSkippedRecords.id })
    .from(creatorSkippedRecords)
    .where(eq(creatorSkippedRecords.skipIdentityKey, result.skipIdentityKey))
    .limit(1);
  assert.ok(row);
  if (!skipIds.includes(row.id)) skipIds.push(row.id);
}

function eventCandidate(input: {
  id: string;
  title: string;
  eventDate?: Date;
  sourceUrl: string;
}) {
  return {
    id: input.id,
    title: input.title,
    eventDate: (input.eventDate ?? EVENT_DATE).toISOString(),
    locationName: CITY,
    sourceUrl: input.sourceUrl,
  };
}

describe('creator skip state authority — durable acceptance', () => {
  before(async () => {
    const [campaign] = await db.select({ id: campaigns.id }).from(campaigns).limit(1);
    assert.ok(campaign, 'expected an existing campaign for acceptance fixtures');
    campaignId = campaign.id;
  });

  after(async () => {
    if (discoveryIds.length > 0) {
      await db.delete(bensonDiscoveries).where(inArray(bensonDiscoveries.id, discoveryIds));
    }
    if (contentIds.length > 0) {
      await db.delete(contentItems).where(inArray(contentItems.id, contentIds));
    }
    if (skipIds.length > 0) {
      await db.delete(creatorSkippedRecords).where(inArray(creatorSkippedRecords.id, skipIds));
    }
  });

  it('suppresses the same canonical event across source/query changes but not a later event', async () => {
    const title = `${PREFIX} Quartet`;
    const originalId = await insertEvent({
      title,
      sourceUrl: 'https://source-a.example/events/quartet',
    });
    await skipFixture(originalId);

    const matchers = await loadSkipMatchers();

    assert.equal(
      isSkippedByMatchers(
        matchers,
        eventCandidate({
          id: originalId,
          title,
          sourceUrl: 'https://source-a.example/events/quartet',
        }),
      ),
      true,
      'same event from same source must remain suppressed',
    );

    assert.equal(
      isSkippedByMatchers(
        matchers,
        eventCandidate({
          id: randomUUID(),
          title: `${title} Live`,
          sourceUrl: 'https://source-b.example/tickets/quartet?campaign=new',
        }),
      ),
      true,
      'same event from a different source URL must remain suppressed',
    );

    assert.equal(
      isSkippedByMatchers(
        matchers,
        eventCandidate({
          id: randomUUID(),
          title,
          sourceUrl: 'https://query-result.example/events/quartet',
        }),
      ),
      true,
      'same canonical event from a different discovery query must remain suppressed',
    );

    assert.equal(
      isSkippedByMatchers(
        matchers,
        eventCandidate({
          id: randomUUID(),
          title,
          eventDate: LATER_DATE,
          sourceUrl: 'https://source-a.example/events/quartet-october',
        }),
      ),
      false,
      'same performer on a different date/event must remain eligible',
    );
  });

  it('keeps Later active until due and allows the event afterward', async () => {
    const title = `${PREFIX} Snooze Ensemble`;
    const id = await insertEvent({
      title,
      sourceUrl: 'https://source.example/events/snooze-ensemble',
    });
    const future = new Date(Date.now() + 60_000);
    await skipFixture(id, future);

    let matchers = await loadSkipMatchers();
    assert.equal(
      isSkippedByMatchers(
        matchers,
        eventCandidate({
          id,
          title,
          sourceUrl: 'https://source.example/events/snooze-ensemble',
        }),
      ),
      true,
      'Later must suppress before snooze_until',
    );

    await db
      .update(creatorSkippedRecords)
      .set({ snoozeUntil: new Date(Date.now() - 1_000) })
      .where(eq(creatorSkippedRecords.contentItemId, id));

    matchers = await loadSkipMatchers();
    assert.equal(
      isSkippedByMatchers(
        matchers,
        eventCandidate({
          id,
          title,
          sourceUrl: 'https://source.example/events/snooze-ensemble',
        }),
      ),
      false,
      'Later must become eligible after snooze_until',
    );
  });

  it('restore makes a permanently skipped event eligible again', async () => {
    const title = `${PREFIX} Restore Orchestra`;
    const id = await insertEvent({
      title,
      sourceUrl: 'https://source.example/events/restore-orchestra',
    });
    await skipFixture(id);
    assert.equal(
      isSkippedByMatchers(
        await loadSkipMatchers(),
        eventCandidate({
          id,
          title,
          sourceUrl: 'https://source.example/events/restore-orchestra',
        }),
      ),
      true,
    );

    await restoreSkippedRecord(id);
    assert.equal(
      isSkippedByMatchers(
        await loadSkipMatchers(),
        eventCandidate({
          id,
          title,
          sourceUrl: 'https://source.example/events/restore-orchestra',
        }),
      ),
      false,
      'restore/unskip must make the event eligible',
    );
  });

  it('survives content deletion/re-ingestion and filters getLatestDiscovery/Pulse data', async () => {
    const title = `${PREFIX} Durable Trio`;
    const originalId = await insertEvent({
      title,
      sourceUrl: 'https://source-a.example/events/durable-trio',
    });
    await skipFixture(originalId);

    await db.delete(contentItems).where(eq(contentItems.id, originalId));
    const reingestedId = await insertEvent({
      title: `${title} Live`,
      sourceUrl: 'https://source-b.example/new-query/durable-trio',
    });

    const reingested = eventCandidate({
      id: reingestedId,
      title: `${title} Live`,
      sourceUrl: 'https://source-b.example/new-query/durable-trio',
    });
    assert.equal(
      isSkippedByMatchers(await loadSkipMatchers(), reingested),
      true,
      'permanent skip tombstone must survive deletion and re-ingestion',
    );

    const controlId = await insertEvent({
      title: `${PREFIX} Eligible Control`,
      sourceUrl: 'https://source.example/events/control',
    });
    const [snapshot] = await db
      .insert(bensonDiscoveries)
      .values({
        runHash: `${PREFIX}-snapshot`,
        createdAt: new Date(Date.now() + 60_000),
        searchQueries: ['acceptance query'],
        summary: 'state authority acceptance fixture',
        itemsFound: [
          {
            contentItemId: reingestedId,
            title: `${title} Live`,
            location: CITY,
            eventStartsAt: EVENT_DATE.toISOString(),
            sourceUrl: 'https://source-b.example/new-query/durable-trio',
            outcome: 'created',
          },
          {
            contentItemId: controlId,
            title: `${PREFIX} Eligible Control`,
            location: CITY,
            eventStartsAt: EVENT_DATE.toISOString(),
            sourceUrl: 'https://source.example/events/control',
            outcome: 'created',
          },
        ],
      })
      .returning({ id: bensonDiscoveries.id });
    assert.ok(snapshot);
    discoveryIds.push(snapshot.id);

    const latest = await getLatestDiscovery();
    assert.ok(latest);
    assert.equal(
      latest.items.some((item) => item.contentItemId === reingestedId),
      false,
      'getLatestDiscovery must omit skipped canonical events',
    );
    assert.equal(
      latest.items.some((item) => item.contentItemId === controlId),
      true,
      'getLatestDiscovery must retain eligible controls',
    );
  });
});
