# Benson Hospitality Partnership — Beast Pass Report

**Date:** 2026-09-03  
**Branch:** `release/scout-expansion-2026-07-25`  
**Implementation SHA:** `4fef08d` (close-out contact-badge fix; branch tip after docs commit below)  
**Auditor / close-out:** Cursor agent (beast-pass verification)  
**Public:** https://benson.kckellie.com  
**API:** https://api.kckellie.com  

---

## Executive summary

The hospitality-partnership vertical shipped on branch `release/scout-expansion-2026-07-25` as eight unpushed commits plus a close-out fix. Production fingerprints **MATCH** after redeploy.

**What changed for Kellie:** Today and Pitches now surface **one real, evidenced hospitality pitch** (Crossroads Hotel — Kansas City Ballet Second Company Showcase, Sept 5) instead of 96 mixed junk rows. Synthetic `.test`/`.example` fixtures can no longer reach live Gmail send. Contact evidence, compensation, and send-readiness are explicit contracts — inferred or unknown contacts cannot be send-ready. Telegram urgency is per-message (retail coupons and newsletters are not urgent; send failures and bound business replies can be). A **Flower Child** reply from July was recovered via sender-based attribution. **94** abandoned worker runs were closed. Four generated media kits (core, hotel, restaurant, destination) are live at `/media-kit/[slug]`.

**Close-out verification found one real UI defect:** Pitches showed “No verified media or PR contact found” for Crossroads while Today correctly read `verified_role_inbox`. Root cause: approval badges still read legacy `contact_verification_status` (`missing`) instead of `contact_evidence_state`. **Fixed** in close-out; redeployed; Pitches now shows **Verified media or partnerships inbox**.

**Honest state:** 71 `active` outreach rows remain in DB (mostly canceled history); Kellie's actionable approval queue is **2** pitches. Origin Hotel has no verified media route and correctly does not appear as send-ready. Legacy inventory drafting is off by default. Instagram/Facebook analytics remain disconnected.

---

## Live before-state (2026-09-03 audit @ `fbe95b9`)

| Metric | Before |
|---|---|
| Deployment fingerprint | `f4bb93607163c6a8` (pre-pass) |
| Outreach emails total | 167 |
| In Kellie's approval queue (`needs_approval`, active) | **96** |
| Synthetic fixtures at top confidence | **6** (all `.test`/`.example`, marked `verified_direct_email`) |
| Pitches to article headlines / SEO pages | **18+** |
| Stale pitches (median age) | **29 days** |
| Inbound replies bound to a pitch | **0 / 14** |
| Real Gmail sends (lifetime) | **2** (same subject, 6 days apart) |
| Media kits usable for send | **0** (69-byte test PNG marked active) |
| Worker runs stuck `running` | **94** (oldest 2026-07-25) |
| Drafting workers instrumented | **No** (`benson-outreach-drafting`, `outreach-follow-up` had zero `worker_job_runs`) |
| Telegram sponsor digests (7d sample) | Ross Stores, Marshalls, Minsky's coupons — all stamped urgent |
| Top sponsor candidate hospitality quality | **1 / 9** actionable (Crossroads Hotel) |

Full audit artifacts: `/tmp/benson-audit-data.md`, `/tmp/benson-audit-code.md`, `/tmp/benson-audit-history.md`, `/tmp/benson-source-verification.md`.

---

## Root causes

1. **No send-safety gate** — live Gmail armed while smoke-test fixtures sat at top of queue with `verified_direct_email`.
2. **No readiness contract** — free-text contact status, no compensation model, no quarantine; everything looked equally approvable.
3. **Legacy inventory drafting** — article headlines, SEO pages, and rate-plan names promoted to `sponsor_contacts`; generic template pitches with stale “over 5K followers.”
4. **Pitch writer unfed** — model invented reach when analytics resolution failed; no mechanical check against verified facts.
5. **Reply attribution thread-only** — contact-form sends have no Gmail thread; Flower Child reply missed since July.
6. **Telegram urgency absent** — sponsor inbox category hard-coded “high urgency” for all mail.
7. **Today ignored partnerships** — planner-only path; Kellie's daily surface never showed approve/reply/contact tasks.
8. **Contact badge drift** — migration 88 wrote `contact_evidence_state` but approval UI still read legacy `contact_verification_status`.

---

## Architecture and data flow

