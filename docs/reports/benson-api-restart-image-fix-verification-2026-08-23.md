# Benson API restart — Ask Benson image-attachment fix verification

**Date:** 2026-08-23  
**Scope:** API restart + runtime verification only. No application code changes. Node was not upgraded. Dashboard, workers, and Cloudflare were not restarted. `/transcribe` was not touched. Discoveries and other features were not in scope.

Companion to the already-landed code fix: `docs/reports/benson-ask-benson-image-attachment-fix-2026-08-23.md`.

---

## Result

| Check | Result |
|---|---|
| Working tree contains the completed image fix | **Yes** — multipart uses `materializeAskBensonImageField`; no `body.image instanceof File` |
| API restarted via repo supervisor | **Yes** — `bash scripts/restart-api.sh` on the systemd/system PATH (Node 18) |
| Exactly one listener on `:4000` | **Yes** — pid **522986** |
| New process identity | **Yes** — new PID, new `processStartedAt`, `/health` **200** |
| New image implementation loaded | **Yes** — smoke logged `[ask-benson] image resolve failed` / `stage: 'image_resolve'` |
| Fixture JPEG smoke | **Yes** — multipart parsed; **no** `File is not defined`; materialize path ran |
| New `File is not defined` after smoke | **None** |
| Node upgraded | **No** — still **v18.19.1** `/usr/bin/node` |
| Dashboard / workers / Cloudflare restarted | **No** |
| Unrelated code changed this task | **No** (this report file only) |
| Live durable Ask Benson / collection writes | **No** (stopped at HTTP 400 before `askBenson()` / `collectOpportunitiesFromImage`) |

---

## 1. Working-tree confirmation (image fix present)

`services/api/src/routes/ask-benson.ts` multipart branch (tsx loads this file from disk):

- `await c.req.parseBody()`
- If `body.image` is present: **`await materializeAskBensonImageField(body.image)`**
- **Does not** evaluate `body.image instanceof File`
- On failure, logs `[ask-benson] image resolve failed` with `stage: 'image_resolve'` and returns HTTP 400

`services/core/src/ask-benson/chat-images.ts`:

- Duck-types uploads in `isAskBensonImageUpload` (`size` number + `arrayBuffer` function). No `instanceof File`.

`instanceof File` still present (**out of scope, not changed**):

```314:314:services/api/src/routes/ask-benson.ts
    const file = body.audio instanceof File ? body.audio : null;
```

Git HEAD remains **`aaad48f`** (`aaad48fe43ca244c85e6a866003d953ba7848fff`). The image fix is in the **dirty working tree**, not in that commit. tsx reads TypeScript from disk, so restart is enough to load it.

Route file mtime: `2026-08-23 17:50:07 UTC`, which is **before** the new process start (`18:34:37 UTC`).

---

## 2. Restart mechanism

**Command used** (system PATH only, so nvm Node 22 was not selected):

```bash
cd /home/elliott/Projects/kellie-assistant/social-agent
PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
unset NVM_DIR NVM_BIN NVM_INC
bash scripts/restart-api.sh
```

**What `scripts/restart-api.sh` does:**

1. Sources `scripts/benson-runtime-lib.sh` and loads `.env`.
2. `bash scripts/write-build-identity.sh "restart-api"` → `.logs/pre-alpha/build-identity.env`.
3. `benson_stop_api_processes` — stops Benson-owned listeners on port 4000 (does **not** start a second process beside the old one).
4. `benson_start_api` — `$(benson_pnpm) --filter @social-agent/api start` → `tsx src/server.ts`, stdio appended to `.logs/pre-alpha/api.log`.
5. Waits for `http://127.0.0.1:4000/health`.

`benson_pnpm` resolves to `npx --yes pnpm@10.30.3` unless `PNPM` is set.

Restart exited 0, finished ~`2026-08-23T18:34:57Z`:

```
Stopping Benson-owned listeners on :4000 (pids: 3559)
Starting API on :4000…
✅ API healthy on :4000 (commit aaad48f)
```

Log at the process swap (SIGTERM = exit 143, then new boot):

```
ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @social-agent/api@0.1.0 start: `tsx src/server.ts`
Exit status 143
. | WARN  Unsupported engine: wanted: {"node":">=20"} (current: {"node":"v18.19.1","pnpm":"10.30.3"})

> @social-agent/api@0.1.0 start …/services/api
> tsx src/server.ts

{"level":"info","service":"benson-api","message":"API listening",
 "timestamp":"2026-08-23T18:34:51.847Z","port":4000,"pid":522986,
 "identity":{"gitCommit":"aaad48f",
             "processStartedAt":"2026-08-23T18:34:51.725Z",
             "supervisor":"restart-api",
             "environment":"development"}}
```

No second API was started manually on port 4000.

---

## 3. Exactly one listener on port 4000

```
ss -ltnp | grep ':4000 '
LISTEN 0 511 *:4000 *:* users:(("node",pid=522986,fd=35))
count=1
```

