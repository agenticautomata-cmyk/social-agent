# Calendar quality guards: listing chrome and venue-as-title

Date: 2026-08-19  
Scope: two deterministic Calendar-quality failures from the created-94 audit.  
Code change only. **Projection was not re-run. The 94 Calendar rows were not cleaned up.**

Related audit: `docs/reports/benson-calendar-created-94-audit-2026-08-19.md`

---

## What this pass did

Calendar eligibility now rejects two classes of `containerChild` inventory that previously could project:

1. **Listing chrome as an event title** — page/navigation copy scraped as a dated child.
2. **Venue-as-title tour children** — listing children whose title is only the venue/location name, with no recovered show/event name.

Both gates live in `evaluateInventoryCalendarEligibility`. They do not change extraction, hub persistence, Ask Benson ids, Alexa, Discover, Today, ranking, Cloudflare/AWS, same-day showtime identity, Downtown OP extraction, or the confirmed Neighborhoods row.

---

## Frozen surfaces (untouched)

| Surface | Status |
| --- | --- |
| `classifyEditorialContainer` | not edited |
| container-event-block segmentation / Downtown OP extraction | not edited |
| shared-hub persistence / title+day+venue identity | not edited |
| Ask Benson external ids | not edited |
| Alexa | not edited |
| Discover / Today / ranking | not edited |
| Cloudflare / AWS | not restarted, not edited |
| Neighborhoods `546d8013-26e2-4a25-a0dc-07eaba51c501` | not mutated |
| same-day showtime collapse | not edited |
| 2026–2027 projection | not re-run |
| live 94 Calendar rows | not cancelled / not updated |

---

## Files changed

| File | Change |
| --- | --- |
| `services/core/src/creator-calendar/population/eligibility.ts` | Two helpers + two exclusion branches in `evaluateInventoryCalendarEligibility` |
| `services/core/src/creator-calendar/population/eligibility.test.ts` | New suite: 6 focused quality-guard cases |

No persist, extract, classifier, or Downtown OP / Family Shows extraction fixtures were modified.

---

## Exact guards

Insertion point: after `isCalendarParentContainerItem` (`editorial_container`), before national-SEO / civic-meeting filters.

```ts
if (item.metadata?.containerChild === true && isListingChromeContainerChildTitle(item.title)) {
  return { ok: false, reason: 'excluded', detail: 'listing_chrome' };
}
if (isVenueAsTitleContainerChild(item)) {
  return { ok: false, reason: 'excluded', detail: 'venue_as_title' };
}
```

Existing metro/out-of-market eligibility is unchanged and still runs later in the same function.

---

### Guard 1 — listing chrome (`listing_chrome`)

**Applies only when** `metadata.containerChild === true`.

**Does not** hardcode the live bad title  
`in calendar view Concerts Happening This Week Today`.

**Phrase regex** (`LISTING_CHROME_PHRASE_RE`):

| Pattern | Intent |
| --- | --- |
| `(in )? (calendar\|list\|grid) view` | listing view chrome |
| `(concerts\|events\|shows) happening this (week\|weekend\|month)` | listing section headers |
| `view (event\|tickets\|calendar)` | CTA chrome |
| `(next\|previous) (week\|month\|page\|event\|events)` | pagination chrome |

**Nav-cluster rule:** two or more standalone tokens among `today` / `next` / `previous` (e.g. listing pager copy). A **single** `Today` in an otherwise real title is not enough.

Empty titles are not treated as chrome.

**Why Calendar previously accepted the live row:** `inventoryEventIdentity` is true when `venue` is ≥3 characters, and the chrome title also contains `Concerts`. Venue presence plus concert wording was enough to pass event identity.

---

### Guard 2 — venue-as-title (`venue_as_title`)

**Applies only when** `metadata.containerChild === true`.

**Does not** globally reject venue-named events (non-children are skipped inside `isVenueAsTitleContainerChild`).

Normalization (`listingTitleKey`): lowercase, `&` → `and`, non-alphanumerics collapsed to spaces, trim. Optional leading `at ` is stripped on title and place keys.

