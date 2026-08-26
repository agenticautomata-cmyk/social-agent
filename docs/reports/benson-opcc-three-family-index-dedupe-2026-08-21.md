# OPCC three-family listing-index duplicate cleanup

Date: 2026-08-21 (operator timezone America/Chicago)

**DATA-ONLY.** Code unchanged. Calendar projection **not run**. OPCC re-ingest **not run**. No dismissal fingerprints. No additional OPCC families inspected.

Related: [benson-listing-child-stable-identity-fix-2026-08-21.md](./benson-listing-child-stable-identity-fix-2026-08-21.md)

---

## Source

| | |
| --- | --- |
| Name | Events Archive - Overland Park Convention Center |
| `sourceId` | `6ce4341e-5203-46d8-9ed9-0f6e7af25339` |

Inspection was limited to the **13 named content ids** plus Calendar/FK rows that point at those ids.

---

## Exact three families / all 13 input ids

### Family 1 — Inspiring Women in Public Administration Conference 2026

| Role | content id |
| --- | --- |
| Preferred keeper (designated) | `1695ee52-8ca5-4cc3-8ec2-417d77fcbbf6` |
| Legacy index clone `-7-` | `91a48eb4-ee7a-44c7-9727-9ba2ef51d6c0` |
| Legacy index clone `-1-` | `b14a7c17-8d51-487a-a3ae-0d68e7eeca37` |
| Legacy index clone `-3-` | `537624be-771e-4b58-86d8-e7800a1ba18e` |
| Legacy index clone `-5-` | `0e7485a8-4a70-41bd-ba15-7650dfabe3eb` |

### Family 2 — The Calling: Kansas City (Flesh and Blood World Tour)

| Role | content id |
| --- | --- |
| Index `-11-` | `e3fd2608-46ed-4ca0-8e98-db1197381bc6` |
| Index `-9-` | `4b554758-4bc0-4db5-aaf7-0687c277c1b0` |
| Index `-7-` | `18b99a0f-0069-4d0f-b5e6-89e6a4263b72` |
| Index `-6-` | `9a9dd2df-d2f1-4177-bc85-1977c9a93c0e` |

### Family 3 — Forever the Free State: Johnson County Democratic Banquet 2026

| Role | content id |
| --- | --- |
| Index `-0-` | `103a6fa2-732e-4084-94d7-a5933dfd13fd` |
| Index `-4-` | `81cb4154-b8e7-481f-bf51-981d5c91190b` |
| Index `-6-` | `74de0ef8-c1c1-40d7-a970-b04a60905dec` |
| Index `-2-` | `5dd40bda-d03a-4e24-8800-0e3a00ed86e4` |

---

## Pre-mutation safety (these 13 only)

All 13 still existed, `sourceId` = OPCC, `state=planned`. Interest / research / skip / planner / assets / publications / inventory evidence / URL-intake audit / curator-lead links: **0**. Dismissal feedback on these ids: **0**.

Direct Calendar links (`source_record_type=content_item` and `/discoveries/{id}`): **3**, all Benson-managed suggestions, none protected.

| Calendar id | content id | Family | `planningStatus` | `startAt` | `allDay` | `userEditedAt` | `createdBy` | Protected? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `bde29613-7f1f-4dec-8e09-32044cce80b1` | `1695ee52-…` | Inspiring Women keeper | suggested | `2026-08-21T13:00:00Z` | false | null | `benson_inventory` / `scrape_listing` | **no** |
| `d7037054-6a5c-4270-9bad-34529a933c95` | `b14a7c17-…` | Inspiring Women clone `-1-` | suggested | `2026-08-21T00:00:00Z` | true | null | `benson_inventory` / `scrape_listing` | **no** |
| `edb8cf15-1646-445e-8800-34d016243004` | `e3fd2608-…` | The Calling `-11-` | suggested | `2026-08-28T00:00:00Z` | true | null | `benson_inventory` / `scrape_listing` | **no** |

No confirmed / published / operator-owned / user-edited Calendar on these ids.

---

## Keeper-selection evidence

### Family 1 — Inspiring Women — keeper `1695ee52-8ca5-4cc3-8ec2-417d77fcbbf6`

Designated by the identity-fix report. Pre-mutation confirmation:

