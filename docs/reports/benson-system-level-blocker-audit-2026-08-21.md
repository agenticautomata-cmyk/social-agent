# Benson system-level blocker audit

Date: 2026-08-21 (operator timezone America/Chicago)

**READ-ONLY. No fixes. No data mutations. No email sent. No Calendar projection. No source-library re-ingest.**

Approximate runtime: **~12 minutes** (focused unit suites ~50s; bounded live queries + dry fetches ~20s; analysis/report).

---

## Executive verdict

Calendar **clock/day semantics for known-good timed and date-only controls are healthy enough to freeze.** Do **not** spend the next cycle on another source-specific Calendar audit.

The largest remaining blockers are **identity and routing in primary workflows**:

1. **Discover / listing ingest** promotes venue names and listing chrome as “events,” with listing `sourceExternalId` still indexed so the same OPCC child can exist 4+ times.
2. **Creator partnership / sponsor durable objects** are the wrong kind of thing (Instagram shortcodes, article headlines, email subjects). A partnership cannot progress coherently from discovery to action on live records.
3. **Discoveries@** still mostly skips, mis-labels retail as confirmation, or persists **zero occurrences** even when marked processed. Newsletter intelligence is on for some senders but is not the dominant live path.

No **S0** (corruption, unsafe send, overwrite of confirmed/user-edited Calendar) was observed in this pass.

---

## Severity-ranked blocker table

| Severity | Workflow | Failure | User impact | Reproducible? | Evidence | Recommended next task |
| --- | --- | --- | --- | --- | --- | --- |
| **S1** | I. Discover / Home | Discover cards are venue/listing titles, not events | Feed is unusable; “add to today” on “T-Mobile Center” / “Kansas City Convention Center” | Yes | `listOpenDiscoveries(12)`: 4/6 sampled titles are venue names; TicketSqueeze URLs | Fix listing-child identity for Discover eligibility; stop promoting hub/venue rows |
| **S1** | G/H. Listing identity / refresh | Same OPCC event stored under multiple `sourceExternalId`s that embed listing index (`-1-`, `-3-`, `-5-`, `-7-`) | Duplicate Calendar/content children; repairs hit one row, clones stay wrong | Yes | Inspiring Women: 5 content ids; only `1695ee52-…` has `13:00Z`; others still `00:00Z` | Change listing child external id to title+date+venue (no index); bounded dedupe |
| **S1** | C. Partnership | Live partnership entity is an Instagram shortcode / roundup title | “Qualified” partnerships are not brands; no follow-up; cannot pitch | Yes | Latest non-library partnership `brand_name=Dbtacojzn1r`, `pipeline_status=qualified`, `follow_up_at=null`. Next: “Top Things To Do This Summer 2025” | Gate persist on `isOpaqueContentId` / container titles; repair or quarantine junk rows |
| **S1** | D. Sponsor / outreach | Sponsor opportunities and contacts are email subjects and article headlines | Outreach list is not sponsors; replies do not attach to a real thread | Yes | Opportunities: “Thank you for your ShopMy application”, “Email address verification”. Contacts: “Who has the best pistachio latte in KC?”. Inbound `attached=false` (11 unmatched / 30d) | Separate ShopMy/system mail from sponsor leads; require business-name evidence before `ready_to_contact` |
| **S2** | B. Discoveries@ | Most mail skipped/failed/0-occurrence; retail misread as confirmation | Newsletters do not become dated events; operator still reconstructs by hand | Yes | 14d: skipped 71, processed 37, confirmation_manual 31, failed 4. “BEST SELLERS: Just for you” → `discovery_subscription_confirmation`. Processed “Aug. 15 List of KC Area Restaurant…” → `occurrences_extracted=0`. `newsletter_intelligence` 29 rows / 9 dated vs scrape_listing 817 | Dedicated discoveries occurrence-extraction task (not another Calendar source) |
| **S2** | A. Ask Benson URL | Same-day **date-only** events qualify as `past_event` in Chicago | Today’s date-only URL can be rejected during daytime | Yes | `isPastEventDate`: `2026-08-21T00:00:00.000Z` vs local midnight `2026-08-21T05:00:00.000Z` → **past**. Unit tests now fail (`Fusion Fest` `2026-08-21`) | Compare Chicago local day, not process-local Date midnight vs UTC date-only |
| **S2** | A. Ask Benson URL | Listing/editorial still persist parents / wrong chrome | Operator gets LA headline from OSC listing; Parkville guide stored as container parent | Yes | Recent share: `Los Angeles Welcomes Workers…` from `theosc.co/events`; Parkville guide `editorialContainer=true`, no children in sample | Enforce container-child persist on listing/editorial intake (identity only, not source-tune) |
| **S2** | E. Calendar lifecycle | Expired dropout is not happening | 290 suggested/tentative rows with start >2 days past still active; **0** `expired` rows; 869 suggested | Yes | Bounded status counts + past-suggested count | Calendar expiry job / read filter for past suggested (system lifecycle, not source polish) |
| **S2** | C. Partnership lifecycle | Almost nothing reaches action | 11 qualified / 10 discovered / **1** `content_ready`; research jobs all `needs_verification`; no follow-up timestamps | Yes | `creator_partnerships` pipeline counts | After identity gate: follow-up + play/application state machine |
| **S3** | J. REVOLVE | Official URL vs `?utm_source=openai` still `conflicting_information` | Verification UI lies; program not “verified” | Yes | Live REVOLVE row; prior report 2026-08-11 | Canonicalize program URLs (strip tracking query) |
| **S3** | J. Compound affiliate | `5% + $50` vs researched `5%` stays `partial_unresolved` | Expected parked semantics; FASHIONPHILE still flagged | Yes | `evaluateOperatorResearchConsistency` + live FASHIONPHILE | Product decision: treat percent match as verified-with-note vs keep partial |
| **S3** | Tests | Fixture dates behind operator clock | CI/unit noise (`stale` vs injected `now`) | Yes | weekend/today/home tests use Aug 12–20 fixtures; `isOperatorTemporallyCurrent` ignores injected `now` in weekend gate | Pass `now` through stale check; freeze fixtures relative to clock |
| **S3** | J. Program library | Mock enrich brands in live list | Operator sees “Mock Enrich Verify 17865…” as conflicting | Yes | `listProgramLibrary` conflicting sample | Filter `isProgramLibraryTestArtifact` in list (already exists but mocks still listed) |

