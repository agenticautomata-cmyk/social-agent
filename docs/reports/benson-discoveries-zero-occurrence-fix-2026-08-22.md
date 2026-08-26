# Discoveries@ processed-with-zero-occurrence fix

**Date:** 2026-08-22 (work completed 2026-08-23)  
**Scope:** Discoveries@ Gmail → classification → newsletter/discovery extraction → dated occurrence persistence → `processed` / `skipped` / `failed`.  
**DB inspected:** local `social_agent` on `localhost:5433` (read-only).  
**Tests:** `social_agent_test` only.

| Confirmation | Value |
| --- | --- |
| Live Gmail reprocessed | **no** |
| Live data changed | **no** |
| Email sent | **no** |
| Calendar projection run | **no** |
| Sponsor CRM cleanup | **untouched** |
| Creator partnership cleanup | **untouched** |
| Retail/confirmation misclassification | **explicitly out of scope** |

---

## Proven root cause

`discovery_opportunity` mail from a sender that is **not** an enabled `newsletter_sources` row and has **no** active/verified subscription is routed to `opportunity_ingest`.

That path called `ingestEmailMessageAsOpportunity()` → `extractIntakeSubmission()` (one insight card, optional single date). It never called `extractNewsletterItems()` / `persistNewsletterInventoryItem()`. `discovery_email_messages.occurrences_extracted` is only written by newsletter intelligence, so it stayed **0**. `processing_status` was set to **`processed`** because ingest returned `ok`.

That is the exact failure for:

`Your Aug. 15 List of KC Area Restaurant and Retail openings, closings`  
gmail `1a0072f452ff2c3c` / row `ceb68090-a60c-4388-970c-fd6aa71d954b`

Live persisted card:

- `content_items.id` `9c174b09-3aee-4701-88f9-a85e78cce116`
- `ingest=discovery_email`
- topic: *New Owners for One of KC's Oldest Retailers: Planters Seed & Spice*
- `event_starts_at` **NULL**
- body still contains dated openings (`ribbon cutting Aug. 24th`, `open the new building to the public Aug. 25th`)

Secondary defects on the same Discoveries path (repaired because they produce the same user-visible lie or block the good path):

1. **`parsedFrom` was not destructured** in `processOpportunityDiscoveryEmail`, so enabled-source newsletter processing crashed (`processing_error = parsedFrom is not defined`). Live failed controls: ReSALE SHOP `1a009cd177f95a9c`, Ross `1a007e0be3d14f14`.
2. After newsletter parse, Discoveries **overwrote** status to `processed` whenever `skipped` was not set, including zero dated occurrences.
3. Newsletter pipeline marked `processed` if **any LLM items** existed, not if a dated occurrence was persisted.
4. Date parser rejected `Aug. 25th` ordinals (`MONTH_DAY` word-boundary after the day number). Same-month ranges `Sep 2–6` were not parsed as one start/end.

---

## Exact Discoveries processing path

```
gmail-discovery-sync
  → processDiscoveryEmailMessage                    gmail-inbox/discovery-process.ts
      resolveInboundChannelFromHeaders + isDiscoveryEmail
      classifyDiscoveryIntent(subject + body)
      insert discovery_email_messages (processing_status='received')
      findEnabledNewsletterSourceForSender
      findActiveSubscriptionForSender
      resolveDiscoveryNewsletterRoute
           │
           ├─ skip_intent (welcome/marketing/other, no newsletter authority)
           │     → skipped   (unchanged; not broadened)
           ├─ confirmation_only
           │     → subscription confirmation only   (not retuned)
           ├─ newsletter / confirmation_and_newsletter
           │     → processNewsletterEmailRouted
           │          classifyNewsletterEmail → prefilterNewsletterEmail
           │          extractNewsletterItems (LLM + deterministic dated merge)
           │          evaluateNewsletterItem → persistNewsletterInventoryItem
           │          occurrences_extracted = dated created + dated duplicates
           │          processing_status from resolveDiscoveryOccurrenceOutcome
           └─ opportunity_ingest  (no enabled source AND no active subscription)
                 BEFORE: ingestEmailMessageAsOpportunity → processed + 0 occurrences
                 AFTER:  processNewsletterEmail (same occurrence pipeline)
                         processed only if a new dated occurrence was persisted
```

`resolveDiscoveryNewsletterRoute()` still returns `opportunity_ingest` for untrusted `discovery_opportunity` senders. Coarse routing was **not** redesigned. The process layer now runs occurrence extraction on that action instead of single-card ingest.

