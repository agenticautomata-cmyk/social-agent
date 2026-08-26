# CommUNITY Fest Calendar investigation — prior audit overturned

Date: 2026-08-20  
Calendar id: `8185be73-01d0-458b-9c4b-7592f357d137`  
sourceRecordId: `00f95609-5077-4410-ae54-a52f439c83b8`

**No code changes. No Calendar mutation. No other sources touched.**

---

## Verdict

**The prior created-94 audit classification was wrong.**

This is **A**: a genuine single-event page whose real event name is CommUNITY Fest.  
It is **not** **B**: a parent/listing/article wrapper that should have been blocked as parent-as-event.

Heuristic that misled the audit: `containerChild` unset **and** Calendar title equals document/source title. On a dedicated single-event URL, that pattern is **expected** — the page *is* the event.

---

## Live source evidence

| Field | Value |
| --- | --- |
| Source URL | `https://unitedwaygkc.org/event/community-fest-2026/` |
| HTTP | 200 |
| Document / `<title>` | `2026 CommUNITY Fest Presented by G.E.H.A - United Way of Greater Kansas City` |
| `og:title` | same as document title |
| Page H1 | `Events Calendar` (site chrome; not the event identity) |
| JSON-LD `@type: Event` count | **1** |
| JSON-LD event `name` | `2026 CommUNITY Fest Presented by G.E.H.A` |
| JSON-LD `startDate` | `2026-11-06T08:00:00-06:00` |
| JSON-LD `endDate` | `2026-11-06T14:00:00-06:00` |
| JSON-LD location | `Memorial Hall` |

Path shape: `/event/community-fest-2026/` — single-event item path, not a listing index (`/events`).

---

## Persisted content item

| Field | Value |
| --- | --- |
| `topic` / Calendar title | `2026 CommUNITY Fest Presented by G.E.H.A - United Way of Greater Kansas City` |
| `eventStartsAt` | `2026-11-06T14:00:00.000Z` (= 08:00 CT, matches JSON-LD start) |
| `eventEndsAt` | `2026-11-06T00:00:00.000Z` (stale/odd end; out of scope for this investigation) |
| `locationName` | `Kansas City` |
| `listingScrape.businessName` | `Memorial Hall` |
| `listingScrape.documentTitle` | same as page title |
| tags | `jsonld_event` |
| `metadata.editorialContainer` | unset |
| `metadata.containerChild` | unset |
| `metadata.parentRepresentsSingleEvent` | unset |
| `metadata.calendarEligible` | `true` |
| ingest | `scrape_listing` |

Calendar title equals page headline **and** equals the JSON-LD event name plus the org suffix (` - United Way of Greater Kansas City`). That is the actual festival identity, not a roundup wrapper title.

---

## Classifier / eligibility (current code)

With live HTML:

| Check | Result |
| --- | --- |
| `looksLikeEditorialContainerTitle` | false |
| `classifyEditorialContainer.isContainer` | **false** |
| `classifyEditorialContainer.parentRepresentsSingleEvent` | **true** |
| `classifyEditorialContainer.jsonLdEventCount` | **1** (when raw HTML is passed) |
| `isCalendarParentContainerItem` | **false** |
| `evaluateInventoryCalendarEligibility` | **`ok: true`** |

No misclassification branch to fix. Parent-container guards correctly treat this as a single event.

---

## Related content / Calendar duplicates

Three `content_items` refer to the same festival URL/day:

| content id | topic | start | location |
| --- | --- | --- | --- |
| `00f95609-…` (Calendar-linked) | full page title w/ org | Nov 6 14:00Z | Kansas City |
| `3bf02975-…` | `2026 CommUNITY Fest Presented by G.E.H.A` (JSON-LD-clean name) | Nov 6 14:00Z | United Way of Greater Kansas City |
| `cb93d297-…` | `CommUNITY Fest` | Nov 6 00:00Z | Memorial Hall |

**Calendar:** only **one** active suggestion for this event — the audited row `8185be73-…`.  
No second Calendar row to reconcile to. No duplicate Calendar occurrence.

Content-level multiplicity is noted but **out of scope** (do not delete content; do not broaden into dedupe work).

---

## Calendar action taken

**None.** Row left as `suggested`.

Cancelling would remove a legitimate KC festival suggestion. Prior audit’s “clearly incorrect / parent-as-event” label does not hold against live source evidence.

---

## Scope freeze confirmed

No changes to: Bowline, T-Mobile, Downtown OP, Family Shows, OPCC/HPNA, geography eligibility, listing_chrome / venue_as_title, Alexa / Discover / Today / ranking, full projection, Neighborhoods confirmed row.  
**Files changed:** none. **Tests:** none (no code change required).
