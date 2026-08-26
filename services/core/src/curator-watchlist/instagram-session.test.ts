import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../test-db.js';
import { sourceWatchers } from '../schema.js';
import {
  instagramWatcherFlagsFromSharedSession,
  sharedInstagramSessionReady,
  syncInstagramWatchersWithSharedSession,
} from './instagram-session.js';
import { createWatchedSource, findWatchSourceByCanonicalKey } from '../benson-scout/watchlist.js';

const TEST_PREFIX = 'ZZZ_TEST_FIXTURE_ig_session_';
const insertedIds: string[] = [];

describe('shared Instagram session → Watchlist source flags', () => {
  it('does not require a per-account login when the platform session is ready', () => {
    const flags = instagramWatcherFlagsFromSharedSession({
      sessionReady: true,
      monitoringMode: 'WATCH_ACCOUNT',
    });
    assert.equal(flags.sessionStatus, 'ready');
    assert.equal(flags.authenticationRequired, false);
    assert.equal(flags.paused, false);
    assert.notEqual(flags.healthStatus, 'login_required');
  });

  it('marks login required only when the shared session is missing', () => {
    const flags = instagramWatcherFlagsFromSharedSession({
      sessionReady: false,
      monitoringMode: 'WATCH_ACCOUNT',
    });
    assert.equal(flags.sessionStatus, 'login_required');
    assert.equal(flags.authenticationRequired, true);
    assert.equal(flags.paused, true);
  });

  it('does not pause a one-off SINGLE_ITEM even without a session', () => {
    const flags = instagramWatcherFlagsFromSharedSession({
      sessionReady: false,
      monitoringMode: 'SINGLE_ITEM',
    });
    assert.equal(flags.paused, false);
  });
});

describe('Watchlist Instagram sources reuse the shared session (db)', () => {
  after(async () => {
    if (insertedIds.length > 0) {
      await db.delete(sourceWatchers).where(inArray(sourceWatchers.id, insertedIds));
    }
  });

  it('existing @jasfoodjourney stays unpaused when the shared session is valid', async () => {
    const jas = await findWatchSourceByCanonicalKey('instagram:account:jasfoodjourney');
    assert.ok(jas, 'expected @jasfoodjourney to remain on Watchlist');
    const ready = await sharedInstagramSessionReady();
    if (!ready) return;
    await syncInstagramWatchersWithSharedSession(true);
    const after = await findWatchSourceByCanonicalKey('instagram:account:jasfoodjourney');
    assert.ok(after);
    assert.equal(after!.id, jas!.id);
    assert.equal(after!.paused, false);
    assert.notEqual(after!.sessionStatus, 'login_required');
  });

  it('a login_required Instagram source resumes when the shared session is valid', async () => {
    const ready = await sharedInstagramSessionReady();
    assert.equal(ready, true, 'shared Instagram session must be seeded for this regression');

    const [row] = await db
      .insert(sourceWatchers)
      .values({
        sourceName: `${TEST_PREFIX}kclifestyle`,
        sourceUrl: 'https://www.instagram.com/zzz_test_fixture_ig_session/',
        platform: 'instagram',
        adapterType: 'social_account',
        monitoringMode: 'WATCH_ACCOUNT',
        watcherKind: 'curator',
        canonicalKey: 'instagram:account:zzz_test_fixture_ig_session',
        authenticationRequired: true,
        sessionStatus: 'login_required',
        paused: true,
        healthStatus: 'login_required',
        checkFrequencyMs: 12 * 60 * 60 * 1000,
      })
      .returning({ id: sourceWatchers.id });
    assert.ok(row);
    insertedIds.push(row.id);

    const sync = await syncInstagramWatchersWithSharedSession(true);
    assert.ok(sync.sessionReady);
    assert.ok(sync.updated >= 1);

    const [after] = await db
      .select({
        paused: sourceWatchers.paused,
        sessionStatus: sourceWatchers.sessionStatus,
        authenticationRequired: sourceWatchers.authenticationRequired,
        healthStatus: sourceWatchers.healthStatus,
        checkFrequencyMs: sourceWatchers.checkFrequencyMs,
      })
      .from(sourceWatchers)
      .where(eq(sourceWatchers.id, row.id))
      .limit(1);

    assert.equal(after?.paused, false);
    assert.equal(after?.sessionStatus, 'ready');
    assert.equal(after?.authenticationRequired, false);
    assert.notEqual(after?.healthStatus, 'login_required');
    assert.equal(after?.checkFrequencyMs, 12 * 60 * 60 * 1000);
  });

  it('createWatchedSource for a new Instagram profile reuses the shared session', async () => {
    const ready = await sharedInstagramSessionReady();
    assert.equal(ready, true);

    const created = await createWatchedSource({
      url: 'https://www.instagram.com/zzz_test_fixture_ig_session_create/',
      monitoringMode: 'WATCH_ACCOUNT',
    });
    insertedIds.push(created.watcher.id);
    assert.equal(created.alreadyWatching, false);
    assert.equal(created.watcher.paused, false);
    assert.equal(created.watcher.sessionStatus, 'ready');
    assert.notEqual(created.watcher.healthStatus, 'login_required');
  });

  it('kclifestylegirl row, if present, resolves the shared session instead of login required', async () => {
    const ready = await sharedInstagramSessionReady();
    if (!ready) return;
    const existing = await findWatchSourceByCanonicalKey('instagram:account:kclifestylegirl');
    if (!existing) return;
    await syncInstagramWatchersWithSharedSession(true);
    const after = await findWatchSourceByCanonicalKey('instagram:account:kclifestylegirl');
    assert.ok(after);
    assert.equal(after!.paused, false);
    assert.equal(after!.sessionStatus, 'ready');
  });
});