| Signal | Keeper | Four clones |
| --- | --- | --- |
| `sourceExternalId` | occurrence id (no index) | `-1-` `-3-` `-5-` `-7-` |
| `sourceUrl` | stable detail `…/events/inspiring-women-in-public-administration-conference-2026/` | hub + `#` fragments only |
| Temporal | `eventStartsAt=2026-08-21T13:00:00Z`, `eventEndsAt=2026-08-21T21:30:00Z`, extracted `08:00:00`–`16:30:00` | UTC midnight, no start/end clock |
| Calendar | timed suggested `bde29613-…` | one stale all-day suggestion on `-1-` clone |
| Venue label | `Overland Park Convention Center` | `Overland Park, KS` (extracted.venue still OPCC) |

Venue-label difference was **not** treated as a second occurrence.

### Family 2 — The Calling — keeper `e3fd2608-46ed-4ca0-8e98-db1197381bc6`

No designated keeper in the prior report. Applied the required precedence:

1. **Stable child detail URL** — all four are hub + `#` fragment. **Tie.**
2. **Non-index occurrence id** — all four are index ids (`-11-`, `-9-`, `-7-`, `-6-`). **Tie.**
3. **Richer temporal evidence** — all date-only `2026-08-28T00:00:00Z`, `startTime`/`endTime` null. **Tie.**
4. **Linked active Calendar** — **only** `e3fd2608-…` has Calendar `edb8cf15-…` (`suggested`, `benson_inventory`, not protected). **Wins.**
5. Provenance tie-breaker not needed.

**Not guessed.** Clocks on this keeper were **not** “corrected” (still midnight all-day). Temporal repair is out of scope.

### Family 3 — Forever the Free State — **SKIPPED**

| Criterion | Result |
| --- | --- |
| 1. Detail URL | All four are listing hub / hub+fragment. None is `/events/<slug>/`. Tie. |
| 2. Non-index id | All four are index ids (`-0-`, `-2-`, `-4-`, `-6-`). Tie. |
| 3. Temporal | All `2026-08-15T00:00:00Z`, no clocks. Tie. |
| 4. Calendar | **None** of the four. Tie. |
| 5. Provenance | Split: `103a6fa2-…` newest `lastSeenAt` (2026-08-19) and persisted `locationName=Overland Park Convention Center`; `5dd40bda-…` highest extract `confidence` (1.0) but older `lastSeenAt` (2026-08-03). |

**Ambiguous after the required checks. Cleanup stopped for this family.** All four rows remain byte-stable (`updatedAt` unchanged).

---

## Merge method (existing, not invented)

Same operational pattern as Eventbrite opportunity merge + Bowline UTC-day content delete + HPNA Calendar cancel:

1. `updateCalendarItem({ planningStatus: 'cancelled' })` for redundant **suggested** clone Calendar (fingerprint path runs only for `dismissed`).
2. Stamp keeper `metadata.mergedDuplicateIds` / `mergeReason` / `mergedAt` (Eventbrite/Bowline convention). **Do not copy clone midnight clocks onto the keeper.**
3. Reassign interest/research/skip FKs if present (0 rows).
4. `DELETE` retired `content_items` (Bowline / Eventbrite).

No new merge framework. No replacement Calendar rows. No `sourceExternalId` rewrite on keepers (Bowline: external ids not cosmetically migrated).

---

## Exact retired / merged ids

| Family | Keeper | Retired (deleted content) | Calendar |
| --- | --- | --- | --- |
| Inspiring Women | `1695ee52-8ca5-4cc3-8ec2-417d77fcbbf6` | `91a48eb4-…`, `b14a7c17-…`, `537624be-…`, `0e7485a8-…` | Cancelled `d7037054-…`; keeper Calendar `bde29613-…` left suggested |
| The Calling | `e3fd2608-46ed-4ca0-8e98-db1197381bc6` | `4b554758-…`, `18b99a0f-…`, `9a9dd2df-…` | Keeper Calendar `edb8cf15-…` left suggested; no clone Calendar to cancel |
| Forever the Free State | — | **none** | none |

---

## FK / Calendar handling

| Surface | Action |
| --- | --- |
| Interest / research / skip / planner / assets / publications / evidence / URL audit / curator leads | None present; reassign attempted then clones deleted |
| Inspiring Women clone Calendar `d7037054-…` | `planningStatus=cancelled` via existing `updateCalendarItem`. `dismissedAt` still null. Fingerprint string unchanged, **not** written to `calendar_dismissal_feedback` |
| Inspiring Women keeper Calendar `bde29613-…` | Untouched clocks (`13:00Z`–`21:30Z`), still `suggested`, `userEditedAt=null` |
| The Calling Calendar `edb8cf15-…` | Untouched (`00:00Z` all-day `suggested`) |
| Forever the Free State | No Calendar; no writes |