---

## Test matrix by workflow

### A. Ask Benson — URL / link intake

| Example | Routing / identity | Durable object | Completes? |
| --- | --- | --- | --- |
| Straightforward event (OPCC Inspiring Women detail) | HTTP 200; JSON-LD 1 Event; **not** container; `parentRepresentsSingleEvent=true`; **qualifies** | Existing repaired row `1695ee52-…` timed 8:00 AM CT | **Yes** (dry-run qualify; persist not run) |
| Editorial/article (IN Kansas City 20 neighborhoods) | Classified **destination_guide** container | Live parent `editorialContainer=true`, `event_starts_at` null | Container detected; children not proven in this sample |
| Creator/brand/program (REVOLVE affiliate) | `classifyStandaloneUrlType` → **unknown** (helper only implements IG/link-hub). Page has 0 Event JSON-LD | N/A (no persist) | Routing to Affiliate Programs is a **different** intake (`tryProgramLibraryIntake`), not this URL-type helper |
| Listing/container (OPCC `/events/`) | **listing_hub**, 12 JSON-LD events, `parentRepresentsSingleEvent=false` | Historical listing ingest created **index-suffixed duplicate children** | Classifier OK; persist identity **not** OK |

`classifyStandaloneUrlType` is **not** the full Ask Benson router (types include `affiliate_program` / `event_listing` but the function never returns them). Real routing uses editorial-container + partnership/social parsers.

Idempotency (14d Ask Benson `sourceExternalId`): **no new hash collisions**. Legacy occupant **still exists**: `ask-benson-user-event-68747470733a2f2f` → Reunion / OSC listing.

### B. Discoveries / email ingestion

| Check | Result |
| --- | --- |
| Channel classification | Header routing: discoveries / sponsors / booking / contact **separate** (unit + `classifyInboundEmail`) |
| Newsletter authority | Enabled `newsletter_sources` present (visitkc.com, fotzkc.org, boostkc.org, …). **0** verified/active `discovery_subscriptions` |
| Useful signals → durable dated objects | Weak. 14d `newsletter_intelligence` 29 / **9 dated**; `discovery_email` 23 / **2 dated**; `email_digest` 36 / **4 dated** |
| Promo junk as Calendar | Coarse marketing often skipped (71 skipped/14d). Retail “BEST SELLERS” / “Fall sweaters” stored as **confirmation_manual**, not Calendar — mixed |
| Sponsor mail vs Discoveries | Channel headers separate; **durable sponsor objects are still junk** (see D) |
| Duplicate explosion | Discovery `duplicate` 16/14d (pipeline-aware). Listing scrape dupes are the bigger identity bug (A/G) |

Did **not** send mail. Did **not** reprocess Gmail.

### C. Creator partnership workflow

Exercised via live `creator_partnerships` (non-library) + `creator_research_jobs` + `creator_interest_records`.

| Stage | Live state |
| --- | --- |
| Entity identity | **Broken** on newest rows (`Dbtacojzn1r`, summer roundup title, “Unrelated Soft Context Hotel”). Loews exists as a better example |
| Research | Jobs: **8** `needs_verification`, 0 complete in this aggregate |
| Fit score | Present on junk rows (42) — score without identity is useless |
| Creator play | JSON object present; not evaluated as usable copy |
| Lifecycle | 11 qualified / 10 discovered / **1** content_ready |
| Application/pitch readiness | Not evidenced |
| Follow-up | `follow_up_at` null on the sampled qualified row |

