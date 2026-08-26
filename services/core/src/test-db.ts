/**
 * Shared postgres-backed test database handle.
 * Import this instead of `./db.js` from tests that read or write Postgres.
 *
 * Does not connect on import. The first query (via `db` / `getTestDb()`)
 * requires TEST_DATABASE_URL and refuses the live Benson identity.
 */
import { env } from './env.js';
import { db } from './db.js';
import {
  assertSafeTestDatabaseUrl,
  MissingTestDatabaseUrlError,
  USE_TEST_DATABASE_ENV,
} from './test-database-url.js';

export { db };
export type { DB } from './db.js';
export {
  MissingTestDatabaseUrlError,
  TestDatabaseUrlUnsafeError,
  assertSafeTestDatabaseUrl,
} from './test-database-url.js';

export function assertSafeTestDatabase(): string {
  const testUrl = process.env.TEST_DATABASE_URL?.trim();
  if (!testUrl) {
    throw new MissingTestDatabaseUrlError();
  }
  assertSafeTestDatabaseUrl(testUrl, env.DATABASE_URL);
  process.env[USE_TEST_DATABASE_ENV] = '1';
  return testUrl;
}

export function getTestDb(): typeof db {
  assertSafeTestDatabase();
  return db;
}