A child is ineligible when the normalized title equals any comparable place key:

| Field | Used as place key? |
| --- | --- |
| `venue` | yes, if key length ≥ 3 |
| `businessName` | yes, if key length ≥ 3 |
| `locationName` | yes only if key length ≥ 3 **and** `isKcMetroLocation(locationName)` is false |

KC metro-only `locationName` (e.g. `Kansas City, MO`) is **not** treated as a venue identity, so this is not a new geography system. Existing `wrong_city` / `isCalendarKcRelevant` logic is left as-is.

**Why Calendar previously accepted Bowline children:** event identity is true whenever a venue string is present, even if the title *is* that venue.

---

## Audit examples these guards target

From the created-94 audit (rows **not** deleted in this pass):

| Issue | Example | Next projection behavior |
| --- | --- | --- |
| Listing chrome | Calendar `1b17dfb6` / content `f7a8d1c6-…`, title `in calendar view Concerts Happening This Week Today` | new/updated projection would hit `listing_chrome` if still a `containerChild` |
| Venue-as-title | Bowline source `7fb75a94-…`: Tin Roof Delray Beach, Tin Roof Fort Lauderdale, Tin Roof Indianapolis, Limitless Brewing, etc. | `venue_as_title` when title equals venue/location; many would also still fail `wrong_city` |

This pass does **not** address other audit failures: T-Mobile midnight dump (31), CommUNITY Fest parent-as-event, UTC midnight/all-day OPCC/HPNA rows.

---

## Tests

Command:

```bash
node --import tsx --test src/creator-calendar/population/eligibility.test.ts
```

Working directory: `services/core`.

**Result: 29 passed / 0 failed** (4 suites, ~5.5s).

### New suite: `container-child calendar quality guards` (6)

| # | Case | Expected |
| --- | --- | --- |
| 1 | Listing chrome child (`in calendar view Concerts Happening This Week Today` at T-Mobile Center) | `ok: false`, `detail: listing_chrome` |
| 2 | Real title that contains `Today` (`Today Show Live at Crown Center`) | `ok: true` |
| 3 | Venue-as-title child (`The Truman` / venue `The Truman`, in-market so not conflated with `wrong_city`) | `ok: false`, `detail: venue_as_title` |
| 4 | Distinct event title vs venue (`Bowline Brothers Live` at `The Truman`) | `ok: true` |
| 5 | Downtown OP child (`Harvesting Hope`, hub `/events` URL, no venue) | `ok: true` |
| 6 | Family Shows child (`Garden Bros Nuclear Circus` at `Uptown Theater`) | `ok: true` |

### Existing Downtown OP eligibility cases (unchanged, still passing)

| Test | Result |
| --- | --- |
| dated hub-listing child sharing parent `/events` URL (Harvesting Hope) | pass |
| dated hub-listing child with no venue (Trick-or-Treat shape) | pass |
| parent hub + `calendarEligible: false` child still `editorial_container` | pass |

---

## Known-good Downtown OP / Family Shows fixtures

**No known-good extraction or persist fixtures were changed.**

| Fixture class | Changed? |
| --- | --- |
| `container-event-blocks` Downtown OP / Family Shows extracts | no |
| `container-child-persist` identity tests | no |
| existing Harvesting Hope / Trick-or-Treat eligibility tests | no (still pass) |
| new keep-cases in this file | added copies of the same eligibility shape; they pass |

Garden Bros / Harvesting Hope remain calendar-eligible under the new guards because titles differ from venue (or venue is null) and titles are not listing chrome.

---

## What a later cleanup / projection pass should still do

These guards only affect **future** `evaluateInventoryCalendarEligibility` decisions. Live Calendar suggestions created 2026-08-19T16:47–16:48Z remain until a dedicated cleanup or re-projection.

Recommended later (not this task):

1. Do not treat the 94-row create batch as clean.
2. Re-project or cancel chrome + venue-as-title rows after this code is deployed.
3. Leave Neighborhoods `546d8013` confirmed and untouched.
4. Do not use this pair of guards as a substitute for T-Mobile date-only / CommUNITY Fest parent work.