```
partnership_sources (seeded URLs, health_state)
        ↓ fetch + extract (JSON-LD / static HTML)
partnership_source_facts (provenance: source_url required)
        ↓ brief-from-facts + qualification (9 factors, capped)
partnership_opportunities (compensation_state, send_ready boolean)
        ↓ compose + evaluate (mechanical rubric, 1 retry)
outreach_emails (quarantine_state, pitch_readiness_status, approval hash)
        ↓ Kellie approves on /email/approvals
outreach-dispatch (every 5m) → sendOutreachEmail
        ↓ recipient-safety + assertApprovedForSend + content hash match
Gmail (live) or simulate
        ↓
gmail-inbox-sync → reply-attribution (thread → sender → domain → business)
        ↓
Today partnershipDecisions + Telegram classifyUrgency
```

**Hard gates (in order):** quarantine → contact evidence (`inferred_unverified`/`unknown` never send-ready) → recipient-safety (reserved TLD, fixtures, wrong-purpose inboxes) → send-readiness (analytics, media kit, compensation) → approval record → content hash at send.

---

## Source registry and seeded sources

Migration **88** adds `partnership_sources`, `partnership_source_facts`, `partnership_source_checks`. Seed set from `/tmp/benson-source-verification.md`:

| Tier | Sources (examples) |
|---|---|
| **1** | Loews influencer stay request (KC property in dropdown), Crossroads events, Visit KC media + creator inbox, Kansas Tourism media visits, Crossroads `media@` contact, Loews press (Sarah Murov — KC) |
| **2** | Visit KC hotel updates, Raphael event calendar, Hilton influencer router, Origin KC deals (JSON-LD), Visit KC media FAQs, KC Restaurant Week (dormant handling), Loews KC offers, Missouri tourism media center |
| **3** | Raphael offers/press, Aparium portfolio, GKCRA board, KCRW participant guide, Visit KC newsroom (stale index — no alert on silence) |

**Live DB (2026-09-03):** 17 sources — 12 `unchecked`, 3 `healthy`, 2 `disabled_not_applicable`. Facts extracted: Crossroads Events (11), Raphael calendar (10), Crossroads Contact (4) — all with `source_url`.

**Not seeded:** Four Seasons (no KC property), HLAKC news (`robots Disallow`), Origin contact page (unverified timeout).

---

## Contact-evidence model

Six states (`contact_evidence_state` enum, migration 88):

| State | Send-ready? | Meaning |
|---|---|---|
| `verified_named_decision_maker` | Yes (if safety passes) | Named person on official page |
| `verified_role_inbox` | Yes | e.g. `media@crossroadshotelkc.com` |
| `official_general_inbox` | Yes (low confidence) | `info@` on property domain |
| `official_contact_form` | No (human submits) | Form-only route |
| `inferred_unverified` | **Never** | Pattern guess / unconfirmed |
| `unknown` | **Never** | No route found |

**Live counts:** inferred_unverified 75 · official_contact_form 46 · official_general_inbox 18 · unknown 13 · verified_role_inbox **1** (Crossroads `media@`).

**Origin Hotel KC:** offers monitored; **no verified media inbox** — correctly not send-ready.

**Blocklist:** `breakingnews@hilton.com` in code (`DO_NOT_CONTACT_ADDRESSES`); `partnership_contact_blocklist` table for operator additions (empty — code is source of truth).

---

## Compensation model

`partnership_compensation_state` enum. Assessment separates **offered** vs **requesting**. Cold pitches record requesting side (e.g. “Requesting fully hosted”) — not “unknown.” Deliverable weight capped by compensation level.

**Live:** 2 opportunities at `fully_hosted` (Crossroads-related). Zero rows with `send_ready = true` on opportunities until Kellie approves.

---

## Pitch-generation design

1. **Brief from facts** — `brief-from-facts.ts` assembles verified fact list from `partnership_source_facts` + live TikTok analytics (`analytics_connectors`: 6,703 followers, ~918 median views at generation time).
2. **Compose** — model writes only from brief; refuses if required fact missing.
3. **Evaluate** — mechanical rubric (30/30 Crossroads first attempt); bans invented numbers, generic “your hotel,” discount-as-hosted language.
4. **Qualification** — nine named factors; recency/keyword alone cannot surface an opportunity.
5. **Pipeline** — `hospitality-pitch/pipeline.ts` ties opportunity → outreach row → readiness status.

