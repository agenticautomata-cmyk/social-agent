# Calendar inventory `stale_freshness` hard-gate fix

Date: 2026-08-20  
Scope: Calendar inventory eligibility only — stop audience freshness from hard-rejecting temporally valid dated events; wire controlled `now` into temporal authority  
Prior audit: [benson-calendar-stale-freshness-audit-2026-08-20.md](./benson-calendar-stale-freshness-audit-2026-08-20.md)

**Data changed: no. Projection / re-ingest: not run. Today / Discover / ranking: untouched. `isAudienceFreshContent` global semantics: unchanged. Temporal day-key logic: unchanged.**

---

## Proven root cause

`evaluateInventoryCalendarEligibility` called `isAudienceFreshContent` as a **hard reject** after temporal currentness. That helper is general audience-content freshness (discovery age, start>24h, etc.) and ignores multi-day `eventEndDate`.

Result: events still `current` / `upcoming` under `evaluateTemporalState` were dropped with `detail = stale_freshness` (Just Between Friends mid/final days; KHA final day; early-discovered Kurt Vile near showtime).

Separately, `isOperatorTemporallyCurrent` was invoked **without** eligibility’s `now`, so temporal authority could disagree with freshness/`past_event` under controlled clocks.

---

## Exact files changed

| File | Change |
| --- | --- |
| `services/core/src/creator-calendar/population/eligibility.ts` | Pass `now` into `isOperatorTemporallyCurrent`; remove hard `stale_freshness` gate; drop unused `isAudienceFreshContent` import |
| `services/core/src/creator-calendar/population/eligibility.test.ts` | Multi-day / early-discover / controlled-now / historical regressions |
| `docs/reports/benson-calendar-stale-freshness-fix-2026-08-20.md` | This report |

**Not changed:** `content-freshness.ts`, Today/Discover, day-key helpers, frontend, storage.

---

## Eligibility ordering before / after

**Before**

1. `eventDate` required  
2. lifecycle / creator-value  
3. `isOperatorTemporallyCurrent(...)` — **wall clock**  
4. `isAudienceFreshContent(item, now)` → **`stale_freshness` hard reject**  
5. `past_event`  
6. identity / geography / …

**After**

1. `eventDate` required  
2. lifecycle / creator-value  
3. `isOperatorTemporallyCurrent({ …, now })` — **same controlled clock**  
4. ~~audience freshness hard reject~~ **removed**  
5. `past_event`  
6. identity / geography / …

---

## How controlled `now` was wired into temporal authority

```ts
if (!isOperatorTemporallyCurrent({
  startsAt: item.eventDate,
  endsAt: item.eventEndDate,
  summaryText: item.summaryRaw ?? item.summary,
  now,
})) {
  return { ok: false, reason: 'expired', detail: 'not_temporally_current' };
}
```

`past_event` already used the same `now`. Temporal, day-key, and simulations now share one clock.

---

## Exact Calendar freshness policy after the fix

For Calendar inventory items (which already require `eventDate`):

- **Event temporal state is authoritative** for actionability (upcoming/current vs expired).  
- **Audience freshness must not hard-reject** a temporally valid Calendar candidate.  
- Discovery/content age may still inform ranking/metrics on other surfaces via unchanged `isAudienceFreshContent`.  
- Expired events still fail `not_temporally_current` (and/or `past_event`).

No new Calendar-specific age windows were added.

---

## Confirmation: `isAudienceFreshContent` global semantics unchanged

- `services/core/src/inventory/content-freshness.ts` **not modified**.  
- `content-freshness.test.ts` remains green.  
- Live verify still shows `isAudienceFreshContent(...) === false` on JBF Sep 3 / Kurt Oct 10 while Calendar eligibility is **ok**.

---

## Tests run

```bash
cd services/core && node --import tsx --test \
  src/creator-calendar/population/eligibility.test.ts \
  src/creator-calendar/population/inventory-temporal-evidence.test.ts
# + content-freshness.test.ts for global unchanged proof
```

| Suite | Result |
| --- | --- |
| eligibility + temporal-evidence | **55 pass / 0 fail** |
| content-freshness (global unchanged) | **6 pass / 0 fail** |

---

## Bounded controlled-NOW before / after

Read-only production-shaped load. No writes.

| Row | NOW | Before (audit) | After |
| --- | --- | --- | --- |
| Just Between Friends | Sep 3 | `stale_freshness` (temporal current) | **ok** (`audienceFresh` still false) |
| Just Between Friends | Sep 6 | `stale_freshness` | **ok** |
| Just Between Friends | Sep 7 | freshness/temporal mix | **`not_temporally_current`** |
| KHA Convention | Sep 11 | `stale_freshness` | **ok** |
| KHA Convention | Sep 12 | expired | **`not_temporally_current`** |
| Woman of Influence | Aug 28 | ok | **ok** |
| Kurt Vile | Oct 10 | `stale_freshness` (age 73) | **ok** (`audienceFresh` still false) |
| Va Bene (historical) | Aug 20 | temporal reject | **`not_temporally_current`** |
| Hillcrest (fresh future) | Aug 20 | ok | **ok** |

### Proofs required by the task

- Multi-day start/middle/final day survive (JBF Sep 2–6; KHA Sep 11).  
- Early-discovered future survives (Kurt Oct 10).  
- Expired still expires temporally (Va Bene; JBF Sep 7; KHA Sep 12).  
- `stale_freshness` no longer appears as Calendar eligibility detail for these temporally valid cases.

---

## Confirmations

| Check | Status |
| --- | --- |
| Data changed | **no** |
| Projection / re-ingest | **not run** |
| Today / Discover / ranking | **untouched** |
| Global `isAudienceFreshContent` | **unchanged** |
| Temporal day-key behavior | **unchanged** |

---

## Out of scope

1. Soft use of audience freshness for Calendar ranking/scoring (hard gate only removed).  
2. Whether Discover/Today should adopt the same dated-event exception.  
3. Re-tuning global 24h / 60-day freshness thresholds.  
4. Frontend Calendar past filters.
