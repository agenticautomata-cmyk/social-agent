# Postgres test / live Benson database isolation (S0)

Date: 2026-08-22 (operator timezone America/Chicago)

**Scope: test/live database isolation only.** Opportunity fingerprints, SCHEELS research rebuild, junk partnership cleanup, Calendar, Discover, and sponsors were not changed.

---

## Executive verdict

Postgres-backed tests can no longer silently use live Benson.

- Runtime (API/workers/scripts) still uses `DATABASE_URL` → `social_agent` on `localhost:5433`.
- Any `node --test` process that touches `db` **requires** `TEST_DATABASE_URL` and **refuses** if that URL is missing or resolves to the same host/port/database as `DATABASE_URL`.
- There is **no fallback** from `TEST_DATABASE_URL` to `DATABASE_URL`.
- Dedicated local test database: **`social_agent_test`** on the same Docker Postgres server.
- Verification: live `creator_partnerships` stayed **114**, `content_items` **6031**, `creator_calendar_items` **1010**. Restored SCHEELS id `341940fa-edca-4bdf-b44b-d06b2b63327d` still exists. Test DB received the suite writes (`social_agent_test` ended with 39 partnerships / 46 content items).

A normal developer cannot accidentally run DB-writing tests against live Benson unless they set `TEST_DATABASE_URL` to the live identity — and that is now rejected in code.

---

## Proven root cause

Before this change:

| Knob | Observed |
| --- | --- |
| Test DB URL | **absent** (`TEST_DATABASE_URL` did not exist) |
| `NODE_ENV` | unset; `env.ts` does not branch on it |
| Connection | `services/core/src/db.ts` → `postgres(env.DATABASE_URL)` at import |
| Live URL | `postgres://social_agent@localhost:5433/social_agent` |
| Isolation | none (no test schema, no rollback) |
| Cleanup | `after()` `DELETE` by ids returned from submit/duplicate lookup |

That is how identity-gate tests deleted live partnership `341940fa-edca-4bdf-b44b-d06b2b63327d`.

`NODE_ENV=test` was never a database switch and is **not** the isolation mechanism.

---

## Chosen isolation design

1. **Dedicated database** `social_agent_test` on the existing Docker Postgres (`social_agent_postgres`, host port 5433). No second compose stack.
2. **`TEST_DATABASE_URL`** is required for any postgres-backed test that queries `db`.
3. **Hard guard** compares normalized identity: `host` + `port` + `database` (user/password/query ignored; `127.0.0.1`/`::1` → `localhost`; default port 5432).
4. **`db.ts` is lazy.** Production/runtime (no `NODE_TEST_CONTEXT`) always uses `DATABASE_URL`. Under `node --test` **or** `BENSON_USE_TEST_DATABASE=1`, the first query uses `TEST_DATABASE_URL` after the guard.
5. **Single test handle:** `services/core/src/test-db.ts` exports `assertSafeTestDatabase()`, `getTestDb()`, and `db`. Postgres-backed tests import this instead of `./db.js`.
6. Production persist functions (`submitCreatorPartnership`, `saveProgramToLibrary`, …) keep `import { db } from '../db.js'`. In a test process they automatically hit the test DB because `db.ts` resolves the URL at first connect.

`TEST_DATABASE_URL` may appear in `.env` for developer convenience. Benson runtime **ignores** it because `NODE_TEST_CONTEXT` is unset.

---

## `TEST_DATABASE_URL` semantics

| Situation | Result |
| --- | --- |
| Missing / whitespace | `MissingTestDatabaseUrlError` — fail closed |
| Same host/port/database as `DATABASE_URL` | `TestDatabaseUrlUnsafeError` — fail closed |
| Same host/port, database `social_agent_test` | allowed |
| Different dedicated name (e.g. `benson_pg_test`) | allowed |
| Not under `node --test` and flag unset | **`DATABASE_URL`** (production unchanged) |

Preferred local value (`.env.example`):

```
TEST_DATABASE_URL=postgres://social_agent:dev_password_change_me@localhost:5433/social_agent_test
```

---

## Hard safety guard behavior

Implemented in `services/core/src/test-database-url.ts`:

- `parsePostgresConnectionIdentity`
- `postgresConnectionIdentitiesEqual`
- `assertSafeTestDatabaseUrl`
- `resolveProcessDatabaseUrl`

`assertSafeTestDatabase()` in `test-db.ts` also sets `BENSON_USE_TEST_DATABASE=1`.

Setup (`setup-test-database.ts`) additionally **refuses database name `social_agent`** for create/drop. `--reset` drops **only** the test database (`WITH (FORCE)`), never `social_agent`.

---

## Files changed

New:

- `services/core/src/test-database-url.ts`
- `services/core/src/test-database-url.test.ts`
- `services/core/src/test-db.ts`
- `services/core/src/scripts/setup-test-database.ts`

Modified:

- `services/core/src/db.ts` (lazy connect + test-process URL resolution; production still `DATABASE_URL`)
- `.env.example` (`TEST_DATABASE_URL` documented)
- `package.json` (`setup:test-db`)
- `services/core/package.json` (`setup:test-db`, `test:postgres`, safety tests in `test` glob)

Postgres-backed tests now import `../test-db.js` (or `../../test-db.js`). Mixed unit+postgres files call `assertSafeTestDatabase()` only in postgres `describe` `before()` hooks so unit tests still run without `TEST_DATABASE_URL`.

**Not modified:** `url-intelligence.ts` / `buildOpportunityFingerprint`, partnership research, Calendar, Discover, sponsor code, live SCHEELS row.

---

## Postgres-backed test files migrated

Imported `test-db` / `assertSafeTestDatabase` (all DB writes go through the guarded pool):

| File | In default `pnpm test` glob? |
| --- | --- |
| `creator-partnership/entity-identity.test.ts` | yes |
| `creator-partnership/research-singleflight.test.ts` | yes |
| `creator-partnership/platform-email-match.test.ts` | yes |
| `ask-benson/evidence-orchestration/evidence-orchestration.test.ts` | yes |
| `ask-benson/conversations-terminal.test.ts` | yes |
| `program-library/program-library.test.ts` | yes |
| `program-library/auto-enrichment.test.ts` | yes |
| `creator-interest/discover-quality.test.ts` | yes |
| `creator-interest/actions.test.ts` | yes |
| `benson-scout/watchlist-canonical.test.ts` | yes |
| `curator-watchlist/instagram-session.test.ts` | yes |
| `curator-watchlist/auth-reconciliation.test.ts` | yes |
| `creator-skip/state-authority.acceptance.test.ts` | yes |
| `worker-heartbeat/worker-heartbeat.test.ts` | yes |
| `scanner/ingest-persist.container-child.test.ts` | **no** (not in package.json `test` script) |

No remaining `*.test.ts` imports of live `db.js`.

---

## How test DB schema is prepared

Command:

```
TEST_DATABASE_URL=postgres://social_agent:…@localhost:5433/social_agent_test \
  pnpm --filter @social-agent/core setup:test-db
```

Optional recreate (test DB only):

```
pnpm --filter @social-agent/core setup:test-db -- --reset
```

What the script does:

1. Require `TEST_DATABASE_URL`; assert it is not the live identity; refuse name `social_agent`.
2. Connect to maintenance DB `postgres` on the same server; `CREATE DATABASE social_agent_test`.
3. Apply schema in **numeric prefix order**: `db/init` for numbers with no migration file (00, 02–05), **`db/migrations` when both exist** (this is the live migrate path). Skip `01_create_n8n_db.sql`.
4. Seed a campaign (`Test Isolation Campaign`) and a `creator_accounts` row if empty.

Note: `db/init/68_creator_agent_corrective.sql` contains invalid `metadata->>'ingest'->>'category'`. The setup script uses `db/migrations/68_…` instead. That is a test-setup selection, not a fingerprint/Calendar fix.

---

## Commands used (this isolation task)

```
# Safety-guard unit tests (no Postgres)
pnpm exec node --import tsx --test src/test-database-url.test.ts
# → 16 pass / 0 fail

# Fail closed: missing TEST_DATABASE_URL
node --import tsx --test --test-name-pattern 'submitCreatorPartnership identity gate' \
  src/creator-partnership/entity-identity.test.ts
# → MissingTestDatabaseUrlError (postgres describe did not run)

# Fail closed: TEST_DATABASE_URL == live identity
TEST_DATABASE_URL=<same as DATABASE_URL> node --import tsx --test \
  --test-name-pattern 'submitCreatorPartnership identity gate' \
  src/creator-partnership/entity-identity.test.ts
# → TestDatabaseUrlUnsafeError … localhost:5433/social_agent

# Unit tests in a mixed file still run without TEST_DATABASE_URL
node --import tsx --test --test-name-pattern 'evaluatePartnershipEntityIdentity|selectPartnershipIdentityForWrite' \
  src/creator-partnership/entity-identity.test.ts
# → 15 pass / 0 fail

# Create isolated DB (after first failed apply, --reset on social_agent_test only)
pnpm setup:test-db -- --reset
# → Ready: social_agent_test

# Representative postgres suites against TEST DB only
TEST_DATABASE_URL=… pnpm test:postgres
```

---

## Safety-guard tests

File: `services/core/src/test-database-url.test.ts`

