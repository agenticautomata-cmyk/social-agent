# Ask Benson event-page classification + operator correction authority (2026-08-15)

Scoped Ask Benson intake fix only. Calendar projection, Discover scoring, newsletter extraction, and restaurant discovery generally were not changed.

Live URL: `https://www.pandafests.com/events-1/project-one-ephnc-fphyr-ark8l-wfdxg-g558l-tjkap-ap5a4-y5jrj`

## Original wrong route / root cause

1. **Wrong page class.** `isEventListingSourcePage()` only treated `/events/` or `/calendar/` (slash or end). `/events-1/slug` did not match. `isDirectEventListingUrl()` is Eventbrite-only. The official Panda Fest item page went through the **entity layer**.
2. **Topical food beat event evidence.** `inferOpportunityType()` matched `food` / restaurant before combined event signals. Result: `restaurant_food_discovery`, hook “Restaurant / food discovery”.
3. **Supported claims were quarantined, not missing.** Extracted dated/venue/ticket facts failed `missing_entity_match` because the entity first token (`KANSAS` from “KANSAS CITY — Panda Fest”) did not match extracted “Panda Fest”. Outcome: `ENTITY_ACCEPTED_CLAIMS_QUARANTINED`. Dates never reached event persist. Copy said nothing was added to Calendar.
4. **Operator correction was conversational only.** “Panda fest is an event” had no URL and was not a location follow-up. Ask Benson agreed in chat and left the durable restaurant row unchanged.

Before-fix durable row:

| Field | Value |
| --- | --- |
| id | `ca1355ed-f857-4f1e-a195-9be8e4794a22` |
| topic | KANSAS CITY — Panda Fest |
| source_external_id | `ask-benson-entity-pandafests-com-default` |
| type | `restaurant_food_discovery` |
| dates | null |
| outcome | `ENTITY_ACCEPTED_CLAIMS_QUARANTINED` |

## Corrected route

Official item pages with **≥3 event-signal families** (or event-item path + date + tickets/venue/lexicon) are an **official event occurrence**.

Families: `event_route`, `dated`, `hours`, `venue`, `tickets`, `lexicon`.

That authority:

- outranks topical food / restaurant / shopping labels
- skips the restaurant entity layer
- skips `missing_entity_match` for this official occurrence
- persists **one** dated occurrence from official page facts (not per-day splits, not Eventbrite title/URL)
- stores ticket vendor links in `metadata.ticketUrl` only
- does not invent a date when the official page has none
- does not convert a restaurant homepage that mentions one dinner into an event entity

Operator corrections (`X is an event`, `that is an event`, `this is not a restaurant`, `that’s a sale`, `that date is wrong`, `this is in Kansas City`) resolve against the active/recent entity when the referent is unambiguous, then re-run official-source intake on **that same URL**. Ambiguous referent → no inventory mutation.

## Durable IDs before / after

| Moment | id | type | dates | source |
| --- | --- | --- | --- | --- |
| Before (failed live run) | `ca1355ed-f857-4f1e-a195-9be8e4794a22` | restaurant_food_discovery | none | official Panda Fest page |
| After URL smoke | same | `festival_event` | 2026-10-09 → 2026-10-11 | official Panda Fest page |
| After “Panda fest is an event” | same | `festival_event` | 2026-10-09 → 2026-10-11 | official Panda Fest page |

**Duplicate avoided:** one Panda Fest / pandafests.com content row. Correction `updated` the same id (`created: 0`).

## Persisted official facts

- Title: KANSAS CITY — Panda Fest
- Type: event (`festival_event`), category/theme: Festival (food is theme, not restaurant entity)
- Start: 2026-10-09
- End: 2026-10-11
- Venue: Legends Field
- Location: Kansas City, KS
- Source: official Panda Fest page
- Ticket URL: Eventbrite ticket link in metadata
- Verification: official-source occurrence (`officialEventOccurrence: true`, `qualificationOutcome: OFFICIAL_EVENT_ACCEPTED`)
- Hook: Festival event (restaurant hook superseded)

## Calendar

Existing eligibility (`evaluateInventoryCalendarEligibility`) returns **ok: true**.

No `creator_calendar_items` row was created for this id. Not auto-selected. Not added to Weekend List.

## Correction semantics (live)

Same conversation, operator: “Panda fest is an event”

- Resolved “Panda fest” to the immediately prior official URL / id
- Re-read official source (no web research)
- Same logical entity updated
- Answer: corrected to an event, not a restaurant; Calendar suggestion only

No conversation / no unambiguous referent (“that is an event”): **no durable mutation**. Copy asks the operator to name the item or paste the URL.

## Regressions covered

1. Official KC Panda Fest page → EVENT, Oct 9–11, Legends Field, Calendar-eligible suggestion.
2. Immediate “Panda fest is an event” → same id, no duplicate.
3. Genuine restaurant page → still `restaurant_food_discovery` (unit).
4. Restaurant homepage + one dinner mention → remains restaurant entity (unit).
5. Food festival → event with festival category, not restaurant (unit + live).
6. Event page without a current date → no invented occurrence (unit).
7. Ambiguous taxonomy correction → no random inventory mutation (live).

No Panda Fest title allowlist. Authority is signal families + official page facts.

## Health + fingerprints

| Check | Result |
| --- | --- |
| API `/health` | 200 |
| Dashboard `/` | 200 |
| Ask Benson conversations | 200 |
| Home API | 200 |
| Workers | running (`pnpm --filter @social-agent/workers benson`) |
| Fingerprints | **MATCH** `4c9c7ae8256614ce` (source = api = dashboard = workers) |

Web research attempted on the official URL and correction smokes: **0**.