---

## Exact stage that caused zero occurrences

For the Aug. 15 restaurant list:

| Stage | What happened |
| --- | --- |
| Channel | discoveries@ (Gmail message stored) |
| Intent | `discovery_opportunity` |
| Newsletter authority | none (`substack.com` not enabled; no active subscription) |
| Route | `opportunity_ingest` (`runNewsletterIntelligence=false`) |
| Dates in source | present in body: `Aug. 24th`, `Aug. 25th` (and subject issue date `Aug. 15`) |
| Titles in source | present: Fareway Meat Market ribbon cutting / public opening; Now Open list without dates |
| Loss stage | **ingest bypass:** `extractIntakeSubmission()` summarized the Planters feature and never produced occurrence rows |
| Persistence | one undated `discovery_email` insight |
| Status | `processed`, `occurrences_extracted=0` |

Enabled-source successes (Zoo, Visit KC) **did** reach `newsletter_intelligence` and created dated occurrence children. That path was not the Aug. 15 failure.

---

## Files changed

| File | Change |
| --- | --- |
| `services/core/src/gmail-inbox/discovery-process.ts` | Destructure `parsedFrom`. `opportunity_ingest` runs `processNewsletterEmail`. Status copied from occurrence outcome; no more `processed` overwrite of skips. |
| `services/core/src/gmail-inbox/discovery-newsletter-route.ts` | `shouldRunNewsletterOccurrenceExtraction()` documents ingest still extracts. Route enum unchanged. |
| `services/core/src/gmail-inbox/index.ts` | Export the helper. |
| `services/core/src/newsletter-intelligence/pipeline.ts` | Count dated creates/duplicates. Status from `resolveDiscoveryOccurrenceOutcome`. |
| `services/core/src/newsletter-intelligence/extract.ts` | HTML-in-`body_text` plaintext. Merge deterministic dated items even when LLM/cache returns none. |
| `services/core/src/newsletter-intelligence/dated-occurrence-extract.ts` | **New.** Deterministic dated occurrence extractor for list/newsletter copy. |
| `services/core/src/newsletter-intelligence/occurrence-outcome.ts` | **New.** `processed` / `duplicate_only` / `informational_only` / `no_dated_occurrence`. |
| `services/core/src/newsletter-intelligence/date-normalize.ts` | Ordinals (`Aug. 25th`). Same-month ranges (`Sep 2–6`). |
| `services/core/src/newsletter-intelligence/types.ts` | `processingStatus`, dated occurrence counters on parse result. |
| `services/core/src/newsletter-intelligence/sources.ts` | `processingError` on parse-stat patch. |
| `services/core/src/newsletter-intelligence/prefilter.ts` | `email address verification` as account/security reject (tightening). |
| `services/core/src/newsletter-intelligence/index.ts` | Export new modules. |
| `services/core/package.json` | Persist idempotency test on `test:postgres`. |
| Tests | `dated-occurrence-extract.test.ts`, `dated-occurrence-persist.test.ts`, date-normalize additions. |

Identity/dedupe: existing `occurrenceFingerprint` / `persistNewsletterInventoryItem` only. No second identity system.

---

## Status semantics before → after

| Before | After |
| --- | --- |
| `processed` + `occurrences_extracted=0` (ingest “success”) | **Removed.** That combination is no longer assigned on this path. |
| `processed` | At least one **new** dated occurrence was persisted (`reason=dated_occurrences`). |
| `duplicate` | Dated occurrence identity already existed (`processing_error=duplicate_only`). |
| `skipped` + `processing_error` | Explicit no-occurrence: `informational_only`, `no_dated_occurrence`, prefilter reason (`percent_off_offer`, `account_order_notice`, `spam_noise`, …), or unprocessable category. |
| `failed` | Thrown error (including the previous `parsedFrom is not defined` crash, now fixed). |

Existing columns only: `processing_status`, `processing_error`, `occurrences_extracted`. No new state machine.

---

## Extraction rules

A useful occurrence requires:

- event/activity title (not newsletter chrome, not “When:”, not the issue-date subject line)
- explicit date or date range (month-day / ISO / slash; ordinals allowed)
- optional clock **only if stated as event time** (store `Hours: 8 a.m. to 8 p.m.` is not an event clock)
- optional venue/location **only if stated** (not invented)
- source message provenance via existing newsletter attribution metadata

Also:

