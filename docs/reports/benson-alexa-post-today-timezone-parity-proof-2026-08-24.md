# Benson Alexa — postToday voice prefilter timezone parity proof

**Date:** 2026-08-24  
**Scope:** Prove (and minimally fix if needed) that the optimized `what-should-kellie-post` SQL prefilter is a conservative superserset under creator-local temporal semantics — without changing ranking, Today eligibility, or `scorePostToday`.  
**Not done:** Today zero-yield, sponsor leak, Alexa intents, AWS/Alexa/Cloudflare deploy.

---

## 1. Exact current SQL temporal predicates (after this task)

`postTodayVoiceSqlTimelyOr(now)` is the **UNION** of two day windows:

### Window A — process-local (Command Center parity)

```
dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
dayEndExclusive = dayStart + 1 calendar day
eventEndExclusive = dayStart + 2 calendar days
```

### Window B — creator timezone (`getCreatorTimezone()` → `America/Chicago`)

```
todayKey = getLocalCalendarDay(now, timezone)
dayStart = startOfLocalDayKey(todayKey, timezone)          // UTC instant
dayEndExclusive = startOfLocalDayKey(todayKey+1, timezone)
eventEndExclusive = startOfLocalDayKey(todayKey+2, timezone)
```

### Per-window OR (then OR across windows)

```
(discovered_at >= dayStart AND discovered_at < dayEndExclusive)
OR (created_at >= dayStart AND created_at < dayEndExclusive)
OR (event_starts_at IS NOT NULL
    AND event_starts_at >= dayStart
    AND event_starts_at < eventEndExclusive)
```

Plus unchanged non-temporal filters: ingested retention, non-mock, lifecycle not `expired`/`archived`.

**Postgres does not use `CURRENT_DATE`.** Bounds are explicit UTC `timestamptz` literals from JS.

Downstream (unchanged authority):

```
finalizeIngestedInventoryRows
→ filterPossiblePostTodayCandidates   // same isToday/isWithinDays as isEligiblePostToday
→ computeCommandCenter(..., { sections: ['postToday'] })
→ sections.postToday
```

---

## 2. Runtime timezone report (read-only)

| Source | Value |
|---|---|
| `process.env.TZ` | `America/Chicago` |
| `Intl` resolved timezone | `America/Chicago` |
| Postgres `SHOW timezone` | `Etc/UTC` |
| Benson `getCreatorTimezone()` | `America/Chicago` |
| Default creator TZ | `America/Chicago` |

Postgres session TZ is UTC, but comparisons use explicit UTC instants — session TZ does not redefine the window.

---

## 3. Timezone authority (exact)

| Layer | Authority |
|---|---|
| **Final ranking / `isEligiblePostToday` timely** | Command Center private `isToday` / `isWithinDays` using **process-local** `Date#getFullYear/getMonth/getDate` (not `getCreatorTimezone()`) |
| **Benson creator-local helpers** | `getCreatorTimezone()` / `getLocalCalendarDay` / `startOfLocalDayKey` — used widely for calendar/voice weekend; **now also used in SQL window B** |
| **SQL prefilter requirement** | Must be a **superset** of anything Command Center timely can accept; may be broader |

### Was the latency-report wording “server-local” accurate?

**Yes** for the pre-fix SQL/JS bounds: they used process-local `Date` midnight arithmetic (same as Command Center). On this host that coincides with Chicago because `TZ=America/Chicago`, but it was not creator-timezone-explicit.

---

## 4. Did production code require modification?

**Yes — SQL boundary only (conservative widen).**

| Change | Why |
|---|---|
| SQL day window = **process-local ∪ creator-timezone** | Prevent false negatives if process TZ ≠ creator TZ; keep Command Center parity via process-local arm; anchor creator arm with `startOfLocalDayKey` |
| `filterPossiblePostTodayCandidates` | **Unchanged** (still mirrors Command Center timely) |
| `isEligiblePostToday` / `scorePostToday` / `passesTodayEligibility` | **Unchanged** |

Changing Command Center `isToday` to creator-local would be an eligibility semantic change — **out of scope**.

---

## 5. Files changed

| Path | Change |
|---|---|
| `services/core/src/benson-voice-read/load-post-today-voice-candidates.ts` | Creator-TZ window via `startOfLocalDayKey`; SQL OR union; proof helpers |
| `services/core/src/benson-voice-read/what-should-kellie-post-timezone-parity.test.ts` | **New** — 12 parity/boundary cases |
| `services/core/src/benson-voice-read/index.ts` | Export window helpers |

---

## 6. All 12 parity/boundary cases

