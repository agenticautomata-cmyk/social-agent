# Ops: Control Tower admin access + AI daily budget

**Status:** Ready to apply after Elliott confirms Cloudflare Access email  
**Scope:** Operational config only — **not** Benson Workspace architecture  
**Do not fold into:** Benson Workspace MVP ([`docs/plans/benson-workspace-ux-plan.md`](../plans/benson-workspace-ux-plan.md))

---

## 1. Admin access (`BENSON_ADMIN_EMAILS`)

### Mechanism (unchanged)

- Cloudflare Access header `cf-access-authenticated-user-email` must match `BENSON_ADMIN_EMAILS` (comma-separated, case-insensitive).
- Localhost may use `x-benson-admin-session-email`.
- API layer still uses `BENSON_CONTROL_TOWER_KEY` via Next proxy (shared secret; not the identity).
- No source-code hard-coding of emails.

### Current allowlist (this host, redacted)

| Slot | Redacted value | Notes |
|------|----------------|-------|
| Existing operator #1 | `ag***@gmail.com` | Sole current entry; preserve if still a legitimate operator |

Local part does **not** contain `elliott` or `kellie`. Control Tower does **not** use creator/Kellie identity.

### Cloudflare Access identity — NOT YET DETERMINED

**Exact authenticated email: UNKNOWN (blocked).**

Attempts (read-only):

- No Cloudflare API / Access admin tokens in runtime `.env`
- No Access audit logs in repo `.logs` with the denied email
- Docs only show placeholders (`elliott@…`, `elliott@YOUR_EMAIL_DOMAIN`)
- Must **not** guess that `ag***@gmail.com` is Elliott without Access confirmation

**How to obtain (Elliott):**

1. Cloudflare Zero Trust → Access login email actually used for `benson.kckellie.com` / production dashboard, **or**
2. After Access login, account/profile email shown by Cloudflare, **or**
3. One-time: open Control Tower while temporarily logging the denied `email` from `evaluateControlTowerAccess` (requires a tiny observability change — not done in this ops pass)

Until that exact string is provided, **do not change `BENSON_ADMIN_EMAILS`**.

### Proposed env diff (template — apply only after identity confirmed)

```diff
- BENSON_ADMIN_EMAILS=<existing-ag***@gmail.com>
+ BENSON_ADMIN_EMAILS=<existing-ag***@gmail.com>,<ELLIOTT_CF_ACCESS_EMAIL_EXACT>
```

If the existing Gmail is Elliott’s Access identity, no add is needed — only confirmation.  
If Elliott’s Access email is different, **append** it; do not remove the existing address unless confirmed non-operator.

**Restart:** Dashboard process/redeploy only as required for Next to pick up `BENSON_ADMIN_EMAILS` (API key layer unchanged).

---

## 2. AI budget (`BENSON_LLM_DAILY_BUDGET_USD`)

### Current effective config

| Item | Value |
|------|--------|
| `.env` | `# BENSON_LLM_DAILY_BUDGET_USD=3` (commented) |
| Effective | **3** (code default) |
| Today (America/Chicago day) | **$3.85** tracked → `budgetExceeded: true` |
| Throttle semantics | Keep as-is: background throttled; foreground Ask Benson + user creator research **allowed** |

### Today’s spend sources (telemetry, Chicago local day starting `2026-08-09T05:00:00.000Z`)

From `llm_usage_events` since local midnight + `getTodaySpendUsd()`:

| Source | Runs (today) | Cost (today) |
|--------|--------------|--------------|
| `web_search` | 320 | **~$3.84** |
| `opportunity_scoring` | 5 | ~$0.0025 |
| `gmail_digest` | 3 | ~$0.0005 |
| **Today total** | | **~$3.85** |

7-day period context (Control Tower breakdown; not “today only”):

| Source | Runs (7d) | Cost (7d) |
|--------|-----------|-----------|
| `web_search` | 790 | ~$9.48 |
| `opportunity_scoring` | 34 | ~$0.024 |
| `pulse` | 43 | ~$0.023 |
| `ask_benson` | 74 | ~$0.014 |
| `learning` | 11 | ~$0.013 |
| `gmail_digest` | 23 | ~$0.004 |
| `discovery` | 0 | $0 |

**Interpretation:** Today’s overage is almost entirely **`web_search`**. Foreground Ask Benson is a small fraction of 7d spend; raising the cap to $10 restores background capacity without disabling the budget. Revisit separate foreground/background budgets later after observation.

### Recommended env diff (budget)

```diff
- # BENSON_LLM_DAILY_BUDGET_USD=3
+ BENSON_LLM_DAILY_BUDGET_USD=10
```

- Do **not** set `≤0` (that disables the budget).
- Do **not** change throttle semantics in code.
- Restart **API + workers** (and dashboard if it reads the same env for display) after apply.

---

## 3. Throttle semantics — no change

Keep:

- Foreground Ask Benson **allowed** when over budget  
- User creator partnership research **allowed**  
- Background discovery / learning / background web_search / background scoring / outreach drafting **throttled**  
- Gmail digest **partial** (template fallback without LLM)

---

## 4. Follow-up reliability issue (separate, not MVP)

**Issue:** Budget accounting day uses process-local midnight (`setHours(0,0,0,0)` with `TZ=America/Chicago`), while Telegram alert dedupe uses **UTC** date (`toISOString().slice(0, 10)`).

**Follow-up:** Align alert dedupe day key with the same accounting-day boundary (Chicago local date).

**Tracking:** Leave as a small future reliability item — **outside** Benson Workspace MVP.

---

## 5. Apply checklist (when unblocked)

1. Elliott provides **exact** Cloudflare Access email string.  
2. Confirm whether existing `ag***@gmail.com` remains a legitimate operator.  
3. Apply `BENSON_ADMIN_EMAILS` diff (append, preserve legitimate entries).  
4. Apply `BENSON_LLM_DAILY_BUDGET_USD=10`.  
5. Restart/redeploy dashboard for admin emails; API + workers for budget.  
6. Verify: Elliott opens Control Tower; spend shows budget $10; background throttle clears if under new cap.  
7. No Workspace architecture changes in this pass.

---

## 6. Explicit non-goals

- No Benson Workspace plan changes  
- No hard-coded emails in source  
- No budget disable  
- No throttle semantic redesign  
- No UTC/Chicago alert alignment in this ops apply pass
