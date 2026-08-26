/**
 * Create / migrate the disposable postgres test database.
 *
 * Usage (from repo root or services/core):
 *   TEST_DATABASE_URL=postgres://social_agent:...@localhost:5433/social_agent_test \
 *     pnpm --filter @social-agent/core setup:test-db
 *
 * Optional: --reset drops and recreates the TEST database only.
 * Refuses to run against any database named social_agent.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { env } from '../env.js';
import {
  PREFERRED_TEST_DATABASE_NAME,
  assertSafeTestDatabaseUrl,
  deriveTestDatabaseUrlFromLive,
  isForbiddenLiveDatabaseName,
  parsePostgresConnectionIdentity,
} from '../test-database-url.js';

const here = dirname(fileURLToPath(import.meta.url));
const INIT_DIR = resolve(here, '../../../../db/init');
const MIGRATIONS_DIR = resolve(here, '../../../../db/migrations');
const SKIP_INIT = new Set(['01_create_n8n_db.sql']);

function requireTestDatabaseUrl(): string {
  const fromEnv = process.env.TEST_DATABASE_URL?.trim();
  if (fromEnv) return fromEnv;
  const derived = deriveTestDatabaseUrlFromLive(env.DATABASE_URL);
  throw new Error(
    `TEST_DATABASE_URL is required. Suggested value (not applied): ${derived}\nSet TEST_DATABASE_URL and re-run. Refusing to guess, to avoid touching live Benson.`,
  );
}

function maintenanceUrl(connectionUrl: string): string {
  const parsed = new URL(connectionUrl);
  parsed.pathname = '/postgres';
  return parsed.toString();
}

function quoteIdent(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
    throw new Error(`Refusing unsafe database identifier: ${name}`);
  }
  return `"${name}"`;
}

function sqlFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, 'en'));
}

function numericPrefix(filename: string): number {
  const match = filename.match(/^(\d+)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

/** Init-only files first, then migration files overwrite the same numeric prefix (live migrate path). */
function orderedSchemaFiles(): Array<{ label: string; absolutePath: string }> {
  const initFiles = sqlFiles(INIT_DIR).filter((f) => !SKIP_INIT.has(f));
  const byNumber = new Map<number, { label: string; absolutePath: string }>();
  for (const file of initFiles) {
    byNumber.set(numericPrefix(file), {
      label: `init/${file}`,
      absolutePath: resolve(INIT_DIR, file),
    });
  }
  for (const file of sqlFiles(MIGRATIONS_DIR)) {
    const n = numericPrefix(file);
    byNumber.set(n, {
      label: `migrations/${file}`,
      absolutePath: resolve(MIGRATIONS_DIR, file),
    });
  }
  return [...byNumber.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, value]) => value);
}

async function applySqlFile(client: postgres.Sql, absolutePath: string, label: string): Promise<void> {
  const sql = readFileSync(absolutePath, 'utf8');
  console.log(`  applying ${label}`);
  await client.unsafe(sql);
}

async function ensureTestFixtures(client: postgres.Sql): Promise<void> {
  const campaigns = await client<{ n: number }[]>`
    SELECT count(*)::int AS n FROM campaigns
  `;
  if ((campaigns[0]?.n ?? 0) === 0) {
    await client`
      INSERT INTO campaigns (name, description, active)
      VALUES ('Test Isolation Campaign', 'Disposable social_agent_test campaign', true)
    `;
    console.log('  seeded campaigns: Test Isolation Campaign');
  }

  const accountsExist = await client<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'creator_accounts'
    ) AS exists
  `;
  if (accountsExist[0]?.exists) {
    const accounts = await client<{ n: number }[]>`
      SELECT count(*)::int AS n FROM creator_accounts
    `;
    if ((accounts[0]?.n ?? 0) === 0) {
      await client`
        INSERT INTO creator_accounts (platform, username, display_name, connection_status)
        VALUES ('tiktok', 'test_isolation_creator', 'Test Isolation Creator', 'import_only')
      `;
      console.log('  seeded creator_accounts: test_isolation_creator');
    }
  }
}

async function main(): Promise<void> {
  const reset = process.argv.includes('--reset');
  const testUrl = requireTestDatabaseUrl();
  const testId = assertSafeTestDatabaseUrl(testUrl, env.DATABASE_URL);

  if (isForbiddenLiveDatabaseName(testId.database)) {
    throw new Error(
      `Refusing test-database setup against database name "${testId.database}". Use ${PREFERRED_TEST_DATABASE_NAME}.`,
    );
  }

  console.log(`Test DB identity: ${testId.host}:${testId.port}/${testId.database}`);

  const admin = postgres(maintenanceUrl(testUrl), { max: 1, idle_timeout: 5 });
  try {
    if (reset) {
      console.log(`Dropping ${testId.database} (--reset)`);
      await admin`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = ${testId.database} AND pid <> pg_backend_pid()
      `;
      await admin.unsafe(`DROP DATABASE IF EXISTS ${quoteIdent(testId.database)} WITH (FORCE)`);
    }

    const existing = await admin<{ datname: string }[]>`
      SELECT datname FROM pg_database WHERE datname = ${testId.database}
    `;
    if (existing.length === 0) {
      const owner = decodeURIComponent(new URL(testUrl).username || 'social_agent');
      console.log(`Creating database ${testId.database}`);
      await admin.unsafe(`CREATE DATABASE ${quoteIdent(testId.database)} OWNER ${quoteIdent(owner)}`);
    } else {
      console.log(`Database ${testId.database} already exists`);
    }
  } finally {
    await admin.end({ timeout: 2 });
  }

  const client = postgres(testUrl, { max: 1, idle_timeout: 5 });
  try {
    const hasCampaigns = await client<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'campaigns'
      ) AS exists
    `;
    const schemaFiles = orderedSchemaFiles();

    if (!hasCampaigns[0]?.exists) {
      console.log('Applying schema in numeric order (db/init + migration-only files, skip n8n)...');
      for (const file of schemaFiles) {
        await applySqlFile(client, file.absolutePath, file.label);
      }
    } else {
      console.log('Base schema already present; applying remaining migration-only files...');
      const initBasenames = new Set(sqlFiles(INIT_DIR));
      for (const file of schemaFiles) {
        const basename = file.label.replace(/^(init|migrations)\//, '');
        if (initBasenames.has(basename)) continue;
        try {
          await applySqlFile(client, file.absolutePath, file.label);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (/already exists/i.test(message)) {
            console.log(`  skip ${file.label} (already exists)`);
            continue;
          }
          throw err;
        }
      }
    }

    await ensureTestFixtures(client);
    const check = await client<{ db: string }[]>`SELECT current_database() AS db`;
    if (check[0]?.db !== testId.database) {
      throw new Error(`Connected to unexpected database ${check[0]?.db}`);
    }
    console.log(`Ready: ${check[0].db}`);
  } finally {
    await client.end({ timeout: 2 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