- Date-only is valid (`event_starts_at` UTC midnight from `YYYY-MM-DD`).
- Multiple dated events → separate logical occurrences (existing fingerprint identity).
- One multi-day span (`Sep 2–6`) → one occurrence with start and end.
- Reject: generic retail sales, newsletter chrome, account/security mail, pure editorial with no dated event, nav/footer, news vote/approval copy without a dated event.

---

## Tests run + pass/fail counts

Targeted suite (this fix):

```
src/newsletter-intelligence/date-normalize.test.ts
src/newsletter-intelligence/dated-occurrence-extract.test.ts
src/newsletter-intelligence/dated-occurrence-persist.test.ts
src/gmail-inbox/discovery-newsletter-route.test.ts
```

**45 pass / 0 fail** (`social_agent_test` for persist idempotency).

Fixture map:

| # | Case | Result |
| --- | --- | --- |
| 1 | Title + Aug 15 + venue | 1 date-only occurrence |
| 2 | Three event cards | 3 logical occurrences |
| 3 | Title + Aug 28, no time | date-only preserved (`2026-08-28T00:00:00.000Z`) |
| 4 | Sep 2–6 | one occurrence start/end |
| 5 | `BEST SELLERS: Just for you` | 0 / prefilter reject |
| 6 | `Email address verification` | 0 / account-order reject |
| 7 | Article copy, no event date | 0 / `informational_only` |
| 8 | Duplicate persist | one durable row; `duplicate_only` |
| 9 | Aug. 15 KC restaurant list structure | ≥1 occurrence (Fareway Aug 24/25) |
| 10 | Existing Zoo newsletter persist-shape tests | green |

Full `src/newsletter-intelligence/*.test.ts` plus the route file: **94 pass / 1 fail**. The fail is **pre-existing and unmodified**: `quality-corrections.test.ts` `allows virtual events without physical location` (`calendarEligible` rejects `startDate` more than one day behind `Date.now()`). Not part of this occurrence-ingest fix.

---

## Concrete regression: `Aug. 15 List of KC Area Restaurant...`

Equivalent fixture body (Now Open undated list + Opening soon with Fareway ordinals) extracts:

- **Fareway Meat Market**
- start `2026-08-24` / end `2026-08-25`
- no invented clock
- subject issue date is **not** turned into an occurrence

Live dry-run of gmail `1a0072f452ff2c3c` (read-only): **before 0 → corrected 1**, same Fareway row, `would_create_occurrence`, fingerprint not already in `content_items`.

---

## Multi-event / date-only / multi-day proofs

Covered by fixtures 2, 3, 4 and existing Zoo persist-shape tests (Melon / Brew / Pirate’s Feast independently dated).

---

## Retail / security / no-date controls

- Retail `BEST SELLERS: Just for you` + shop-now body → zero occurrences, prefilter reject.
- `Email address verification` → zero occurrences.
- Heritage-essay copy with no calendar date → `informational_only`.
- Planning-commission **vote** date is not an occurrence.

---

## Idempotency proof

`dated-occurrence-persist.test.ts` persists the same dated item twice against `social_agent_test`:

- first insert `created=true`
- second `created=false`, `duplicateMerged=true`, same `content_items.id`
- `LIKE 'ZZZ_TEST_FIXTURE_dated_occ_%'` count = 1
- outcome `duplicate_only`

Fingerprint function unchanged (`buildNewsletterOccurrenceFingerprint`).

---

## Bounded live read-only sample (≤10)

Inspected `social_agent` only. Messages were **not** mutated.

14-day status snapshot at inspect time: skipped 66, processed 35, confirmation_manual 27, duplicate 16, failed 4.

Ingest datedness (14d): `discovery_email` 21/1 dated, `email_digest` 34/4, `newsletter_intelligence` 28/8.

