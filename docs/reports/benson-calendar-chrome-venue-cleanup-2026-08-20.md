# Calendar cleanup: listing_chrome and venue_as_title

Date: 2026-08-20  
Code: **not changed**. Full projection: **not run**. Re-ingest: **not run**.

Source of truth: exported Calendar eligibility guards used by `evaluateInventoryCalendarEligibility`:

- `isListingChromeContainerChildTitle` when `metadata.containerChild === true`
- `isVenueAsTitleContainerChild`

Full `evaluateInventoryCalendarEligibility` was also run for reporting. Temporal checks can fire **before** those details (the Ticketmaster chrome row is already `not_temporally_current`). Cleanup still uses the two quality guards so a past chrome row is not left active.

Existing cancel path: `updateCalendarItem({ planningStatus: 'cancelled' })` — same suggested/tentative cancel as parent-article repair. **No dismissal fingerprints** (those write only on `dismissed`). Content rows were not deleted or restamped.

---

## Frozen (untouched)

T-Mobile, Downtown OP, Family Shows, OPCC, HPNA, CommUNITY Fest, Neighborhoods `546d8013`, confirmed/operator/user-edited rows, Discover / Today / Alexa / ranking.

---

## Before mutation

Active Calendar rows examined (suggested / tentative / confirmed, `source_record_type = content_item`): **785**.

| Guard | Active hits | Actionable (suggested/tentative, not frozen/operator) | Skipped confirmed/operator/user-edited |
| --- | --- | --- | --- |
| `listing_chrome` | **1** | **1** | 0 |
| `venue_as_title` | **0** | **0** | 0 |

### listing_chrome (1)

| Calendar id | Title | Source | Status |
| --- | --- | --- | --- |
| `1b17dfb6-d5c2-466e-95e0-02136371f472` | in calendar view Concerts Happening This Week Today | `[Benson] J. Cole Tickets, 2026 Concert Tour Dates \| Ticketmaster` `8784ee04-de9c-4a27-9cb9-63d4e20bed51` | suggested |

Content `f7a8d1c6-b7dd-43d6-af4f-2c09fdc84b4e`, `containerChild=true`. Guard matches. Full eligibility at 2026-08-20T01:33Z: `{ ok: false, detail: 'not_temporally_current' }` (`startAt` `2026-08-20T01:00:00.000Z`). **Not** the T-Mobile source.

### venue_as_title (0)

The generic guard did **not** fire on any active Calendar-linked content.

Bowline Brothers (`7fb75a94-1f95-4e5a-9b41-2cc012a3ea80`) still has **53** suggested Calendar rows titled like Tin Roof Delray Beach / Fort Lauderdale / Indianapolis / Limitless Brewing. Those titles are venue names, but current content has **empty** `venue`, `locationName`, and `businessName`. `isVenueAsTitleContainerChild` requires title ≡ a place key. **Not cancelled** (would be manual classification). Example: content `5389af35` topic `Tin Roof Delray Beach`, all place fields null, eligibility `ok: true`.

---

## Mutation

Cancelled **1** row via `updateCalendarItem`:

| id | Detail | New status |
| --- | --- | --- |
| `1b17dfb6-d5c2-466e-95e0-02136371f472` | listing_chrome | `cancelled` |

Content `f7a8d1c6` still exists with the same topic. venue_as_title cancelled: **0**. Sources affected: **1** (J. Cole Ticketmaster). Skipped confirmed/operator: **0**.

---

## After

| Check | Result |
| --- | --- |
| Active listing_chrome | **0** |
| Active venue_as_title | **0** |
| Confirmed/operator changed | **0** |
| T-Mobile Calendar fingerprint (id/status/updatedAt/startAt) | **unchanged** (31 active) |
| Downtown OP Trick-or-Treat `34818bfe` | still **suggested**, `2026-10-24T19:00:00.000Z`, `updatedAt` 2026-08-19T16:47:54Z |
| Family Shows active children | **16**, timestamps unchanged |
| Parent titles Downtown OP / Family Shows / Parkville | still **cancelled** only |
| Neighborhoods `546d8013` | still **confirmed**, `updatedAt` 2026-08-15T02:44:03.711Z |
| Bowline suggested rows | **53** still active (guard did not apply) |

No code changes.

---

## Follow-up (not this task)

To cancel Bowline venue-titled children under the same guard, content would need a recovered venue/location equal to the title (or the guard would need to change). This pass did not invent that.