Unit tests **already forbid** IG shortcode as a business name; **durable partnership table was not cleaned**. Workflow cannot complete on current records.

### D. Sponsor / outreach

| Check | Result |
| --- | --- |
| Channel vs booking vs contact | Header classification **works** |
| Durable sponsor opportunity | **Wrong**: titles are transactional email subjects |
| Contact identity | **Wrong**: Pitch/article headlines as `business_name` |
| Replies attach to thread | Sample inbound ShopMy: `attached=false`; 11 unmatched in 30d |
| Follow-up | Some `waiting_followup`; contacts `next_follow_up_at` null |
| Brand vs platform confusion | ShopMy platform mail treated as sponsor pipeline |

### E. Calendar — system behavior (not source polish)

Used a handful of **known** rows. **Did not** call `listCalendarItems` (that path can await projection).

| System test | Result |
| --- | --- |
| True date-only on intended day | **Pass** on control: Woman of Influence `eventDate=2026-08-28`, `startTime` null, Calendar `allDay=true`, `startAt=2026-08-28T00:00:00Z` |
| Timed event at intended local time | **Pass**: Inspiring Women `startTime=08:00:00` → `13:00Z` / Calendar match; Trinity `17:00` → `22:00Z` |
| Multi-day remains through end | **Not fully proven** (CommUNITY Fest is same-day 08:00–14:00 CT). Weekend List Ethnic Enrichment **does** span Fri–Sun via `spanNote` |
| Expired drops out | **Fail (lifecycle)**: **0** `expired` Calendar rows; **290** suggested/tentative with start older than 2 days still sitting there |
| Container parent does not project | Classifier treats INKC neighborhoods as container. One **confirmed** Calendar row is that parent (operator-protected). Not reopened as source polish |
| Mutable suggestion can refresh | **Pass** (existence): `suggested` + `benson_inventory` + `userEditedAt` null |
| Confirmed / user-edited protected | **Pass**: `isProtectedCalendarSuggestion` true for confirmed Kellie/Benson rows |

**Calendar core (clocks, allDay evidence, protection): HEALTHY ENOUGH TO FREEZE.**  
**Calendar expiry/lifecycle: S2 system bug — not a source audit.**

Residual date-only rows with `allDay=false` (Vintage Market Days, Plaza Art Fair) look like **unrepaired historical writes**, not a reason to re-open OPCC/HPNA/Bowline.

### F. Weekend List

| Check | Result |
| --- | --- |
| Fri/Sat/Sun keys | **Pass** `2026-08-21` / `22` / `23` |
| Placement | Three selected items all on Friday; Ethnic Enrichment annotated “Also Saturday–Sunday” |
| Date-only vs timed labels | Timed labels `6:00 PM`, `8:00 PM`, `9:00 PM` |
| Durable board membership | `selectedCount=3`, `outsideWindowCount=0` |
| Matches current weekend | Yes for this operator Friday |

**Healthy enough to freeze** aside from whatever Discover/listing junk the operator might add later.

### G. Durable state / idempotency

| Check | Result |
| --- | --- |
| Ask Benson 14d hash dupes | **None** |
| Legacy collision id | **Still occupied** (Reunion) — historical, not new |
| Listing child ids | **Not idempotent** (index in `sourceExternalId`) |

Did not double-submit live URLs (would mutate).

### H. Source refresh / re-ingest (one hub, dry-run)

Source: OPCC Events Archive. Fetched listing HTML only.

Live JSON-LD names (12) look like real children. Persisted timed sample is **dominated by duplicate titles** at UTC midnight, not the repaired 13:00Z row.

**Do not re-ingest OPCC.** Next work is identity/dedupe, not another OPCC clock audit.

### I. Home / Today / Discover

| Check | Result |
| --- | --- |
| Current actionable state | Discover returns 12 cards; **0** older-than-1-day by `eventStartsAt` in that page |
| Junk/container dominating | **Yes**: venue titles + 2027 TicketSqueeze “T-Mobile Center” |
| Links | URLs are valid listing/ticket hosts, but **identity is wrong** |
| Ranking | Not tuned (out of scope) |

Today/Home unit tests failing are mostly **stale fixture dates** vs wall clock, not a separate product defect.

### J. Known parked areas (light)

| Area | Status |
| --- | --- |
| Affiliate **range** vs point (5–15% vs 10%) | **Resolved in code** (`consistent: true`). Live conflicting sample is mocks + REVOLVE, not thredUP-style range |
| Affiliate **compound** (`5% + $50`) | **Still parked / by design**: `partial_unresolved`; FASHIONPHILE live |
| Etsy routing | **Routing resolved**: `help.etsy.com` → brand **Etsy** (never Help). Live row exists, `operator_supplied`, commission null — verification incomplete, not Help |
| REVOLVE | **Still broken**: `conflicting_information`, official URL still has `utm_source=openai` |