| Case | Result |
| --- | --- |
| Missing TEST_DATABASE_URL | pass (throws `MissingTestDatabaseUrlError`) |
| TEST_DATABASE_URL == live identity (incl. 127.0.0.1) | pass (throws `TestDatabaseUrlUnsafeError`) |
| Same host/port, `social_agent_test` | pass (allowed) |
| Different dedicated DB name | pass (allowed) |
| URL normalization (port default, postgresql://, user/pass ignored) | pass |
| Production resolver keeps `DATABASE_URL` even if a test URL is supplied | pass |

**16 pass / 0 fail.**

---

## Representative postgres suite results

`pnpm test:postgres` with `TEST_DATABASE_URL` → `social_agent_test`:

| Suite | Result |
| --- | --- |
| evidence-orchestration (pure + durable) | pass |
| entity-identity (unit + postgres persist) | pass |
| research-singleflight (unit + postgres/e2e) | pass |
| program-library auto-enrichment | pass |
| program-library canonical / quiet / seed / pipeline / intake | pass except 1 |
| program library enrichment safety: budget gate | **fail** (unrelated) |

Totals: **80 tests, 79 pass, 1 fail.**

Unrelated failure (out of scope, not isolation):

- `respects background budget gate with zero paid search calls`
- `assert.equal(result.skipped, true)` got `false`
- Empty test `llm_usage_events` / budget accounting vs live; **not fixed here**

---

## Proof suites used `social_agent_test`

After `pnpm test:postgres`:

| | Live `social_agent` | Test `social_agent_test` |
| --- | ---: | ---: |
| `current_database()` | social_agent | social_agent_test |
| `creator_partnerships` | **114** (unchanged) | **39** |
| `content_items` | **6031** (unchanged) | **46** |
| `creator_calendar_items` | **1010** (unchanged) | **0** |
| Campaign | Demo Brand | Test Isolation Campaign |
| SCHEELS `341940fa-…` | **exists** | absent |
| Loews partnership rows | 9 (pre-existing live clones, unchanged) | 1 (evidence-orchestration fixture in test DB) |

Live writes during verification: **zero**. Cleanup in identity/singleflight `after()` deleted only test-DB rows.

---

## Live DB before / after

| Metric | Before isolation work | After representative postgres tests |
| --- | ---: | ---: |
| `creator_partnerships` | 114 | 114 |
| `content_items` | 6031 | 6031 |
| `creator_calendar_items` | 1010 | 1010 |
| SCHEELS `341940fa-edca-4bdf-b44b-d06b2b63327d` | present, research `{}` | present, research `{}` |

**Live data changed = no.**  
**SCHEELS research rebuilt = no.**  
**Fingerprint code changed = no.**

---

## Developer workflow

```
# 1. Copy TEST_DATABASE_URL from .env.example into local .env (do not point it at social_agent)
# 2. Create/migrate the disposable DB
pnpm setup:test-db

# 3. Unit tests: no TEST_DATABASE_URL required
# Postgres-backed describes fail closed if TEST_DATABASE_URL is missing or equals live.

# 4. Postgres suites
pnpm --filter @social-agent/core test:postgres
```

`pnpm --filter @social-agent/core test` includes postgres files. Without `TEST_DATABASE_URL`, those describes **fail closed** rather than hitting live. With a correct `TEST_DATABASE_URL`, they use `social_agent_test`.

---

## Confirmations

| Check | Status |
| --- | --- |
| No fallback TEST_DATABASE_URL → DATABASE_URL | **yes** |
| Equality guard | **yes** |
| Postgres tests use isolated DB | **yes** (`social_agent_test`) |
| Live Benson still uses DATABASE_URL | **yes** |
| Live data mutated during verification | **no** |
| Fingerprint formula changed | **no** |
| SCHEELS research rebuilt | **no** |
| Junk partnerships cleaned | **no** |
| Calendar / Discover / sponsors redesigned | **no** |

---

## Not yet / out of scope

- Opportunity fingerprint collision (S1) — separate task
- Incomplete SCHEELS research JSON (S2)
- Live Loews clones / program-library junk in `social_agent`
- Unrelated program-library budget-gate assertion on empty test `llm_usage_events`
- `scanner/ingest-persist.container-child.test.ts` is wired to `test-db` but is **not** in the default `pnpm test` file list
- `auth-reconciliation` DB tests that need a live Instagram watcher fixture (`jasfoodjourney`) will not find that row on a fresh test DB (fixture gap, not isolation)
- Splitting mixed unit/postgres files into separate files
- Transaction rollback per test

---

## Recommended next (separate tasks)

1. Opportunity fingerprint durability (do not start until tests stay off live).
2. Optionally add `TEST_DATABASE_URL` to the operator `.env` from `.env.example`.
3. Decide whether to fix the program-library budget-gate test against an empty usage table.