| # | Case | Outcome |
|---|---|---|
| 1 | Valid timed item, daytime Chicago | **PASS** — old includes, optimized includes, same order |
| 2 | UTC day ≠ Chicago day (near UTC midnight) | **PASS** — not dropped; parity |
| 3 | Just after Chicago midnight | **PASS** |
| 4 | Just before Chicago midnight | **PASS** |
| 5 | Server TZ difference (union proof without mutating host TZ) | **PASS** — process-local + creator-local instants both match SQL union; creator window uses `startOfLocalDayKey` |
| 6 | Date-only event on creator-local today | **PASS** |
| 7 | Evening Chicago event whose UTC date is tomorrow | **PASS** |
| 8 | Tomorrow event within `isWithinDays(..., 1)` + audience | **PASS** — prefilter keeps; parity |
| 9 | Outside window (next week) | **PASS** — old rejects; final postToday still `[]` |
| 10 | Discovery-today undated | **PASS** — timely via discovered/created; SQL keeps; final parity with old (may or may not rank into postToday depending on full eligibility — identical either way) |
| 11 | Non-empty 3-candidate order | **PASS** — see §7 |
| 12 | Live zero control | **PASS** — old `[]` == optimized `[]` |

---

## 7. Explicit NON-EMPTY old vs optimized IDs/order

Synthetic fixtures at Chicago wall `2026-08-24 14:00`:

| Path | IDs (order) |
|---|---|
| Old / full `computeCommandCenter` → `postToday` | `…0321`, `…0322`, `…0323` |
| Optimized `filterPossiblePostTodayCandidates` → CC `sections:['postToday']` | `…0321`, `…0322`, `…0323` |
| Match | **exact** |

Titles (for readability): Alpha luxury workshop → Beta boutique pop-up → Gamma thrift haul.

---

## 8. Live zero-result parity

| Path | IDs | Count |
|---|---|---:|
| Old full inventory → `postToday` | `[]` | 0 |
| Optimized voice load → `postToday` | `[]` | 0 |

Speech unchanged: “I don't have a strong content post for Kellie right now.”

---

## 9. Latency after correctness fix

| Call | ms |
|---|---:|
| First optimized | **507** |
| Repeat 1 | 206 |
| Repeat 2 | 215 |
| Repeat 3 | 173 |
| Repeat 4 | 228 |
| Repeat 5 | 210 |

| Metric (5 repeats) | ms |
|---|---:|
| min | 173 |
| max | 228 |
| average | 207 |

Still **≪ 1.5s preferred** and **≪ 2.5s** Lambda budget.  
Slight regression vs prior ~110–144 ms is explained by the dual SQL window OR (creator ∪ process-local). Correctness preferred; no timeout increase.

---

## 10. Tests

| Suite | Result |
|---|---|
| All `src/benson-voice-read/*.test.ts` | **51 passed / 0 failed** |
| Includes timezone suite (13) + prior parity + weekend/auth/ops | Yes |

---

## 11. Confirmations

| Requirement | Status |
|---|---|
| `scorePostToday` unchanged | Confirmed |
| `passesTodayEligibility` unchanged | Confirmed |
| Command Center remains final authority | Confirmed |
| No semantic Today zero-yield fix | Confirmed |
| No durable writes | Confirmed |
| No LLM / web / scrape / research / projection / sync | Confirmed |
| No AWS / Alexa / Cloudflare deployment | Confirmed |
| Optimized prefilter does not depend **solely** on server-local TZ | Confirmed (union with creator `startOfLocalDayKey`) |
| False negatives vs Command Center timely prevented | Confirmed (process-local arm retained) |

---

## 12. OUT OF SCOPE findings

1. **Command Center `isToday`/`isWithinDays` still use process-local `Date` getters**, not `getCreatorTimezone()`. Aligning CC timely to creator-local would be an eligibility semantic change — not done here.  
2. Live `postToday` remains empty due to `no_specific_today_reason` — not fixed.  
3. Sponsor/email housekeeping leakage into core `postToday` — not fixed.  
4. Postgres session `Etc/UTC` is fine with explicit timestamptz bounds; no config change.

---

## 13. Deploy readiness for this concern

Proven:

1. SQL is a conservative supersets of Command Center timely (process-local arm) **and** explicitly includes creator-local Chicago day bounds.  
2. Creator-local day-crossing fixtures pass.  
3. Non-empty candidate sets survive with identical IDs/order.  
4. Live zero parity remains exact.  
5. Latency still fits 2.5s.  
6. Ranking/eligibility semantics unchanged.
