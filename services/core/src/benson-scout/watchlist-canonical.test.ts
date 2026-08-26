import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inArray } from 'drizzle-orm';
import { assertSafeTestDatabase, db } from '../test-db.js';
import { sourceWatchers } from '../schema.js';
import { canonicalizeWatchSource } from './canonical-source.js';
import {
  createWatchedSource,
  findWatchSourceByCanonicalKey,
  watchlistSaveErrorMessage,
  watchSourceCanonicalConflictInsert,
} from './watchlist.js';

const TEST_PREFIX = 'ZZZ_TEST_FIXTURE_watchlist_canonical_';
const insertedIds: string[] = [];

async function insertWatcher(overrides: Partial<typeof sourceWatchers.$inferInsert>) {
  const [row] = await db
    .insert(sourceWatchers)
    .values({
      sourceName: `${TEST_PREFIX}source`,
      sourceUrl: 'https://www.instagram.com/zzz_test_fixture_account/',
      ...overrides,
    })
    .returning({ id: sourceWatchers.id });
  assert.ok(row, 'expected insert to return a row');
  insertedIds.push(row.id);
  return row.id;
}

describe('watchlist canonical identity — DB-level regression (jasfoodjourney duplicate-row bug)', () => {
  before(() => {
    assertSafeTestDatabase();
  });

  after(async () => {
    if (insertedIds.length > 0) {
      await db.delete(sourceWatchers).where(inArray(sourceWatchers.id, insertedIds));
    }
  });

  it('rejects a second row with the same canonical_key at the database level', async () => {
    const key = 'instagram:account:zzz_test_fixture_account';
    await insertWatcher({ canonicalKey: key });

    await assert.rejects(
      () => insertWatcher({ canonicalKey: key }),
      /duplicate key value violates unique constraint|canonical_key/i,
      'expected the unique index on canonical_key to reject a second identical source',
    );
  });

  it('findWatchSourceByCanonicalKey resolves the single existing row for any URL-variant-derived key', async () => {
    const canonicalUrl1 = canonicalizeWatchSource('https://www.instagram.com/zzz_test_fixture_lookup/');
    const canonicalUrl2 = canonicalizeWatchSource('https://instagram.com/ZZZ_Test_Fixture_Lookup?hl=en');
    assert.equal(canonicalUrl1.key, canonicalUrl2.key);

    const id = await insertWatcher({
      sourceUrl: canonicalUrl1.canonicalUrl,
      canonicalKey: canonicalUrl1.key,
    });

    const found = await findWatchSourceByCanonicalKey(canonicalUrl2.key);
    assert.ok(found, 'expected to find the source via a differently-formatted URL variant');
    assert.equal(found!.id, id);
  });

  it('allows NULL canonical_key for multiple rows (single-item / unrecognized sources are not merged)', async () => {
    await insertWatcher({ canonicalKey: null, sourceUrl: 'https://example.com/one-off-a' });
    await insertWatcher({ canonicalKey: null, sourceUrl: 'https://example.com/one-off-b' });
    // No assertion needed beyond "did not throw" — a partial unique index (WHERE canonical_key
    // IS NOT NULL) must allow any number of NULL canonical_key rows.
  });

  it('ON CONFLICT targets the partial unique index (canonical_key WHERE NOT NULL)', () => {
    const query = watchSourceCanonicalConflictInsert({
      sourceName: `${TEST_PREFIX}sql`,
      sourceUrl: 'https://www.instagram.com/zzz_test_fixture_sql/',
      canonicalKey: 'instagram:account:zzz_test_fixture_sql',
    }).toSQL();
    assert.match(query.sql, /on conflict \("canonical_key"\)/i);
    assert.match(query.sql, /where .*canonical_key.*is not null/i);
  });

  it('createWatchedSource upserts Instagram profile variants onto one row', async () => {
    const jasBefore = await findWatchSourceByCanonicalKey('instagram:account:jasfoodjourney');
    assert.ok(jasBefore, 'expected existing @jasfoodjourney watch source to remain intact');

    const first = await createWatchedSource({
      url: 'https://www.instagram.com/zzz_test_fixture_kclifestyle',
      monitoringMode: 'WATCH_ACCOUNT',
    });
    insertedIds.push(first.watcher.id);
    assert.equal(first.alreadyWatching, false);
    assert.equal(first.watcher.canonicalKey, 'instagram:account:zzz_test_fixture_kclifestyle');

    const second = await createWatchedSource({
      url: 'https://www.instagram.com/zzz_test_fixture_kclifestyle/?igsh=abc&utm_source=ig',
      monitoringMode: 'WATCH_ACCOUNT',
    });
    assert.equal(second.alreadyWatching, true);
    assert.equal(second.watcher.id, first.watcher.id);

    const other = await createWatchedSource({
      url: 'https://www.instagram.com/zzz_test_fixture_other_account/',
      monitoringMode: 'WATCH_ACCOUNT',
    });
    insertedIds.push(other.watcher.id);
    assert.equal(other.alreadyWatching, false);
    assert.notEqual(other.watcher.id, first.watcher.id);
    assert.equal(other.watcher.canonicalKey, 'instagram:account:zzz_test_fixture_other_account');

    const jasAfter = await findWatchSourceByCanonicalKey('instagram:account:jasfoodjourney');
    assert.ok(jasAfter);
    assert.equal(jasAfter!.id, jasBefore!.id);
  });

  it('hides raw PostgreSQL ON CONFLICT errors from operators', () => {
    const msg = watchlistSaveErrorMessage(
      new Error('there is no unique or exclusion constraint matching the ON CONFLICT specification'),
    );
    assert.doesNotMatch(msg, /ON CONFLICT/i);
    assert.doesNotMatch(msg, /unique or exclusion constraint/i);
    assert.match(msg, /Could not save this Watchlist source/i);
  });
});