Legacy `BENSON_LEGACY_OUTREACH_DRAFTING_ENABLED` defaults **off**.

---

## Actual before/after pitch examples

### Before (generic legacy draft — quarantined)

**Brown Button Estate Sale**, 2026-09-02, `needs_contact`:

> Hey Michael — I saw the details for the West Bottoms Warehouse Sale and it looks fantastic! I film KC shopping hauls…  
> **With over 5K followers**, I'm @kckellie on TikTok…  
> How about collaborating with a gift card or exclusive discount…  
> Let me know who handles partnerships or if you'd like to chat this week!

Problems: stale rounded reach, templated opener, unverified first name, non-hospitality entity.

### After (Crossroads Hotel — active, `ready_for_review`, 2026-09-03)

**To:** `media@crossroadshotelkc.com`  
**Subject:** Second Company Showcase Video at Crossroads Hotel

> Second Company Showcase at Crossroads on Sept 5th is a fantastic opportunity… The Kansas City Ballet's Second Company will perform…  
> I'm Kellie, a content creator based in Kansas City with **6,703 followers on TikTok**. A typical post of mine lands around **918 views**, contributing to a total of **1,168,497 views across 250 posts**.  
> I propose creating a short first-person video from the night…  
> Deliverables would include one in-feed TikTok video and a set of stories from the night. In exchange, I would request a complimentary room and dining credit.  
> [Media Kit](https://benson.kckellie.com/media-kit/kellie-hotel)

Scored **30/30** on evaluation rubric; names dated event, real analytics, specific deliverables, honest ask.

---

## Media-kit implementation

- Generated kits: **core**, **hotel**, **restaurant**, **destination** (`build-media-kits.ts`).
- Public routes: `/media-kit/kellie`, `/media-kit/kellie-hotel`, etc.
- Test artifacts (`test-kit.png`, 69 bytes) flagged `is_test_artifact = true`; **zero** active emails attach them.
- Screenshots: `docs/ops/screenshots/hospitality-partnership-2026-09-03-media-kit-*-{desktop,mobile}.png`

---

## Approval and email-send behavior

| Gate | Enforcement |
|---|---|
| Fixture / reserved TLD | `recipient-safety.ts` at draft skip, approve, dispatch, send, UI disable |
| Quarantined row | approve + dispatch + send refuse |
| Approval hash | `approved_content_hash` + `approved_recipient`; send rejects drift |
| Duplicate content | same body to same contact blocked |
| `assertApprovedForSend` | status `scheduled`, `approved_at`, not quarantined |

**Live queue:** 2 `needs_approval` active — Crossroads (evidenced) + Selling Men's Casual Styles (official form).

**Send mode:** live (Gmail) from Kellie creator account — verified on Pitches desktop screenshot; no test send performed during verification.

---

## Telegram Urgent rules and verification

`classifyUrgency` in `partnership-urgency/classify.ts`:

**Urgent when:** approved send failed · bound business reply with decision/date/negotiation/expiry language · commitment due within 72h · verified short-window opportunity.

**Not urgent:** `new_lead`, `discovery_finding`, unbound inbound (newsletters/receipts), noise patterns (Ross, Marshalls, Minsky's, coupons, unsubscribe).

Removed hard-coded “SPONSOR inbox — high urgency” from `email-category.ts`.

**Tests:** 18 urgency tests pass (included in focused suite 260/260).

---

## Today / Home / Discover / Pitches responsibilities

| Surface | Role |
|---|---|
| **Today** (`/editor`) | Daily execution + up to 5 `partnershipDecisions` (approve pitch, reply waiting, find contact, obligation). Shows Crossroads approve + Raphael find-contact. |
| **Home** (`/home`) | Video-growth + follower-growth **first** in Today's Brief; Benson Picks; partnership tile when relevant. Verified intact on mobile/desktop screenshots. |
| **Discover** (`/discoveries`) | Content opportunity voting — contracts unchanged; no hospitality gate loosening. |
| **Pitches** (`/email/approvals`) | Approve/edit/send hospitality and sponsor drafts; live send config visible. |
| **Watchlist** | Source monitoring — unchanged contract. |

---

## Backlog quarantine behavior

Migration 88 + `classify-partnership-backlog.ts` — **nothing deleted**:

| quarantine_state | count |
|---|---|
| active | 71 |
| quarantined_stale | 67 |
| quarantined_invalid_entity | 19 |
| quarantined_synthetic | 6 |
| quarantined_weak | 5 |

Kellie's visible approval work: **2** rows. Quarantined rows refused at approve/dispatch/send.

---

## Files and migrations changed

**Migration:** `db/migrations/88_hospitality_partnership_contracts.sql`

**Core modules (representative):**
- `partnership-contracts/*` — contact evidence, compensation, quarantine, send-readiness, business-key
- `hospitality-pitch/*` — brief, compose, evaluate, qualification, pipeline
- `partnership-sources/*` — registry, fetch, extract, health, seed
- `partnership-urgency/*`, `partnership-today/decisions.ts`
- `sponsor-outreach/recipient-safety.ts`, `reply-attribution.ts`, `content-hash.ts`, `contact-confidence.ts`
- `inventory/today-execution.ts`, `gmail-inbox/email-category.ts`
- `media-kit/*`, scripts (`partnership-db-integrity.ts`, `sweep-abandoned-worker-runs.ts`, `screenshot-surfaces.ts`)

**Dashboard:** `email-approvals-panel.tsx`, `command-center-panel.tsx`, `media-kit/[slug]/route.ts`, `next.config.mjs`

**Workers:** `benson-outreach-drafting.ts`, `outreach-follow-up.ts` — instrumented via `createCronWorker`

See `git diff --name-only fbe95b9..HEAD` for full list (~90 paths).

---

## Production data touched

| Action | Detail |
|---|---|
| Migration 88 | Additive columns/tables; backup `/tmp/benson-backup-2026-09-03/partnership-tables-pre-migration-88.sql` |
| Quarantine classification | 167 emails + 152 contacts + 114 partnerships classified in place |
| Flower Child reply | Bound via `sender_exact` to Flower Child pitch (`elemiere@foxrc.com`) |
| Worker sweep | 94 runs → `failed` with reason; backup `/tmp/benson-backups-2026-09-03/pre-worker-sweep.sql` |
| Crossroads pitch | New evidenced draft 2026-09-03; only hospitality pitch in active approval queue |
| Media kits | 4 generated business variants; test kits flagged artifact |

**Not done:** No emails or Telegram messages sent during verification. No pitch backlog deleted. No fake opportunities invented.

---

## Test commands and exact results

```bash
# Focused beast-pass suite (core)
cd services/core && node --import tsx --test \
  src/sponsor-outreach/contact-confidence.test.ts \
  src/sponsor-outreach/recipient-safety.test.ts \
  src/partnership-contracts/partnership-contracts.test.ts \
  src/partnership-urgency/urgency.test.ts \
  src/sponsor-outreach/reply-attribution.test.ts \
  src/inventory/today-execution.test.ts \
  src/inventory/today-partnerships.test.ts \
  src/display-title/*.test.ts \
  src/pre-alpha/home-briefing-authority.test.ts \
  src/hospitality-pitch/*.test.ts
# Result: 260 pass / 0 fail

# Postgres integration (pre-existing failures excluded from pass criteria)
pnpm --filter @social-agent/core test:postgres
# Result: 114 pass / 2 fail (program-library enrichment budget gate; dated-occurrence persist idempotency — baseline)

# DB integrity (read-only)
cd services/core && npx tsx src/scripts/partnership-db-integrity.ts
# Result: all checks ran; fixture domains in active queue = 0; 1 bound reply (Flower Child)
```

Tier A during deploy (prior commit): **246/246**.

---

## Build and deployment results

| Deploy | Fingerprint | apiStartedAt | dashboardBuiltAt |
|---|---|---|---|
| Initial pass | `43ed7b948c50b705` | 2026-09-03T07:29:56Z | 2026-09-03T07:30:03Z |
| Close-out (contact badge fix) | **`13ffe7425d9336cc`** | 2026-09-03T16:24:12Z | 2026-09-03T16:24:19Z |

Close-out: `pnpm benson:deploy-local` — **MATCH** confirmed.

---

## Public mobile and desktop verification

| Surface | Mobile 390×844 | Desktop 1440×900 | Notes |
|---|---|---|---|
| Today `/editor` | ✅ | ✅ | Crossroads approve card; Raphael find-contact; priorities readable |
| Pitches `/email/approvals` | ✅ | ✅ | Crossroads shows verified inbox **after fix**; live Gmail mode shown |
| Home `/home` | ✅ | ✅ | Video view deltas + follower growth first in brief |
| Discover `/discoveries` | ✅ | ✅ | Save/Skip; no gate regression |
| Watchlist | ✅ | ✅ | Source monitoring UI intact |
| Media kits | ✅ (prior) | ✅ (prior) | hotel + restaurant variants |

**UX checks:** No horizontal overflow flagged by screenshot script (except Today first attempt — `networkidle` timeout on public URL; recaptured with `domcontentloaded`). Minor: partnership card subtitle truncates on Today mobile; FAB overlaps card edge but not primary actions. Bottom nav does not cover approve/send buttons on Pitches desktop.

---

## Screenshot / artifact paths

```
docs/ops/screenshots/hospitality-partnership-2026-09-03-today-{mobile,desktop}.png
docs/ops/screenshots/hospitality-partnership-2026-09-03-pitches-{mobile,desktop}.png
docs/ops/screenshots/hospitality-partnership-2026-09-03-home-{mobile,desktop}.png
docs/ops/screenshots/hospitality-partnership-2026-09-03-discover-{mobile,desktop}.png
docs/ops/screenshots/hospitality-partnership-2026-09-03-watchlist-{mobile,desktop}.png
docs/ops/screenshots/hospitality-partnership-2026-09-03-media-kit-hotel-{mobile,desktop}.png
docs/ops/screenshots/hospitality-partnership-2026-09-03-media-kit-restaurant-{mobile,desktop}.png
```

Background: `/tmp/benson-source-verification.md`, `/tmp/benson-audit-*.md`

---

## Commit hash

```
fbe95b9  (audit baseline — pre-pass)
20374fc  Stop live Gmail send from ever reaching a synthetic test fixture
24601e8  Give partnership pitches an honest readiness contract so weak drafts stop reaching Kellie
8c4b546  Feed the pitch writer verified facts so Benson stops writing generic emails
0704c64  Put one evidenced hospitality pitch in Kellie's queue instead of 75 she cannot act on
be12293  Decide Telegram urgency per message instead of stamping every sponsor email urgent
46aaf6c  Give Today the partnership decisions it was missing and close 94 abandoned worker runs
b313837  Attribute replies by sender as well as thread, recovering a real reply missed since July
0bde39f  Fix two deploy blockers: repo-root discovery and webpack resolution of core imports
4fef08d  Read Pitches contact badges from contact_evidence_state not legacy status
cfa12a2  Add hospitality partnership beast-pass report and verification screenshots

---

## Deployment fingerprints

**Current (post close-out deploy):** `13ffe7425d9336cc` — source, api, dashboard, worker **MATCH**.

---

## Known limitations

1. **71 `active` outreach rows** in DB — mostly canceled history; UI queue is 2.
2. **Origin Hotel** — monitor-only until human confirms outreach route.
3. **Raphael Hotel** — general inbox / form only; Today correctly asks “find contact.”
4. **Legacy approval hashes** — 11 pre-hash approvals remain without `approved_content_hash`.
5. **Instagram/Facebook/YouTube** analytics disconnected; pitches use TikTok only.
6. **KC Restaurant Week** participant list dormant (expected off-season).
7. **Visit KC newsroom** index stale (~6 months); silence is normal.
8. **Core `tsc`** — 42-file pre-existing errors unrelated to this branch.
9. **Host memory** — 1.5 GiB available at deploy; swap-heavy; deploy succeeded with retry on cold `.next`.

---

## Honest remaining blockers

1. **Kellie must approve** the Crossroads pitch — Benson will not auto-send.
2. **Loews influencer form** — requires 90-day engagement stats + media kit upload; not yet a one-click Benson send.
3. **HLAKC member directory** — needs Playwright; not automated.
4. **Four Seasons / national luxury** — no KC property; do not pitch.
5. **Flower Child reply** — event window passed; recorded for relationship history, not live urgency.

---

## Recommended next steps

1. Kellie reviews and approves Crossroads pitch on Pitches (or edits subject/body).
2. Run `partnership-sources-check` on Tier-1 URLs monthly; promote `unchecked` → `healthy` as checks succeed.
3. Research verified contact for Raphael (press page addresses journalists but publishes no email).
4. Connect Instagram analytics or explicitly label pitches TikTok-only.
5. Schedule Loews KC package — property in dropdown + Sarah Murov contact — as second evidenced pitch once Crossroads path is proven.
6. Re-run `attribute-inbound-backlog` if new contact-form sends occur.

---

*End of report.*