`updateCalendarItem` emitted the existing `calendar_change` data-revision event. That is **not** inventory Calendar projection / `ensureCalendarInventoryProjections`.

---

## Inspiring Women corrected temporal state preservation

| Field | Before | After |
| --- | --- | --- |
| `eventStartsAt` | `2026-08-21T13:00:00.000Z` | **same** |
| `eventEndsAt` | `2026-08-21T21:30:00.000Z` | **same** |
| extracted `startTime` / `eventDate` / `endTime` / `eventEndDate` | `08:00:00` / `…T08:00:00` / `16:30:00` / `…T16:30:00` | **not written** |
| Calendar `bde29613` `startAt`/`endAt` | `13:00Z` / `21:30Z` | **same** |
| `sourceExternalId` | occurrence id | **same** |
| `sourceUrl` | OPCC detail URL | **same** |

Clone midnight payloads were **not** merged onto the keeper. Only `metadata.mergedDuplicateIds` was added.

---

## Calendar before/after (these families only)

| Family | Active (`suggested`/`tentative`) before | Active after | Cancelled | Created |
| --- | ---: | ---: | ---: | ---: |
| Inspiring Women | 2 | **1** (`bde29613-…`) | 1 (`d7037054-…`) | 0 |
| The Calling | 1 | **1** (`edb8cf15-…`) | 0 | 0 |
| Forever the Free State | 0 | 0 | 0 | 0 |

**No duplicate active Calendar occurrence remains** for completed families.

The Calling keeper Calendar is still date-only midnight. Clock repair was **not** part of this task.

---

## Post-cleanup verify

### Inspiring Women — completed

- One content keeper: `1695ee52-8ca5-4cc3-8ec2-417d77fcbbf6`
- Legacy index clones: **gone** (4 deleted)
- Live identity: `scrape_listing-5cd63116244d6030-inspiring-women-in-public-administration-confere-2026-08-21-overland-park-convention-center`
- Active Calendar: **1** timed suggestion
- Protected state: none present; none overwritten
- Keeper temporal fields unchanged

### The Calling — completed

- One content keeper: `e3fd2608-46ed-4ca0-8e98-db1197381bc6`
- Legacy index clones `-9-` `-7-` `-6-`: **gone**
- Surviving live id still contains `-11-` (not cosmetically rewritten; forward code identity is already index-free)
- Logical collapse key (not written): `scrape_listing-5cd63116244d6030-the-calling-kansas-city-flesh-and-blood-world-to-2026-08-28-overland-park-ks`
- Active Calendar: **1**
- Clocks unchanged (`00:00Z`)

### Forever the Free State — skipped

All four ids still present with original `sourceExternalId` and original `updatedAt`.

---

## Confirmations

| Check | Result |
| --- | --- |
| Code changed | **No** |
| Full Calendar projection | **Not run** |
| OPCC / listing re-ingest | **Not run** |
| Dismissal fingerprints | **No** (`calendar_dismissal_feedback` on these ids 0 → 0; clone Calendar `dismissedAt` still null) |
| Protected / operator / user-edited Calendar overwritten | **No** (none existed on these ids; keeper Calendars remain `suggested` + `userEditedAt=null`) |
| Other OPCC duplicate families inspected | **No** |
| Unrelated content changed | **No** — only the two keepers received metadata stamps; 7 clones deleted; Family 3 `updatedAt` unchanged |
| Unrelated Calendar rows changed | **No writes** except cancel of `d7037054-…` (in-family clone). Keeper Calendars’ clocks/status unchanged |
| Same-day multi-showtime identity | Out of scope |
| Discover ranking / eligibility | Out of scope |
| Partnership / sponsor | Out of scope |
| The Calling / Free State clock repair | Out of scope |

---

## Out of scope (found, not acted on)

- The Calling surviving row still has an index token in `sourceExternalId` (`-11-`). Cosmetic rewrite to the new occurrence formula was not done (same as Bowline leftover-id policy).
- The Calling Calendar remains all-day UTC midnight. Visible-time repair is a separate historical task if a real OPCC detail clock exists.
- Forever the Free State still has four live index clones. Needs a later keeper decision (or a real detail URL) before merge.
- “Events Archive” parent chrome index dupes on this source were **not** inspected.
- Discover still may show other OPCC listing chrome; ranking was not touched.
- Cancelled Calendar `d7037054-…` still points `sourceRecordId` at the deleted clone id (no FK). Harmless; not relinked.