`.logs/pre-alpha/api.runtime.json` records wrapper pid **522742** (`npm exec pnpm@10.30.3 --filter @social-agent/api start`). The process that **binds** `:4000` is **522986**.

---

## 4. Process identity: before vs after

| Field | Old (pre-fix still loaded) | New (image fix loaded) |
|---|---|---|
| Listener PID | **3559** | **522986** |
| Wrapper / `api.runtime.json` pid | boot tree | **522742** (`startedAt` `2026-08-23T18:34:35Z`) |
| `processStartedAt` | `2026-08-23T02:34:19.481Z` | **`2026-08-23T18:34:51.725Z`** |
| OS start (`ps` lstart) | Sun Aug 23 02:34:19 2026 | Sun Aug 23 **18:34:37** 2026 |
| `gitCommit` | `aaad48f` | `aaad48f` (same HEAD; **dirty worktree** has the fix) |
| Full SHA | `aaad48fe43ca244c85e6a866003d953ba7848fff` | same |
| `releaseTag` | `release/newsletter-intelligence-2026-07-28-1-gaaad48f` | same |
| `buildTime` | `2026-08-23T02:34:02Z` | **`2026-08-23T18:34:16Z`** |
| `supervisor` | `benson-boot-prod` | **`restart-api`** |
| `environment` | `production` | `development` (see note) |
| Node | **v18.19.1** `/usr/bin/node` | **v18.19.1** `/usr/bin/node` |
| Port | 4000 | 4000 |
| `/health` | 200 | **200** |
| `/api/health/live` | — | **200** |
| `/api/health/ready` | — | **200** (`ready: true`; state may be `degraded`) |
| Cmd | `tsx src/server.ts` from `services/api` | same |

Post-restart `/api/health/identity` (HTTP 200):

```json
{
  "ok": true,
  "identity": {
    "gitCommit": "aaad48f",
    "releaseTag": "release/newsletter-intelligence-2026-07-28-1-gaaad48f",
    "buildTime": "2026-08-23T18:34:16Z",
    "processStartedAt": "2026-08-23T18:34:51.725Z",
    "serviceName": "benson-api",
    "environment": "development",
    "supervisor": "restart-api"
  }
}
```

**Environment note (not changed):** `benson_start_api` does not export `NODE_ENV=production`. Only `benson_boot_prod` does. After this API-only restart, identity `environment` is `development`. That is a supervisor-path difference, not a Node upgrade.

---

## 5. Proof the running process loaded the new image path

tsx executes `src/server.ts` from cwd `…/services/api` using the on-disk route file.

Runtime proof: the smoke request logged a line that **only exists in the new code** and **cannot run if `instanceof File` still throws first**:

```
[ask-benson] image resolve failed {
  stage: 'image_resolve',
  code: 'unsupported_mime',
  filename: 'ask-benson-verify.bin',
  mime: 'application/octet-stream',
  size: 333
}
--> POST /api/ask-benson 400 70ms
```

The old process never reached that logger; it died in `parseAskBensonBody` at line 122 with `ReferenceError: File is not defined`.

Node still emits `(node:522986) ExperimentalWarning: buffer.File is an experimental feature` on multipart (undici/`buffer.File`). That warning is **not** a global `File` binding. The old bug was `instanceof File` resolving an **undefined identifier**.

---

## 6. Image-fixture smoke test

**Fixture:** synthetic 1×1 JPEG, **333 bytes**, magic `ffd8`…`ffd9`, written to `/tmp/ask-benson-verify-2026-08-23.jpg`. Not a user photo.

**Request:** one multipart **image-only** POST to `http://127.0.0.1:4000/api/ask-benson`, field name `image`. No `message`. No `conversationId`.

**Why HTTP 400 on purpose:** a successful materialize of a valid `image/jpeg` would call `askBenson()` → `collectOpportunitiesFromImage()` (OpenAI plus possible DB writes: share-intake source, content items, conversation). Per task, stop after proving parse/materialize rather than running the full workflow.

The JPEG bytes were sent with `filename=ask-benson-verify.bin` and `type=application/octet-stream` so duck-typing still sees a file (`size` + `arrayBuffer`, 333 bytes), **`materializeAskBensonImageField` runs**, then validation returns `unsupported_mime` **before** `askBenson()`.

| Expectation | Observed |
|---|---|
| Multipart parses | Yes — no `multipart parse failed` |
| No `File is not defined` | Yes |
| Hits new materialize path | Yes — `image resolve failed` / `image_resolve` / `unsupported_mime` |
| HTTP | **400** `{"ok":false,"error":"Use JPG or PNG."}` in **70ms** |
| Old failure mode | Would have been **500** + `ASK_BENSON_FRIENDLY_ERROR` + `ReferenceError` at line 122 |
| Durable collection / conversation persist | **Not invoked** |

---

## 7. `api.log` after smoke

Log file: `.logs/pre-alpha/api.log`

