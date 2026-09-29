# Benson ←→ Muse ingest endpoint — 2026-09-29

## Public address

`POST https://api.kckellie.com/api/ingest/muse-agent`

Confirmed live without a key: **HTTP 401**

```json
{"ok":false,"error":{"code":"UNAUTHORIZED","message":"Invalid or missing ingest key"}}
```

Local API on mappy returned the same 401. Header name: `x-benson-ingest-key`. Env var: `MUSE_INGEST_KEY`. This report does not contain the secret. The variable is unset in the running process, so every request stays 401 until the operator sets it and restarts.

## Auth, limits, body

- Constant-time compare of the header to `MUSE_INGEST_KEY` (SHA-256 digests). Missing env, missing header, or mismatch → 401 and no write.
- About 60 requests per minute per key, in-memory on the API process. 429 when exceeded. Restarts clear the window.
- JSON body cap 1 MB. Larger bodies → 413.
- Body: one finding, an array, or `{ "items": [ ... ] }`.
- Per item: `{ fingerprint, disposition, reason }` with disposition `accepted` | `merged_duplicate` | `quarantined` | `rejected`.

## Migration

**92** — `db/migrations/92_muse_agent_ingest.sql` (also `db/init/92_muse_agent_ingest.sql`).

Applied locally with `pnpm --filter @social-agent/core migrate:muse-ingest`.

- `muse_ingest_runs` stores every run: timestamp, item count, dispositions, and the raw payload (including rejects and replays).
- `muse_ingest_items` unique on `(source, fingerprint)`, same concurrency idea as scout `(watcher_id, occurrence_fingerprint)`.

## Routing

Muse source id is `muse-agent`. It is not a privileged writer. No outreach send and no form submit.

| Type | Where it goes | Disposition |
| --- | --- | --- |
| `event_finding` | Calendar admission (`evaluateCalendarAdmission`: eventness, KC-geo, temporal, source integrity). Accepted and quarantined items are content items with `calendarAdmission` metadata, `reviewOnly`, and `autoOutreach: false`. Accepted rows are calendar-eligible for the existing population pass. They are not confirmed calendar items. Rejected rows stay in the audit tables only. | `accepted`, `quarantined`, or `rejected` from admission (`reason` `admission:<code>`). A different fingerprint with the same stripped canonical URL returns `merged_duplicate` / `canonical_url_match` and does not create a second content item. |
| `opportunity_dossier` | Opportunities review queue: `content_items` in `planned`, `opportunityLayer: opportunity`, `inventoryStatus: suggested`, `reviewQueue: opportunities`. Facts and contact routes are stored as sent. `verified` is the payload flag only. | `accepted` / `queued_for_review`. Canonical URL already stored → `merged_duplicate`. Outreach is not called. |
| `opening_establishment` | Openings Radar (`persistOpeningEntry` into `opening_businesses` / `opening_locations`). Provenance (`found_via`, `found_at`, stripped evidence URL, fingerprint) is kept on the location. New rows are `verification_level = unverified`. `createOpportunity` and `createEvent` are off, so an opening does not mint a pitch or a calendar row. | `accepted` / `openings_radar`, or `merged_duplicate` / `canonical_location_match` when the business+location already exists. |
| Unknown `type` | Audit only | `rejected` / `unknown_type` |
| Bad dates, missing required fields, wrong `source` | Audit only. Dates are not repaired. | `rejected` plus a specific reason (`invalid_starts_at`, `missing_found_via`, `invalid_stage`, `invalid_projected_open`, …) |

Required on every item: `type`, `source` = `muse-agent`, `fingerprint`, `provenance.found_via`, `provenance.found_at`.

Tracking parameters are stripped with the existing `stripTrackingParams` helper before storage.

Identical fingerprint re-POST is a no-op: the stored disposition and reason are returned and no second target row is written. That is the idempotent contract. `merged_duplicate` is the cross-record identity merge (canonical URL or opening location), not a rewrite of a successful first accept.

## Tests

Focused suite, not the full core suite.

| Suite | Result |
| --- | --- |
| `services/core/src/muse-ingest/muse-ingest.test.ts` | **12 pass / 12** |
| `services/api/src/routes/muse-ingest.test.ts` | **2 pass / 2** |
| **Total** | **14 pass / 14** |

Covered: missing/mismatched key, identical fingerprint re-POST (one write, original disposition), canonical-URL merge (`merged_duplicate`), unknown type with raw payload retained, quarantine for an event with no KC-geo evidence, prose date rejection, dossier queued with outreach false and tracking stripped, opening provenance and stripped evidence URL, second opening fingerprint merged.

Postgres smoke (then deleted): one unknown-type item, one row, replay returned the original `rejected` / `unknown_type`.

Core `tsc` was not fully green. Muse files produced no `tsc` errors. Pre-existing errors remain elsewhere. The full core `pnpm test` was not run.

## Deploy

**MATCH `5defd372a9ab334f`**

**Commit `965ec533993f05bec437483e708237826ab53267`**

Branch `release/scout-expansion-2026-07-25`.

Swap was already full (about 3.9 / 4.0 GiB) with about 2.8 GiB RAM available. API, workers, and the dashboard were restarted and stamped to that fingerprint. Playwright precheck and the large deploy-gate test battery were not run, so this was not a browser storm.

`/api/health/identity` still reports `gitCommit` `b092209` because that string was captured when the process started, before this commit. MATCH is the deploy check this repo uses.

The source fingerprint also includes other uncommitted files that were already in the worktree (watchlist, home briefing, benson-pulse). Those files were not part of this commit.

## How the operator sets the key

1. Generate a secret outside this repo. Do not commit it.
2. Put `MUSE_INGEST_KEY=<secret>` in the repo-root `.env` (the file `benson_load_env` sources; it is not in git).
3. Restart the API so the process picks it up (`pnpm restart:api`, or the usual MATCH deploy).
4. Give Muse the URL and the header `x-benson-ingest-key` through a side channel. Nothing in this build copies a production key.

Until that restart, the public route answers 401 and writes nothing.

## Limitations

- Replay of an identical fingerprint returns the original disposition. It does not relabel that replay as `merged_duplicate`.
- Rate limiting is per API process and resets on restart.
- Quarantined events are stored so admission is visible; they stay off the suggestion surface (`calendarEligible: false`).
- Openings do not auto-create opportunity or calendar rows.
- Calendar suggestions for accepted events show up when the existing population pass runs. Ingest does not confirm them or contact anyone.
- A dossier `verified: true` is the sender's claim, not Benson verification.
- Full core suite and the Playwright deploy gate were not run on this pass.
