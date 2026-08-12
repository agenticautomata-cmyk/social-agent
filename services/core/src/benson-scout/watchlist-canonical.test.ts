import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { sourceWatchers } from '../schema.js';
import { canonicalizeWatchSource } from './canonical-source.js';
import { findWatchSourceByCanonicalKey } from './watchlist.js';

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
});