---

## TOP 3 bugs Benson should fix next

1. **Listing/Discover identity** — Stop treating venue/hub titles as events; stop encoding listing **index** into `sourceExternalId`; bounded dedupe of OPCC-style clones. This is the highest user-visible breakage and it is **not** another Calendar timezone audit.
2. **Partnership + sponsor entity gate** — Do not persist Instagram shortcodes, editorial titles, or transactional email subjects as brands/sponsors. Quarantine existing junk. Until identity is real, fit scores and “qualified” are theater.
3. **Discoveries@ occurrence path** — Processed mail with `occurrences_extracted=0`, confirmation misfires on retail, and thin `newsletter_intelligence` dating. This is the email workflow, not Calendar sources.

Honorable system S2 (after the three): **Calendar expiry** so 290 past suggestions drop out.

---

## Healthy enough to STOP touching

- Calendar **timed vs date-only evidence** on known-good controls (Inspiring Women, Trinity, Woman of Influence `allDay=true`)
- Calendar **protection** of confirmed / user-edited rows
- Weekend List day keys, span notes, time labels
- Inbound **mailbox header routing** (discoveries vs sponsors vs booking vs contact)
- Ask Benson **editorial-container classifier** on the INKC guide and OPCC listing hub
- OPCC **visible-Time vs JSON-LD parser** (already shipped; MINK/Hillcrest are historical data, not a new parser task)
- Etsy **brand extraction** from help.etsy.com
- Ask Benson **new** external-id hashing (no 14d collisions)

---

## S2/S3 to park

- REVOLVE tracking-query “conflict”
- Compound commission `$50` unresolved component
- Same-day date-only `past_event` in URL qualification (small, precise)
- Unit-test fixture clock drift
- Mock enrich rows in program library list
- MINK Law Day / Hillcrest **historical** visible-Time repair (already audited; not a system blocker)
- Individual OPCC/HPNA/Bowline source polish

---

## S0 / immediate danger

**None observed.** Confirmed Calendar items remain protected. No mail sent. No projection. No evidence in this pass of user-edited overwrite.

---

## Exact bounded queries / tests run

**Unit (no live writes intended):**  
`url-type`, `url-intake-qualification`, `user-opportunity-add`, `editorial-container`, `editorial-roundup`, `resolve-channel`, `email-category`, `discovery-newsletter-route`, `inbound-actionability`, `claim-comparison`, `evidence-authority`, calendar `eligibility` + `sync`, `weekend-list`, `weekend-things-to-do`, `today-clarity`, `discover-eligibility`, `home-showroom`, `discover-kind`, `top-pick-actions`.

Result: **272 pass / 9 fail**. Failures cluster on **hardcoded mid-August dates vs 2026-08-21** plus **same-day date-only `past_event`**. Did **not** run `etsy-routing.test.ts` / `creator-interest/actions.test.ts` (those persist fixtures).

**Live read-only:**  
- Fetch 4 URLs; `parseJsonLdPageGraph` + `classifyEditorialContainer` + `qualifyUrlOpportunity` (no persist)  
- `content_items` / `creator_calendar_items` / `discovery_email_messages` / `newsletter_sources` / `discovery_subscriptions` / `creator_partnerships` / `creator_research_jobs` / `creator_interest_records` / `sponsor_*` / `outreach_inbound_messages` with `LIMIT` or 14-day windows  
- `loadWeekendList`, `listOpenDiscoveries(12)`, `listProgramLibrary({limit:80})`  
- OPCC listing fetch for JSON-LD names only  

**Explicitly not run:** `collectOpportunitiesFromLink`, `listCalendarItems` (projection), `scrapeListing`, Gmail send/sync, full OPCC re-ingest, table scans of all content.

---

## Tests that could not be completed

| Item | Why |
| --- | --- |
| Live Ask Benson persist + repeat submit | Would mutate durable state |
| True multi-day Calendar control | CommUNITY Fest control is same-day timed; used Weekend List span as proxy |
| Partnership “happy path” to pitch | No clean live non-library partnership with follow-up + play |
| Discoveries live reprocess | Would mutate; used stored `discovery_email_messages` only |
| Calendar UI pixel proof | API/DB only; clocks checked as UTC + extracted local |

---

## Confirmations

| | |
| --- | --- |
| Code changed | **no** |
| Data changed | **no** |
| External messages sent | **no** |
| Full Calendar projection | **not run** |
| Full source re-ingest | **not run** |
| Individual Calendar source audits continued | **no** (OPCC duplicates cited only as identity evidence) |
