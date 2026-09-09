# Benson Kansas City Contact Intelligence — Closeout

**Date:** 2026-09-09  
**Integrator:** PRIMARY (this session)  
**Workbook:** `Kansas_City_PR_Affiliate_Directory.xlsx` (checked **2026-09-08**)  
**Fixture:** `docs/ops/fixtures/kc-pr-affiliate-directory-2026-09-08.json`  
**Deploy fingerprint (MATCH):** `705df6daa09fec51`

---

## Mission verdict

Benson can now answer **who to contact, why fit, route type, realistic ask, evidence, freshness, which media kit, what to say next, and what to do next** for Kansas City PR / affiliate / media-access routes — via **Contacts & Programs** (`/contacts-programs`), not a lifeless address book.

Guessed / unverified contacts remain **not send-ready**. Workbook confidence is stored as import provenance (`verificationMethod: workbook_import`, `permanentVerification: false`) with a **90-day** send-gate freshness window.

**No real emails, Telegram messages, or form submissions were sent in this mission.**

---

## Phase 1 — Match vs existing DB (pre-import)

| Bucket | Outreach | Programs | Notes |
|--------|---------:|---------:|-------|
| equivalent | 0–1 | 0 | Crossroads `media@` already strong |
| incomplete | 6–7 | 1 | Same org; workbook fills gaps (Current, Monarchs, Crown Center, Loews, Hotel KC, Crossroads, MRA) |
| conflicting | 0 after integrator fix | 0 | Named PR vs unnamed general inbox → **new row**, not overwrite |
| new | 42 | 9 | Net new routes |
| stale | 0 | — | |

Workbook: **48** outreach rows / **44** establishments; **10** programs.  
DB baseline: **154** sponsor_contacts (**112** active), **92** program-library rows.

---

## Phase 2 — Import results (applied)

| Action | Outreach | Programs |
|--------|---------:|---------:|
| inserted | **42** | **9** |
| updated | **6** | **1** |
| conflicts skipped | **0** | — |
| idempotent re-apply | 0 inserts; provenance refresh / enrichment only | |

**Post-import workbook-provenance rows:** **48** contacts covering all outreach rows.

| Evidence state | Count |
|----------------|------:|
| verified_named_decision_maker | 22 |
| verified_role_inbox | 12 |
| official_contact_form | 6 |
| official_general_inbox | 5 |
| unknown | 3 |

With email: **40**. With official form URL: **6**.

Provenance block: `[[benson-contact-import:v1]]` in `sponsor_contacts.notes` / program notes.  
Programs authority: `operator_supplied` / needs verification — **not** claimed `verified_official`.

---

## Phase 3 — Contact evidence & freshness

- Discovery 10-state lifecycle maps into send-gate 6-state model via `toSendEvidenceState()` — **never widens** emailable states.
- Send-ready requires official-domain evidence support, recipient safety, no conflict note, and freshness.
- **Workbook imports:** `WORKBOOK_IMPORT_RECHECK_DAYS = 90` (stricter than live 120).
- Discovery routine window: **60–90 days**; named contacts overdue sooner; important pitch recheck **7 days**.
- Email inference from names is **hard-banned** (`evaluateEmailFormatInference`).
- General inbox is never treated as PR named route in recommendations.

---

## Phase 4 — Reusable discovery

Landed under `services/core/src/contact-intelligence/discovery/`:

- Structured search order (`search-order.ts`)
- Freshness, purpose blocklist, evidence records, review queue
- Pure policy — research → evidence / review queue, **not** auto-pitches

---

## Phase 5 — Recommendations

Live store (`contact-intelligence/store.ts`), `stub: false`:

- Hub views: recommended_now, verified_contacts, programs_applications, needs_verification, follow_ups, recently_changed
- Each card: why fit, why now, route, evidence + last checked, ask, value to org, content concept, media-kit variant, weaknesses, next action
- Ranking refuses “email alone”; ask type `unknown` demoted; monitor-only excluded from recommended_now
- Media kits: hotel / restaurant / destination / core from live generated kits (test artifacts excluded)

**Live smoke (MATCH deploy):** **20** recommended_now cards; **46** verified_contacts view rows; **102** program-library rows in programs view (includes prior library + 10 workbook programs).

Sample recommended: Visit KC (named + hosted_stay ask), WWI Museum, Kauffman Center, Joe’s KC BBQ, Summit Hospitality.

---

## Phase 6 — Contact assistance

- Brief API: `/api/contact-intelligence/briefs/:id` and `/recommendations/:id/brief`
- Compact brief + form field packets (not pretend email)
- Media-access disclaimer mandatory; affiliate published facts only when known
- Pitch / form packet hrefs point at existing approval surfaces; Kellie approval still required before send

