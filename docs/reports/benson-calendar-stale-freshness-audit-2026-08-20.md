# Calendar inventory `stale_freshness` audit

Date: 2026-08-20  
Scope: **Read-only** — does `stale_freshness` incorrectly reject current / multi-day / still-actionable Calendar inventory events?  
Related temporal day-key work: **not reopened** in this audit.

**Code changed: no. Data changed: no. Projection / re-ingest: not run.**

---

## Verdict: **BUG** (accidental reuse of general-content freshness as a hard Calendar eligibility gate)

`stale_freshness` **can override** an event that `evaluateTemporalState` / `isOperatorTemporallyCurrent` still considers current.

Proven on **Just Between Friends** (Sep 2–6) and **KHA Convention** (Sep 10–11): on a middle or final day of the event window, temporal state = `current`, but eligibility returns `detail = stale_freshness`.

This is **not** a deliberate Calendar product rule documented next to eligibility. It is `isAudienceFreshContent` — written for audience “timely picks” / ranking — reused as a hard reject inside `evaluateInventoryCalendarEligibility`.

---

## Exact eligibility ordering

`evaluateInventoryCalendarEligibility(item, now)` (`eligibility.ts`):

| Order | Check | Detail if fail | Uses eligibility `now`? |
| --- | --- | --- | --- |
| 1 | `eventDate` present | `no_date` | — |
| 2 | lifecycle / creatorValue | expired / suppressed | — |
| 3 | `isOperatorTemporallyCurrent({ startsAt, endsAt, summaryText })` | `not_temporally_current` | **No** — omits `now` (uses wall clock) |
| 4 | `isAudienceFreshContent(item, now)` | **`stale_freshness`** | **Yes** |
| 5 | `past_event` via `inventoryTemporalDayKey` | `past_event` | Yes |
| 6+ | identity / geo / etc. | excluded… | — |

Critical: freshness runs **after** temporal authority and **before** `past_event`, so a temporally current multi-day event can be killed by freshness without ever reaching day-key logic.

Secondary wiring gap (out of scope to fix here): step 3 does not pass eligibility’s `now`, so controlled-NOW tests / simulation of future days can disagree between temporal (wall clock) and freshness (controlled `now`). Live product path uses the same wall clock for both once that day arrives.

---

## Exact `isAudienceFreshContent` inputs and threshold logic

Source: `services/core/src/inventory/content-freshness.ts`.

### Intended purpose (from docstring)

> Whether an item is still worth surfacing as "fresh" content for Kellie's audience. Viewers want timely KC picks — not last month's Sipps roundup or past events.

That is **audience content freshness**, not “is this event still happening.”

### Inputs consumed

| Input | Role |
| --- | --- |
| `metadata.pitchDining.publishedAt` | Preferred publish time (Pitch dining) |
| `discoveredAt` | Fallback publish/ingest time |
| `createdAt` | Final fallback |
| `eventDate` (start ISO only) | “Event too far in the past” gates |
| `eventEndDate` | **Not used** |
| Title / flags / category / ingest | Seasonal titles, World Cup, openings, KC Sipps, Pitch RSS |
| `firstSeenAt` / `lastSeenAt` | **Not used** (and omitted from inventory load projection) |

`contentPublishedAt` = pitch `publishedAt` ?? `discoveredAt` ?? `createdAt`.  
`contentAgeDays` = floor days since that publish/discover timestamp.

### Threshold logic (non-opening, dated event — Calendar’s usual path)

1. Seasonal title / World Cup stale → false  
2. **If `eventStartsAt` instant is more than 24h before `now` → false**  
   ```ts
   event.getTime() < now.getTime() - 24 * 60 * 60 * 1000
   ```
   Uses **start only**; ignores multi-day `eventEndDate`.  
3. KC Sipps → `ageDays <= 21`  
4. `pitch_dining_rss` → `ageDays <= 30`  
5. Else if has event: `daysUntil(start) < -3` → false; else **`ageDays <= 60`**  
6. No event date → `ageDays <= 45`

Openings have a separate branch (also start-centric).

### What `stale_freshness` is protecting against

In general inventory: old editorial roundups, long-ago openings, World Cup after season, and “content discovered too long ago.”

When used as a **hard Calendar eligibility reject**, it also rejects:

- multi-day events after the first 24h of the **start** instant, even while the event is still running  
- early-discovered future concerts once discovery age exceeds 60 days, even when the show is still upcoming

---

## Bounded live rows inspected (6)

Production-shaped Calendar load (thin temporal evidence present; day-key logic not under test). Controlled `NOW` ≈ Chicago noon (`…T17:00:00Z`).

| # | Row | id | Window | discoveredAt |
| --- | --- | --- | --- | --- |
| 1 | Just Between Friends | `e342a110-…` | Sep 2–6 date-only | 2026-08-19 |
| 2 | KHA Convention | `31deca08-…` | Sep 10–11 date-only | 2026-08-19 |
| 3 | Woman of Influence | `0e56903e-…` | Aug 28 date-only | 2026-08-19 |
| 4 | Kurt Vile & the Violators | `fddf67af-…` | Oct 16 timed; early discover | 2026-07-28 |
| 5 | Va Bene Italian Eatery closing | `902b768c-…` | Jul 16 historical | 2026-08-19 |
| 6 | Hillcrest Transitional Housing | `d73d4acb-…` | Aug 29 timed; fresh discover | 2026-08-19 |

