# OPCC visible Time precedence fix

Date: 2026-08-21

**CODE-ONLY. Live data unchanged. No projection. No re-ingest.**  
Historical OPCC row repair explicitly **out of scope**.

---

## Proven root cause

OPCC Modern Events Calendar detail pages publish the intended local wall clock in:

```html
<div class="mec-single-event-time">
  <h3 class="mec-time">Time</h3>
  <dl><dd><abbr class="mec-events-abbr">8:00 am - 4:30 pm</abbr></dd></dl>
</div>
```

The same pages (and listing-card Event JSON-LD) publish systematically earlier clocks with a plausible `-05:00` offset, e.g. `2026-08-21T03:00:00-05:00` while HTML says **8:00 am**. Absolute ISO interpretation still yields early Chicago morning. The prior parser correctly followed JSON-LD and therefore stored the wrong wall clocks.

This is **not** a generic UTC/`splitDateTime` bug.

---

## Exact HTML Time structure used

| Field | Selector / pattern |
| --- | --- |
| Block | `div.mec-single-event-time` |
| Label | `h3.mec-time` → `Time` |
| Value | `abbr.mec-events-abbr` text (`8:00 am - 4:30 pm` or start-only `5:00 pm`) |
| Fallback | Flattened text `Time 8:00 am - 4:30 pm` (for pipeline text-only paths) |

Unrelated chrome (`Admin Office Hours M-F 8:00am - 5:00pm`) is ignored because it is outside the MEC Time block / labeled Time match.

---

## Files changed

| File | Change |
| --- | --- |
| `services/core/src/ask-benson/opcc-visible-time.ts` | **new** — OPCC detail URL gate, MEC Time parse, overlay |
| `services/core/src/ask-benson/opcc-visible-time.test.ts` | **new** — 6 audited cases + controls |
| `services/core/src/ask-benson/scrape-listing.ts` | Apply overlay on OPCC detail listing URL and after detail enrichment |
| `services/core/src/ask-benson/collect-from-link.ts` | Apply overlay after JSON-LD merge when page is OPCC detail |

**Not changed:** `jsonld-events.ts` / `splitDateTime`, date-only/allDay logic, non-OPCC sources, generic timezone helpers (reused `normalizeListingClock` / `isTrustworthyListingClock` / `sanitizeEventEndInstant` only).

---

## Evidence-priority logic (before → after)

**Before**

1. JSON-LD Event `startDate`/`endDate` → wall digits → `startTime` / composed dates  
2. (Optional) listing-showtime overlay — still prefers detail JSON-LD clocks for OPCC  

**After (OPCC event detail URLs only)**

1. Same JSON-LD identity + calendar **date** extraction  
2. If `.mec-single-event-time` (or labeled `Time …`) yields a trustworthy local clock → **override time-of-day only**  
3. Persist path still runs `parseEventDate` + `sanitizeEventEndInstant`  

Gate: `isOpccEventDetailUrl` (`opconventioncenter.com/events/<slug>/`, not `/events` archive).

---

## Confirmation: no +5-hour arithmetic

Overlay parses the visible AM/PM string into `HH:MM:SS` via `normalizeListingClock`. There is no `+5`, offset delta, or event-name special case. A regression uses visible `9:15 am` against JSON-LD `03:00` to prove literal parse, not a fixed shift.

---

## Start / end / missing behavior

| Visible HTML | Behavior |
| --- | --- |
| Start + end range | Override `startTime`, `eventDate`, and `eventEndDate` on the existing event date |
| Start only | Override start only; keep prior `eventEndDate` (do not invent end) |
| No usable Time | Leave JSON-LD clocks unchanged |
| Visible end &lt; start | Apply start only; do not invent overnight end |
| Date-only (no Time block) | Remains date-only |

After compose, persistence still uses `sanitizeEventEndInstant` (`end == null` OR `end >= start`).

---

## Tests

```
pnpm exec tsx --test \
  src/ask-benson/opcc-visible-time.test.ts \
  src/ask-benson/jsonld-events.test.ts \
  src/ask-benson/listing-showtime.test.ts
```

| Suite | Result |
| --- | --- |
| `opcc-visible-time.test.ts` | **pass** (all cases + controls) |
| `jsonld-events.test.ts` | **pass** (generic JSON-LD / end sanitizer unchanged) |
| `listing-showtime.test.ts` | **pass** (non-OPCC showtime path unchanged) |
| Totals | **32 pass / 0 fail** |

---

## Live dry-run (no persist)

Corrected parser on live detail HTML for the six audited content rows:

| Event | Human Time | JSON-LD | Corrected local | Corrected UTC | Persisted UTC (unchanged) | end ≥ start |
| --- | --- | --- | --- | --- | --- | --- |
| Inspiring Women | 8:00 am – 4:30 pm | 03:00 / 11:30 `-05:00` | 8:00 AM – 4:30 PM | `13:00Z` – `21:30Z` | `08:00Z` – `16:30Z` | yes |
| Midwest Ability | 10:00 am – 4:00 pm | 05:00 / 11:00 | 10:00 AM – 4:00 PM | `15:00Z` – `21:00Z` | `10:00Z` – `16:00Z` | yes |
| Blue Valley Breakfast | 7:00 am – 9:00 am | 02:00 / 04:00 | 7:00 AM – 9:00 AM | `12:00Z` – `14:00Z` | `07:00Z` – `09:00Z` | yes |
| India Fest | 11:00 am – 6:00 pm | 06:00 / 13:00 | 11:00 AM – 6:00 PM | `16:00Z` – `23:00Z` | `11:00Z` – `18:00Z` | yes |
| Trinity Gala | 5:00 pm (start only) | 12:00 / date-only end | **5:00 PM**, end not invented | `22:00Z` / end null via sanitizer on date-only | `17:00Z` / null | yes |
| MVP Law | 8:00 am – 4:00 pm | 03:00 / 11:00 | 8:00 AM – 4:00 PM | `13:00Z` – `21:00Z` | `08:00Z` – `16:00Z` | yes |

---

## Confirmations

| Check | Status |
| --- | --- |
| No +5-hour hardcode | **yes** |
| No event-name exceptions | **yes** |
| No generic JSON-LD / `splitDateTime` change | **yes** |
| Non-OPCC behavior unchanged (control 8 + listing-showtime suite) | **yes** |
| End sanitizer still used | **yes** |
| Live data changed | **no** |
| Projection / re-ingest | **not run** |
| Historical OPCC row repair | **left out of scope** |

---

## Out of scope

- Mutating persisted OPCC `content_items` / Calendar starts (separate bounded repair task)  
- Reopening inverted-end repair or date-only/allDay semantics  
- Fixing OPCC’s upstream JSON-LD CMS bug  
- Listing-card clock inference (cards remain date-primary; detail enrichment applies overlay)

---

## Summary

OPCC detail pages now prefer Modern Events Calendar **visible Time** over conflicting JSON-LD wall clocks, scoped strictly to `opconventioncenter.com/events/<slug>` detail URLs. Parser dry-run matches the six audited human clocks; stored rows remain early until a follow-up repair.
