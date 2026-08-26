import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from './env.js';
import * as schema from './schema.js';
import { resolveProcessDatabaseUrl, USE_TEST_DATABASE_ENV } from './test-database-url.js';

function resolveDatabaseUrl(): string {
  return resolveProcessDatabaseUrl({
    liveDatabaseUrl: env.DATABASE_URL,
    testDatabaseUrl: process.env.TEST_DATABASE_URL,
    underNodeTest: Boolean(process.env.NODE_TEST_CONTEXT),
    forceTestDatabase: process.env[USE_TEST_DATABASE_ENV] === '1',
  });
}

function createDb() {
  const connection = postgres(resolveDatabaseUrl(), {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return drizzle(connection, { schema });
}

type DrizzleDb = ReturnType<typeof createDb>;

let instance: DrizzleDb | undefined;

function getDb(): DrizzleDb {
  if (!instance) {
    instance = createDb();
  }
  return instance;
}

/**
 * Lazy Drizzle handle. Production/runtime (no node:test) always uses DATABASE_URL.
 * Under `node --test`, the first query requires TEST_DATABASE_URL and refuses the live identity.
 */
export const db: DrizzleDb = new Proxy({} as DrizzleDb, {
  get(_target, prop, _receiver) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = Reflect.get(real, prop, real);
    if (typeof value === 'function') {
      return value.bind(real);
    }
    return value;
  },
  has(_target, prop) {
    return prop in (getDb() as object);
  },
});

export { schema };
export type DB = DrizzleDb;