---

## Controlled NOW results

Component probes use controlled `now` for both temporal and freshness. Eligibility `elig_*` also passes that `now` into freshness/`past_event`, but temporal inside eligibility still uses wall clock (see ordering).

### Just Between Friends (multi-day)

| NOW (Chicago day) | Temporal | `isAudienceFreshContent` | Eligibility detail |
| --- | --- | --- | --- |
| Sep 1 (day before) | upcoming | true | **ok** |
| Sep 2 (start) | current | true | **ok** |
| **Sep 3 (middle)** | **current** | **false** | **`stale_freshness`** |
| **Sep 6 (final day)** | **current** | **false** | **`stale_freshness`** |
| Sep 7 (after end) | expired | false | stale_freshness\* |

\*After end, temporal authority should expire the event; with controlled now, freshness fails first on the start>24h rule. Product intent: expire via temporal, not freshness.

**Proof of override:** Sep 3 — `temporalState=current`, `opCurrent=true`, `audienceFresh=false`, `elig_detail=stale_freshness`.

Cause: start `2026-09-02T00:00:00Z` is >24h before Sep 3 noon UTC-ish; end Sep 6 ignored.

### KHA Convention (multi-day)

| NOW | Temporal | Fresh | Eligibility |
| --- | --- | --- | --- |
| Sep 9 (before) | upcoming | true | ok |
| Sep 10 (start) | current | true | ok |
| **Sep 11 (final day)** | **current** | **false** | **`stale_freshness`** |
| Sep 12 (after) | expired | false | stale_freshness\* |

Same start-only 24h rule mid/end window.

### Woman of Influence (single-day)

| NOW | Temporal | Fresh | Eligibility |
| --- | --- | --- | --- |
| Aug 27 | upcoming | true | ok |
| Aug 28 (event day) | current | true | ok |

Single-day event day survives because start midnight → event-day afternoon is still within the 24h window for this fixture. **Does not prove** single-day safety in general (evening-of after 24h from UTC midnight, or late Chicago evening, can still trip the same start-only rule). Age (9 days) is well under 60.

### Kurt Vile (future, early discover)

| NOW | Temporal | ageDays | Fresh | Eligibility |
| --- | --- | --- | --- | --- |
| Aug 20 | upcoming | 22 | true | ok |
| **Oct 10** (still before show) | **upcoming** | **73** | **false** | **`stale_freshness`** |

Second failure mode: `ageDays <= 60` while event remains temporally upcoming.

### Historical control (Va Bene)

Aug 20: temporal **expired** → eligibility `not_temporally_current` (freshness would also fail). Correct reject via temporal authority.

### Fresh future control (Hillcrest)

Aug 20 and Aug 29: temporal upcoming/current-ish, fresh true, eligibility **ok**. Control for “ordinary fresh dated event.”

---

## Can `stale_freshness` override an event that is still temporally current?

**YES.**

Exact branch: after `isOperatorTemporallyCurrent` returns true, `isAudienceFreshContent` returns false via:

```ts
} else if (event && event.getTime() < now.getTime() - 24 * 60 * 60 * 1000) {
  return false;
}
```

(and/or later `ageDays <= 60` for early-discovered upcoming shows).

Eligibility then returns `{ ok: false, reason: 'stale', detail: 'stale_freshness' }`.

This is **accidental policy coupling**: general audience freshness used as Calendar inventory hard eligibility, not an intentional “drop mid-festival” Calendar rule.

---

## Recommended smallest policy fix (do **not** implement in this audit)

Prefer **A** over inventing new day windows:

**A. Skip the hard `isAudienceFreshContent` reject for Calendar inventory when the item already passed temporal currentness** (step 3), i.e. concrete event still upcoming/current.

Rationale:

- Matches stated product rule: event window governs actionability; discovery age may inform ranking (`audienceFreshnessBoost`) but should not hard-kill Calendar projection of a live/upcoming event.  
- Calendar eligibility **already requires** `eventDate`, so **B** (“only when no concrete event window”) would effectively remove freshness from this function entirely — similar outcome, but A keeps the call site explicit: “temporally current ⇒ don’t stale-gate.”  
- **C** (new event-specific threshold) is larger and still fights multi-day start-only math unless end is wired in.

Smallest code shape later: in `evaluateInventoryCalendarEligibility`, do not return `stale_freshness` when `isOperatorTemporallyCurrent` already succeeded (optionally still compute freshness for metrics only). Pass eligibility `now` into `isOperatorTemporallyCurrent` in the same change so ordering is coherent under controlled clocks.

Do **not** rewrite `isAudienceFreshContent` globally for Today/Discover in that smallest Calendar fix unless product wants the same rule everywhere.

---

## Confirmations

| | |
| --- | --- |
| Code changed | **no** |
| Data changed | **no** |
| Projection / re-ingest | **not run** |
| Temporal day-key logic changed | **no** (explicitly not reopened) |
| Frontend filtering | not inspected |

---

## Out of scope

1. Fixing `isOperatorTemporallyCurrent` to receive eligibility `now` (wiring inconsistency noted above).  
2. Today / Discover ranking and soft freshness boosts.  
3. Whether Woman of Influence late on event day can still trip the 24h start rule.  
4. Re-tuning the global 60-day discovery age for non-Calendar surfaces.  
5. Ingest / `content_items` mutation.