**Before smoke:** `File is not defined` count = **8** (all from old pid **3559**, before the restart at ~line 20305).

**After smoke:** count still **8**. Smoke delta: **0** new `File is not defined`. The smoke `POST /api/ask-benson` completed as **400**, not 500.

### Before (old process — live bug)

```
<-- POST /api/ask-benson
(node:3559) ExperimentalWarning: buffer.File is an experimental feature …
[ask-benson] unhandled error {
  requestId: '731d9a5c-e156-452b-8de3-5c7a4a54bcba',
  error: 'File is not defined',
  stack: 'ReferenceError: File is not defined\n' +
    '    at parseAskBensonBody (.../services/api/src/routes/ask-benson.ts:122:40)\n'
}
--> POST /api/ask-benson 500 92ms
```

Same stack also appeared for live request `adda7870-3d0d-48df-ba2c-343c601901b1`.

### After (new process — materialize path)

```
<-- POST /api/ask-benson
(node:522986) ExperimentalWarning: buffer.File is an experimental feature …
[ask-benson] image resolve failed {
  stage: 'image_resolve',
  code: 'unsupported_mime',
  filename: 'ask-benson-verify.bin',
  mime: 'application/octet-stream',
  size: 333
}
--> POST /api/ask-benson 400 70ms
```

`/transcribe` was not exercised.

---

## 8. Node 18 vs declared `>=20` (documented, not changed)

### Where `>=20` is declared

1. Root `package.json`:

```json
"engines": { "node": ">=20" }
```

2. `BOOTSTRAP_PLAN.md` — Node.js **≥ 20** (`package.json` engines).

pnpm treats this as a **warning**, not a hard start failure (`engine-strict` is not set in repo npmrc). Every API boot in `.logs/pre-alpha/api.log` begins with:

```
WARN  Unsupported engine: wanted: {"node":">=20"} (current: {"node":"v18.19.1","pnpm":"10.30.3"})
```

### Why the supervisor still runs Node v18.19.1

| Layer | Behavior |
|---|---|
| systemd user unit `~/.config/systemd/user/benson-pre-alpha.service` | `ExecStart=…/scripts/benson-boot-prod.sh`; `Environment=HOME=%h` only — **does not set PATH, does not source nvm** |
| systemd user environment PATH | `/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:…:/snap/bin` — **no** `~/.nvm/...` |
| `/usr/bin/node` | **v18.19.1** (distro Node) |
| nvm | `NVM_DIR=~/.nvm`, default alias **22**, installed **v22.22.3** — used by interactive shells that source nvm, **not** by this systemd unit |
| `benson_start_api` | Uses whatever `node` is first on PATH when `npx` / `pnpm` / `tsx` spawn |

Boot at `2026-08-23T02:34:01Z` therefore started the API with `/usr/bin/node` v18.19.1. This restart **intentionally reused that PATH** so Node would not jump to nvm 22.

### Would changing Node be a separate task?

**Yes.** Selecting Node ≥20 requires a dedicated runtime/deploy change, for example:

- install/pin Node 20+ on the systemd PATH, or
- point the unit at nvm’s Node, or
- otherwise change how `benson-boot-prod` / `restart-api` resolve `node`,

then restart the API (and likely workers/dashboard for consistency). **Not done here.**

---

## 9. Other services

| Process | PID | Started | This task |
|---|---|---|---|
| Dashboard (`next-server`, `:3000`) | **3798** | 2026-08-23 02:34:17 | **not restarted** |
| Workers (`tsx src/benson.ts`) | **3816** | 2026-08-23 02:34:17 | **not restarted** |
| cloudflared | **1559** | 2026-08-23 02:34:01 | **not restarted** |

systemd unit `benson-pre-alpha.service` remains at ActiveEnterTimestamp `Sun 2026-08-23 02:34:21 UTC` (oneshot RemainAfterExit from original boot). Only the API child was recycled via `restart-api.sh`.

---

## 10. Code / data mutation

- **This verification task** did not edit application source. The only new artifact is this report.
- Image-fix source was already dirty in the worktree before this restart (`services/api/src/routes/ask-benson.ts`, `services/core/src/ask-benson/chat-images.ts`, tests, dashboard composer types, etc.).
- `/transcribe` still uses `body.audio instanceof File` (line 314). Left for a later task.
- Smoke test returned 400 from `materializeAskBensonImageField` and **did not** call `askBenson` / `collectOpportunitiesFromImage`. No new conversation, content item, or share-intake row from this smoke.

---

## Success checklist

- [x] API restarted via `scripts/restart-api.sh`
- [x] New process running (pid 522986 ≠ 3559)
- [x] Image fix loaded (materialize / `image_resolve` log)
- [x] Local fixture upload no longer hits `File is not defined`
- [x] Health 200
- [x] Dashboard / workers / Cloudflare not restarted
- [x] Node 18 vs `>=20` documented, Node **not** upgraded
