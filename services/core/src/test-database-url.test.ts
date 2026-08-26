import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MissingTestDatabaseUrlError,
  TestDatabaseUrlUnsafeError,
  assertSafeTestDatabaseUrl,
  deriveTestDatabaseUrlFromLive,
  isForbiddenLiveDatabaseName,
  parsePostgresConnectionIdentity,
  postgresConnectionIdentitiesEqual,
  resolveProcessDatabaseUrl,
} from './test-database-url.js';

const LIVE = 'postgres://social_agent:dev_password@localhost:5433/social_agent';

describe('postgres connection identity', () => {
  it('parses host, port, and database name', () => {
    const id = parsePostgresConnectionIdentity(LIVE);
    assert.deepEqual(id, { host: 'localhost', port: 5433, database: 'social_agent' });
  });

  it('defaults port 5432 and treats postgresql:// as postgres', () => {
    const id = parsePostgresConnectionIdentity('postgresql://u:p@db.example.com/app');
    assert.deepEqual(id, { host: 'db.example.com', port: 5432, database: 'app' });
  });

  it('normalizes 127.0.0.1 and ::1 to localhost', () => {
    assert.equal(parsePostgresConnectionIdentity('postgres://u:p@127.0.0.1:5433/social_agent').host, 'localhost');
    assert.equal(parsePostgresConnectionIdentity('postgres://u:p@[::1]:5433/social_agent').host, 'localhost');
  });

  it('ignores user, password, and query string when comparing identity', () => {
    const a = parsePostgresConnectionIdentity('postgres://alice:secret@localhost:5433/social_agent?sslmode=disable');
    const b = parsePostgresConnectionIdentity('postgres://bob:other@localhost:5433/social_agent');
    assert.equal(postgresConnectionIdentitiesEqual(a, b), true);
  });

  it('treats database names case-insensitively', () => {
    const a = parsePostgresConnectionIdentity('postgres://u:p@localhost:5433/Social_Agent_Test');
    assert.equal(a.database, 'social_agent_test');
  });
});

describe('assertSafeTestDatabaseUrl', () => {
  it('refuses a missing TEST_DATABASE_URL', () => {
    assert.throws(() => assertSafeTestDatabaseUrl('', LIVE), MissingTestDatabaseUrlError);
    assert.throws(() => assertSafeTestDatabaseUrl('   ', LIVE), MissingTestDatabaseUrlError);
  });

  it('refuses TEST_DATABASE_URL that resolves to the live identity', () => {
    assert.throws(
      () => assertSafeTestDatabaseUrl(LIVE, LIVE),
      (err: unknown) => err instanceof TestDatabaseUrlUnsafeError && /live Benson database/.test(String(err)),
    );
    assert.throws(
      () =>
        assertSafeTestDatabaseUrl(
          'postgres://other:pw@127.0.0.1:5433/social_agent',
          LIVE,
        ),
      TestDatabaseUrlUnsafeError,
    );
  });

  it('allows the same host/port with database social_agent_test', () => {
    const id = assertSafeTestDatabaseUrl(
      'postgres://social_agent:dev_password@localhost:5433/social_agent_test',
      LIVE,
    );
    assert.deepEqual(id, { host: 'localhost', port: 5433, database: 'social_agent_test' });
  });

  it('allows a different dedicated test database', () => {
    const id = assertSafeTestDatabaseUrl(
      'postgres://social_agent:dev_password@localhost:5433/benson_pg_test',
      LIVE,
    );
    assert.equal(id.database, 'benson_pg_test');
  });
});

describe('resolveProcessDatabaseUrl', () => {
  it('production/runtime keeps DATABASE_URL when not under node:test', () => {
    const url = resolveProcessDatabaseUrl({
      liveDatabaseUrl: LIVE,
      testDatabaseUrl: 'postgres://social_agent:dev_password@localhost:5433/social_agent_test',
      underNodeTest: false,
      forceTestDatabase: false,
    });
    assert.equal(url, LIVE);
  });

  it('production ignores TEST_DATABASE_URL when present in env-like input', () => {
    const url = resolveProcessDatabaseUrl({
      liveDatabaseUrl: LIVE,
      testDatabaseUrl: 'postgres://social_agent:x@localhost:5433/social_agent_test',
      underNodeTest: false,
      forceTestDatabase: false,
    });
    assert.equal(url, LIVE);
  });

  it('node:test with missing TEST_DATABASE_URL fails closed', () => {
    assert.throws(
      () =>
        resolveProcessDatabaseUrl({
          liveDatabaseUrl: LIVE,
          testDatabaseUrl: undefined,
          underNodeTest: true,
          forceTestDatabase: false,
        }),
      MissingTestDatabaseUrlError,
    );
  });

  it('node:test with TEST_DATABASE_URL == live identity fails closed', () => {
    assert.throws(
      () =>
        resolveProcessDatabaseUrl({
          liveDatabaseUrl: LIVE,
          testDatabaseUrl: LIVE,
          underNodeTest: true,
          forceTestDatabase: false,
        }),
      TestDatabaseUrlUnsafeError,
    );
  });

  it('node:test uses TEST_DATABASE_URL when it is a distinct database', () => {
    const testUrl = 'postgres://social_agent:dev_password@localhost:5433/social_agent_test';
    const url = resolveProcessDatabaseUrl({
      liveDatabaseUrl: LIVE,
      testDatabaseUrl: testUrl,
      underNodeTest: true,
      forceTestDatabase: false,
    });
    assert.equal(url, testUrl);
  });
});

describe('deriveTestDatabaseUrlFromLive', () => {
  it('swaps only the database name', () => {
    const derived = deriveTestDatabaseUrlFromLive(LIVE);
    assert.equal(derived, 'postgres://social_agent:dev_password@localhost:5433/social_agent_test');
    const id = parsePostgresConnectionIdentity(derived);
    assert.equal(id.database, 'social_agent_test');
    assert.equal(postgresConnectionIdentitiesEqual(id, parsePostgresConnectionIdentity(LIVE)), false);
  });
});

describe('forbidden live database name', () => {
  it('identifies social_agent and ignores other names', () => {
    assert.equal(isForbiddenLiveDatabaseName('social_agent'), true);
    assert.equal(isForbiddenLiveDatabaseName('Social_Agent'), true);
    assert.equal(isForbiddenLiveDatabaseName('social_agent_test'), false);
  });
});