| # | gmail id | sender | subject | class / route | status | extract route | dates / titles | occ | persisted | loss stage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `1a0072f452ff2c3c` | kcinsiders@substack.com | Aug. 15 List of KC Area Restaurant… | `discovery_opportunity` / `opportunity_ingest` | processed | **ingest, not newsletter** | body `Aug. 24th`/`25th`; persisted title Planters Seed | 0 | `9c174b09-…` undated insight | ingest bypass |
| 2 | `1a002a97083afd32` | noreply@e.cityplace.com | Don’t Miss This Special Delivery… | opportunity / ingest | processed | ingest | HTML body; no newsletter stats | 0 | `da94d84e-…` | ingest + later prefilter would skip as `account_order_notice` (footer) |
| 3 | `1a0013820cdcb13b` | media@thekcscene.com | New KC Housing / Biotech / Wicked | opportunity / ingest | processed | ingest | news copy; no dated event cards | 0 | `e5953f21-…` | ingest; corrected dry-run `informational_only` |
| 4 | `19ffc7407cb8a9f0` | askthezoo@fotzkc.org | Melon Summer Smash Coming Saturday! | opportunity + **enabled** fotzkc.org | processed | newsletter_intelligence | Melon 2026-08-15, Brew 2026-10-10, Pirate’s Feast 2026-09-12–10-24 | 6 | occurrence children dated | n/a (success) |
| 5 | `19ffba35fde0bb17` | email@marketing.visitkc.com | This Weekend in KC: 816 Day… | `discovery_other` + enabled visitkc | processed | newsletter_intelligence | FIFA Fan Festival 2026-08-14, concerts | 7 | `ingest=newsletter_intelligence` | n/a (success) |
| 6 | `6e4cf3c3-…` | help@reklaim.com | Don’t Miss Out on Your First Find | `discovery_subscription_welcome` / skip_intent | skipped | none | — | 0 | none | skip_intent (control) |
| 7 | `ee413172-…` | info@mademobb.com | KC GETTING BACK TO BUSINESS | `discovery_marketing` / skip_intent | skipped | none | — | 0 | none | skip_intent (control) |
| 8 | `1a009cd177f95a9c` | resaleshop@boostkc.org | SUMMER'S PACKING UP… | marketing + enabled boostkc | **failed** | newsletter (crashed) | — | 0 | none | `parsedFrom is not defined` (now fixed) |
| 9 | `1a007e0be3d14f14` | mailing@email.rossstores.com | Where Summer Style Ends Beautifully | other + enabled rossstores | **failed** | newsletter (crashed) | — | 0 | none | same `parsedFrom` crash |
| 10 | `f046f46d-…` | platos@…ccsend.com | Back to School Shopping Starts NOW! | opportunity / ingest | processed | ingest | retail chrome | 0 | **null** content id | ingest success with nothing useful; corrected dry-run `spam_noise` skip |

---

## Dry-run corrected extraction (≤5 problematic messages)

Read-only: SELECT bodies from `social_agent`, run corrected extractor + existing prefilter/classify in memory, fingerprint lookup SELECT only. **No INSERT/UPDATE. No Gmail API. No `processDiscoveryEmailMessage`.**

| Message | before occ | corrected count | titles / dates | times | locations | duplicates skipped | durable would-be |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Aug. 15 KCinsiders `1a0072f452ff2c3c` | 0 | **1** | Fareway Meat Market, 2026-08-24–08-25 | none (hours-of-operation ignored) | none stated on that card | 0 | would create newsletter occurrence |
| CityPlace `1a002a97083afd32` | 0 | **0** | — | — | — | 0 | skip `account_order_notice` (explicit; not processed+0) |
| KC Scene `1a0013820cdcb13b` | 0 | **0** | — | — | — | 0 | skip `informational_only` |
| KCUR Early Bird `1a0002004fcbc2ca` | 0 | **0** | — | — | — | 0 | skip `informational_only` |
| Plato’s Closet `19ffea4b826e6954` | 0 | **0** | — | — | — | 0 | skip `spam_noise` |

Pipeline outcome for Aug. 15: `processed` / `dated_occurrences` **if this code were used on a new ingest**. Historical row was **not** updated.

---

## Unrelated findings (out of scope)

- **Retail/confirmation misclassification** (CityPlace prefilter `account_order_notice` from footer/welcome language; retail-as-confirmation generally). Not retuned.
- **Enabled `kcur.org` vs this Early Bird row** still showing ingest (`newsletter_category` null): historical path, not reprocessed.
- **Undated newsletter_intelligence children** on otherwise successful Zoo/Visit KC extracts (membership / some occurrence rows with null `event_starts_at`). Existing quality of LLM items; not the ingest bypass.
- **`calendarEligible` unit test clock drift** vs `Date.now()` for Aug 15 fixtures. Unrelated Calendar eligibility helper.
- Discover ranking, Calendar expiry, Ask Benson same-day date-only `past_event`, Gmail inbox reprocess, historical newsletter backfill.

---

## What this does *not* do

Does not clean sponsor CRM junk.  
Does not clean `creator_partnership` junk.  
Does not project Calendar.  
Does not reprocess Gmail.  
Does not redesign newsletter routing for welcome/marketing/`discovery_other` without authority.  
Does not fix retail emails misclassified as confirmation.  
Does not send email.
