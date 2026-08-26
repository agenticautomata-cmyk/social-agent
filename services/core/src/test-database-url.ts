/**
 * Connection-identity helpers for isolating postgres-backed tests from live Benson.
 * Pure functions — no database I/O.
 */

export const FORBIDDEN_LIVE_DATABASE_NAME = 'social_agent';
export const PREFERRED_TEST_DATABASE_NAME = 'social_agent_test';
export const USE_TEST_DATABASE_ENV = 'BENSON_USE_TEST_DATABASE';

export type PostgresConnectionIdentity = {
  host: string;
  port: number;
  database: string;
};

export class MissingTestDatabaseUrlError extends Error {
  constructor() {
    super(
      'TEST_DATABASE_URL is required for postgres-backed tests. Refusing to fall back to DATABASE_URL. Create the dedicated database social_agent_test and set TEST_DATABASE_URL (see .env.example).',
    );
    this.name = 'MissingTestDatabaseUrlError';
  }
}

export class TestDatabaseUrlUnsafeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TestDatabaseUrlUnsafeError';
  }
}

function normalizeHost(host: string): string {
  const lower = host.trim().toLowerCase();
  if (lower === '127.0.0.1' || lower === '::1' || lower === '[::1]') return 'localhost';
  return lower;
}

export function parsePostgresConnectionIdentity(connectionUrl: string): PostgresConnectionIdentity {
  const trimmed = connectionUrl.trim();
  if (!trimmed) {
    throw new TestDatabaseUrlUnsafeError('Postgres connection URL is empty');
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new TestDatabaseUrlUnsafeError('Invalid Postgres connection URL');
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new TestDatabaseUrlUnsafeError(
      `Connection URL must use postgres:// or postgresql:// (got ${parsed.protocol})`,
    );
  }
  const host = normalizeHost(parsed.hostname);
  const port = parsed.port ? Number(parsed.port) : 5432;
  if (!Number.isFinite(port) || port <= 0) {
    throw new TestDatabaseUrlUnsafeError('Postgres connection URL has an invalid port');
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, '').split('/')[0] ?? '')
    .trim()
    .toLowerCase();
  if (!host) {
    throw new TestDatabaseUrlUnsafeError('Postgres connection URL is missing a host');
  }
  if (!database) {
    throw new TestDatabaseUrlUnsafeError('Postgres connection URL is missing a database name');
  }
  return { host, port, database };
}

export function postgresConnectionIdentitiesEqual(
  a: PostgresConnectionIdentity,
  b: PostgresConnectionIdentity,
): boolean {
  return a.host === b.host && a.port === b.port && a.database === b.database;
}

export function assertSafeTestDatabaseUrl(testUrl: string, liveUrl: string): PostgresConnectionIdentity {
  const trimmed = testUrl.trim();
  if (!trimmed) {
    throw new MissingTestDatabaseUrlError();
  }
  const testId = parsePostgresConnectionIdentity(trimmed);
  const liveId = parsePostgresConnectionIdentity(liveUrl);
  if (postgresConnectionIdentitiesEqual(testId, liveId)) {
    throw new TestDatabaseUrlUnsafeError(
      `TEST_DATABASE_URL points at the live Benson database (${testId.host}:${testId.port}/${testId.database}). Refusing to run postgres-backed tests.`,
    );
  }
  return testId;
}

export function isForbiddenLiveDatabaseName(database: string): boolean {
  return database.trim().toLowerCase() === FORBIDDEN_LIVE_DATABASE_NAME;
}

export function deriveTestDatabaseUrlFromLive(
  liveUrl: string,
  testDatabaseName: string = PREFERRED_TEST_DATABASE_NAME,
): string {
  const parsed = new URL(liveUrl.trim());
  parsed.pathname = `/${testDatabaseName}`;
  return parsed.toString();
}

export function resolveProcessDatabaseUrl(input: {
  liveDatabaseUrl: string;
  testDatabaseUrl: string | undefined;
  underNodeTest: boolean;
  forceTestDatabase: boolean;
}): string {
  if (input.underNodeTest || input.forceTestDatabase) {
    const testUrl = input.testDatabaseUrl?.trim();
    if (!testUrl) {
      throw new MissingTestDatabaseUrlError();
    }
    assertSafeTestDatabaseUrl(testUrl, input.liveDatabaseUrl);
    return testUrl;
  }
  return input.liveDatabaseUrl;
}