---

## Phase 7 — UX

- **Contacts & Programs** under More (`nav-config` + opportunities More menu)
- Routes: `/contacts-programs`, `/contacts-programs/[id]`, `/contacts-programs/recommendations/[id]`
- Connected links: Discover, Watchlist, Partnerships, CRM, Pitches, Media Kits, Today, Program library, Form packets
- Mobile-first card → brief → pitch/form approval path

---

## Phase 8 — Feedback loop

- Feedback persists to `benson_recommendation_events` with `source=contact_intelligence`
- Dismissals silence re-suggest for **45 days** (time-only; no “new evidence lifts silence” check yet)
- Silence ≠ rejection without rule + elapsed time

---

## Phase 9 — Tests

| Suite | Result |
|-------|--------|
| `src/contact-intelligence/**/*.test.ts` (59 tests) | **pass** |
| New: import-safety, discovery, import, ux-contracts | pass |
| Pre-existing core deploy suite (246 tests in deploy path) | pass (sibling/watchlist suite included in deploy script) |

**New failures introduced:** none (after integrator alignment of Starlight multi-contact match test).

No email / Telegram / form I/O in tests.

---

## Phase 10 — Deploy & verification

| Item | Value |
|------|-------|
| Status | **MATCH** |
| Fingerprint | `705df6daa09fec51` |
| API | live `/api/contact-intelligence/*` stub=false |
| Dashboard | `/contacts-programs` HTTP 200 |

### Route spot-checks (HTTP GET only; no forms)

| Target | Result |
|--------|--------|
| Visit KC media contact page | **200** — `daaron@visitkc.com` present in HTML |
| Crossroads / Loews marketing pages | 200 — addresses often not in static HTML (JS/CRM); retained workbook evidence URL + import provenance; needs human recheck before high-stakes send |
| Union Station / WWI press paths tried | some 404 alternate paths — treat as **needs recheck** for those URLs before important pitch |

### Confirmed route types in system

- ≥1 direct email (e.g. Visit KC `daaron@visitkc.com`) — sendReady true only when evidence gate passes
- ≥1 official form (6 form URLs imported)
- ≥1 program (Visit KC creator/media visit, Awin affiliate, etc.)
- ≥1 media-access program (Starlight, WWI, Worlds of Fun) labeled **not paid / not guaranteed**

---

## Architecture decisions (integrator)

1. Keep hospitality **6-state send gate**; map mission **10 discovery states** one-way.
2. Multi-contact orgs: different named emails → **separate rows** (Visit KC ×2), not false conflicts.
3. Same person/role + different email → **conflict quarantine** (note + provenance), no overwrite.
4. Workbook never silently becomes permanent verification (90-day gate + provenance flag).

---

## Sibling lane coordination

| Lane | Status |
|------|--------|
| Data/import | Merged — fixture, mapping, apply-import, match script |
| Discovery/research | Merged — discovery modules + tests |
| Workflow/UX | Merged — hub UI, filters, brief panel, nav |
| Verification | **Handoff ready** — start after this report; focus on official-page rechecks for non-static emails and program URLs |

Parallel Eventbrite watchlist work existed in the tree; **not** included in the contact-intelligence commit unless committed separately.

---

## Limitations

- Some official pages do not expose emails in static HTML; workbook remains imported evidence requiring freshness recheck before important pitches.
- Program library still uses `other` + `programKind=` notes for hosted/media-access (enum extension optional follow-up).
- Recommendations use workbook best-use + category heuristics — not full live opportunity graph join yet.
- Mobile visual screenshot automation was unavailable in-session (no browser tab); HTTP route build includes contacts-programs pages.

---

## Commits / report path

- Report: `BENSON_KANSAS_CITY_CONTACT_INTELLIGENCE_2026-09-09.md` (this file)
- Commits:
  - `a370fa253c21afd14205c169c3a55c51d75bb2f6` — Ship Kansas City contact intelligence…
  - `c8a25e6` — Record commit hash in closeout report
- Branch: `release/scout-expansion-2026-07-25` (pushed)

### Git

```
c8a25e6 Record contact intelligence commit hash and MATCH fingerprint in the closeout report.
a370fa253c21afd14205c169c3a55c51d75bb2f6 Ship Kansas City contact intelligence: workbook import, recommendations, and Contacts & Programs hub.
```

---

## Confirmation

- **No real outreach email sent**
- **No Telegram sent**
- **No forms submitted / no program enrollment**
- Credentials not exposed
