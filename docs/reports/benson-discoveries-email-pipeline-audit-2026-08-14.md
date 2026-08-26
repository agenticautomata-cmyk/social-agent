# Discoveries@ newsletter → Benson intelligence pipeline audit

**Date:** 2026-08-14  
**Scope:** Read-only trace of newsletters / discovery emails to `discoveries@kckellie.com`.  
**DB:** local Benson host `localhost:5433` (`DEMO_MODE=false`).  
**Token-efficient canary:** unset → `resolveNewsletterPipelineMode()` is **legacy**.  
**No product changes, deploys, Gmail writes, scrapes, or backfills were performed.**

---

## Executive summary

Discoveries@ mail **is reaching Benson**. Telegram proves it: in the last 16 days, **305/308** `discovery_email_messages` have a matching `gmail_digest_messages.telegram_sent_at`.

Those same emails **usually do not become durable dated events** that Calendar can project.

The live path is not the newsletter intelligence extractor. It is:

1. Gmail discovery sync inserts a `discovery_email_messages` row.
2. `classifyDiscoveryIntent()` labels the **whole email** as confirmation / welcome / opportunity / marketing / other.
3. Welcome, marketing, and other are **skipped with zero extraction**.
4. Opportunity emails do **not** enter `processNewsletterEmail()` because **0/88** `discovery_subscriptions` are `verified` or `active` (all 88 are `manual_action_required`).
5. The fallback `ingestEmailMessageAsOpportunity()` / digest auto-harvest writes **one** `content_items` row (`type=industry_insight`) via `extractIntakeSubmission()`. Multi-event newsletters collapse to one generic undated card. `event_starts_at` is almost never set.
6. Calendar projection (`collectInventoryCandidates`) only reads `content_items` with **non-null `event_starts_at`**. Undated cards never appear.

Telegram is a **separate unread-inbox digest**. It classifies from headers + snippet and sends `Benson · discovery inbox` **before** structured extraction/persistence.

**Concrete proof on this weekend’s best example:** Visit KC “This Weekend in KC: 816 Day and Timeless Mucha” (2026-08-13 10:00 CT) was classified `discovery_other` and **skipped**. Digest later created one undated blob `Top Events Happening in Kansas City, Aug. 14-16` (`ingest=email_digest`, `event_starts_at=NULL`). 816 Day **is** on Calendar — from scrape listing / Instagram Watchlist / Ask Benson — **not** from this discoveries@ email.

---

## Pipeline map (actual files / functions)

```
gmail-discovery-sync worker
  services/workers/src/workflows/gmail-discovery-sync.ts
  query: in:inbox newer_than:7d (to:discoveries@kckellie.com OR deliveredto:discoveries@kckellie.com)
  listGmailMessageIds(query, 20) → processDiscoveryEmailMessage(id)
        │
        ▼
processDiscoveryEmailMessage
  services/core/src/gmail-inbox/discovery-process.ts
  authority: discovery_email_messages row (gmail_message_id unique)
  resolveInboundChannelFromHeaders + isDiscoveryEmail
  classifyDiscoveryIntent(subject + full body)
        │
        ├─ already_processed → return existing row, no re-extract
        ├─ discovery_subscription_confirmation → processSubscriptionConfirmationEmail
        ├─ welcome | marketing | other → processing_status='skipped'  ← STOP
        └─ discovery_opportunity
              │
              ├─ findActiveSubscriptionForSender (status IN verified|active)
              │     currently ALWAYS null (0 active subs)
              │     would call processNewsletterEmailRouted
              │
              └─ ingestEmailMessageAsOpportunity
                    gmail-inbox/email-ingest.ts
                    findDuplicateBySubjectTitle → or extractIntakeSubmission
                    persistIngestedContentItem (ONE industry_insight)
                    ingest: 'discovery_email'
                    eventStartsAt ← extracted_date only

PARALLEL (not the same worker):
gmail-inbox-digest
  services/workers/src/workflows/gmail-inbox-digest.ts
  runGmailTelegramDigest()  gmail-inbox/digest.ts
  buildDigestUnreadQuery()  — ALL unread Primary+Promotions, not discoveries@-only
  classifyInboundEmail(headers + snippet only)
  sendTelegramMessage(formatTelegramDigestBody)  → gmail_digest_messages.telegram_sent_at
  tryAutoHarvestDigestMessage → promoteDigestToOpportunity
        if processDiscoveryEmailMessage already skipped:
          falls through to ingestEmailMessageAsOpportunity(ingestKey='email_digest')

UNUSED ON LIVE INTAKE (subscription gate):
processNewsletterEmailRouted → processNewsletterEmail
  newsletter-intelligence/pipeline-router.ts → pipeline.ts
  classifyNewsletterEmail → extractNewsletterItems (multi-item LLM)
  evaluateNewsletterItem (quality-gates) → persistNewsletterInventoryItem
  ingest: 'newsletter_intelligence'
  occurrence rows CAN set event_starts_at

HISTORICAL (not live cron):
runNewsletterBackfill / persistApprovedNewsletterCorpus
  created 740 newsletter_intelligence content_items (Jul 28–29)
  739/740 have event_starts_at NULL
  3 creator_calendar_items written as source_record_type='newsletter_occurrence'

Calendar projection (unchanged this audit):
  population/sync.ts collectInventoryCandidates
  WHERE event_starts_at IS NOT NULL AND in window
  evaluateInventoryCalendarEligibility
  upsert creator_calendar_items source_record_type='content_item'

Discover:
  inventory/discover-eligibility.ts evaluateDiscoverEligibility
  hidden_raw_signal → quarantined
```

### Authority each step produces

| Step | Durable state |
|---|---|
| `gmail-discovery-sync` | Gmail id list only |
| `processDiscoveryEmailMessage` | `discovery_email_messages` + intent/status |
| `classifyDiscoveryIntent` | `discovery_intent` (whole-email label) |
| `processNewsletterEmail` | 0–N `content_items` (`newsletter_intelligence`) + `inventory_evidence` |
| `ingestEmailMessageAsOpportunity` | 0–1 `content_items` (`discovery_email`) |
| `runGmailTelegramDigest` | `gmail_digest_messages` + Telegram send |
| `promoteDigestToOpportunity` | 0–1 `content_items` (`email_digest`) + `promoted_content_item_id` |
| Calendar projection | `creator_calendar_items` **only if** `event_starts_at` present |
| Discover | Filter over existing `content_items`; does not create events |

---

## Special questions

### 1. Are newsletter emails reaching the discoveries@ ingestion path?

**Yes.** 510 `discovery_email_messages` exist (2026-07-19 → 2026-08-14). Last 16 days: 308. Recipients resolve via `Delivered-To` / `To` / `X-Original-To` (`resolve-channel.ts`). Worker query explicitly targets `discoveries@kckellie.com`.

### 2. How are they classified?

Live intake uses `DiscoveryIntent` only — **not** sponsor / generic inbox / transactional as first-class live labels.

| Intent (all 510 rows) | Typical fate |
|---|---|
| `discovery_other` (125) | 100 skipped |
| `discovery_subscription_welcome` (99) | 90 skipped |
| `discovery_opportunity` (123) | 87 processed, 35 duplicate |
| `discovery_subscription_confirmation` (88) | 87 `confirmation_manual` |
| `discovery_marketing` (75) | 68 skipped |

`classifyInboundEmail` sets `emailCategory='discovery'` whenever the alias is discoveries@. It does **not** classify discoveries@ as sponsor (`email-category.test.ts`).

Digest intent often **disagrees** with intake intent because digest classifies **snippet only**. Example: Marshalls full-body → `discovery_subscription_confirmation`; digest snippet → `discovery_other`. Telegram heading is still `Benson · discovery inbox`.

Newsletter-intelligence categories (`local_newsletter`, `retail_newsletter`, `venue_event_newsletter`, `transactional_email`, `spam_noise`, …) are **not assigned on the live path** except on 35 July backfill rows.

### 3. Multiple dated events from one newsletter?

**Designed yes, live no.**

`extractNewsletterItems()` prompt: “Each item represents ONE distinct … Never return one vague item like newsletter events.” Schema allows up to 50 items.

Live intake never calls it. `extractIntakeSubmission()` returns **one** title/date. Evidence:

- Zoo “Melon Summer Smash Coming Saturday!” body lists Melon Smash **Aug 15**, Brew at the Zoo **Oct 10**, Pirate’s Feast **Sep 12–Oct 24**. Persisted topic: **“Upcoming Events at Kansas City Zoo”**, `event_starts_at=NULL`.
- Visit KC / KC Mag / Pitch Calendar digest harvests: one undated “weekend events” blob each.

July backfill did extract multiple entities (e.g. Independence Today: 9 entities / 8 occurrences) but almost none received `event_starts_at`.

### 4. Concrete current KC event — candidate, persist, date, Calendar?

| Check | Live result |
|---|---|
| Event candidate created? | Only if intent=`discovery_opportunity` **or** digest auto-harvest fallback. Visit KC / Pitch Calendar / KC Mag **skipped** at intent. |
| Persisted? | Sometimes one generic `industry_insight`. |
| `event_starts_at` set? | Zoo hook mentions Aug 15; column is **NULL**. Visit KC digest item **NULL**. |
| Calendar projection? | **No** — `collectInventoryCandidates` requires `event_starts_at`. |

816 Day **is** on Calendar from **other pipelines** (`scrape_listing`, `instagram_watchlist`, Ask Benson inventory) — not from the Visit KC discoveries@ email.

### 5. What is killing newsletter events?

| Hypothesis | Verdict on live sample |
|---|---|
| Weak source authority | **Not the live killer.** Visit KC / Pitch never reach eligibility. |
| Missing canonical entity | Secondary. Single-item ingest sets `canonical_entity_id=NULL`. |
| Generic article classification | **Yes, after persist.** One `industry_insight` “weekend events” card. |
| Stale/freshness | **Not** the first loss. Cards are `freshness_bucket=fresh`. |
| Wrong-city | **Not** observed on these KC senders. |
| `source_intelligence_only` | Home/Today lane; **not** why Calendar misses them. Calendar misses them because **no date column**. |
| Generic promotional suppression | **Not on the live path.** Jack Stack 15% off **was persisted** as `creator_candidate`. Newsletter `prefilterNewsletterEmail()` (`percent_off_offer`, etc.) only runs inside the unused newsletter / token-efficient pipeline. |

**First killers:** intent skip (`welcome`/`marketing`/`other`) → no active subscription → single-item ingest without `event_starts_at`.

### 6. Useful discoveries created but hidden?

**Partially.**

Hidden after persist:

- Pitch Calendar digest item `Kansas City Late Summer and Early Fall Music Events` — `hidden_raw_signal` → Discover `quarantined`.
- KCUR construction program — persisted news, `hidden_raw_signal`.

Not hidden, but **not Calendar-usable**:

- Visit KC digest blob and Zoo “Upcoming Events…” are `creator_candidate` + `active` + `fresh` with **no date**. Discover may show a generic card. Calendar will not.

Lost before a usable row:

- 160/308 last-16-day emails skipped at intent.
- 28 opportunity `duplicate` rows with **both** `content_item_id` and `duplicate_of_content_item_id` NULL (URL-dedupe orphan; see root cause 4).
- 15 opportunity `processed` with no `content_item_id` (same persist miss).

### 7–8. Sale/promo suppression?

**Live path is not suppressing routine promos too aggressively. It is failing to extract significant dated sales, and it is persisting some routine discount emails as generic opportunities.**

- Jack Stack “Three Best Sellers 15% OFF” → persisted `creator_candidate`, no date.
- Marshalls / TJ Maxx percent-off mail → misfiled as `discovery_subscription_confirmation` (footer “confirm your email” matches `CONFIRMATION_PATTERNS` **before** marketing). No inventory. Telegram still sent.
- BoostKC “ESTATE JEWELRY DEBUT! CORRECTED DATES!” (dated in-person sale windows 8/10–8/15) → `discovery_opportunity` / `processed` / **no content_item**.
- Plato’s Closet “Back to School… Event is Saturday!” → same: processed, no content_item.

Token-efficient `prefilterNewsletterEmail()` **would** reject many `% off` / free-shipping emails — but that prefilter is **not on the live intake path**.

### 9. Routine promo vs significant sale event?

**No explicit live distinction.**

Existing unused / adjacent taxonomy (do not treat as a Sales surface):

- `newsletter-intelligence/opportunity-promote.ts` `MEANINGFUL_SALE` (warehouse / sample / anniversary / sidewalk / popup) vs generic `promotion` kind. **Not called** by `processDiscoveryEmailMessage` or `email-ingest.ts`.
- `extract.ts` `OCCURRENCE_TYPES` includes `sale`, `clearance`.
- `inventory/normalize.ts` categories: `estate_sale`, `liquidation_sale`, `warehouse_sale`, `deal`, `luxury_deal`. Used by inventory/Calendar category mapping, **not** by email intake.
- Prefilter reasons: `percent_off_offer`, `free_shipping_promo`, `bogo_offer`, `product_catalog` — token-efficient / unused live.

There is **no** durable `sale_event` / `major_sale` type written from discoveries@ today. A future “Major Sales” surface would need new authority; stuffing sales onto Calendar is not supported by current email persist.

### 10. Newsletter events already in inventory that Calendar should show?

Almost none from email.

- 740 `newsletter_intelligence` rows: **1** dated (`Evolving Vision: Brush Creek Corridor`, 2026-10-27) — already has a `newsletter_occurrence` calendar row from the July live-persist, **not** from current `content_item` projection.
- 195 `discovery_email` + `email_digest` rows: **13** dated; **2** projected (`Slicing Pie…` from `discovery_email`, `Owen Pirch Live…` from `email_digest`).
- 3 historical `creator_calendar_items` with `source_record_type='newsletter_occurrence'`. New projection **does not collect** that type (`collectInventoryCandidates` is `content_item` + `event_starts_at`; curator leads are separate).

### 11–12. Does discoveries@ feed the same `content_items` Calendar now reads?

**Same table, wrong shape.**

Calendar reads `content_items.event_starts_at`.

Live discoveries@ writes `content_items` with `ingest=discovery_email|email_digest`, `type=industry_insight`, usually **`event_starts_at` NULL**.

The newsletter extractor that *can* write dated occurrences is gated off.

Historical newsletter calendar rows use `source_record_type='newsletter_occurrence'`, which the new projector does not scan.

**Disconnect:** discoveries@ → one undated insight card (or skip) ≠ Calendar’s dated `content_item` projection.

---

## Sampled emails (20)

Times are America/Chicago. `CI` = durable `content_items` from intake or digest harvest. Bodies are not dumped; excerpts only where they explain a gate.

| # | Received | Sender | Subject | Gmail / Benson ids | Intake | Intent | Body / links | Extract | Durable | Discover | Calendar | Telegram | Operator destination |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 2026-08-13 10:00 | Visit KC | This Weekend in KC: 816 Day and Timeless Mucha | gmail `19ffba35fde0bb17` / dem `db1fdf41-…` | yes | `discovery_other` → **skipped** | 6916 chars / 30 urls. Excerpt: “Top events happening in Kansas City, Aug. 14-16” | 0 events, 0 businesses | Digest harvest `8400da15-…` ingest=`email_digest` topic “Top Events Happening in Kansas City, Aug. 14-16” **no date** | Possible generic card (`creator_candidate`); not a dated event | **No** (no `event_starts_at`). 816 Day on Calendar is scrape/watchlist | sent; digest intent `discovery_other` | Telegram + undated inventory blob. **Useful events lost before dated persist** |
| 2 | 2026-08-13 18:02 | The Pitch | Calendar: Mammoth Presents: Final Summer shows — Grab tickets… | `19ffd5d1d56aa09b` / `c861e472-…` | yes | `discovery_other` → **skipped** | 3244 / 18. “late-summer and early-fall calendar” | 0 | Digest `dfc272af-…` “Kansas City Late Summer and Early Fall Music Events” **no date**, `hidden_raw_signal` | **quarantined** (`hidden_raw_signal`) | No | sent | Telegram only for operator-useful events. Multi-show list collapsed then hidden |
| 3 | 2026-08-13 15:31 | Kansas City Magazine | Weekend events + where to score fresh kicks | `19ffcd2873e2375f` / `eaa8d348-…` | yes | `discovery_other` → **skipped** | 2620 / 29. “Twelve things to do in KC this weekend” | 0 | Digest `ecb2ce2e-…` “Twelve things to do in KC this weekend” **no date** | Generic card possible | No | sent | `\bevent\b` does **not** match “events” → other → skip. Digest one blob |
| 4 | 2026-08-13 13:48 | KC Zoo | Melon Summer Smash Coming Saturday! | `19ffc7407cb8a9f0` / `dc9a796b-…` | yes | `discovery_opportunity` → processed | 6093 / 30. “9:30 am to 5 pm on Saturday, August 15” + two more dated events | 0 structured events; 1 generic item | `a7d2d884-…` ingest=`discovery_email` “Upcoming Events at Kansas City Zoo” **no date** `creator_candidate` | May show generic zoo card | **No** — date is in hook text, not `event_starts_at` | sent | Persisted but **hidden from Calendar**. Should have been 3 dated occurrences |
| 5 | 2026-08-14 06:28 | Axios KC | 🎉 816 Day parties | `1a00007d36563f39` / `116c70fe-…` | yes | `discovery_opportunity` → **duplicate** | 196 chars (HTML-poor) / 30 urls | 0 | `content_item_id` **and** `duplicate_of` **NULL** | none | No | sent | Useful subject, **orphan duplicate**. 816 Day Calendar rows are not this email |
| 6 | 2026-08-14 05:08 | KC Daily | Don't Worry, Bee Happy | `19fffbf225bacee7` / `1115aef4-…` | yes | opportunity → **duplicate** | 10334 / 30 | 0 | orphan duplicate | none | No | sent | Local Friday roundup lost at subject/URL dedupe |
| 7 | 2026-08-14 09:48 | KCtoday | KCPS renovation… Luke Combs coming, Chiefs vs. Rams… | `1a000bf1664eec04` / `39f27ab4-…` | yes | opportunity → **duplicate** | **199 chars** / 30 urls | 0 | orphan | none | No | sent | Body almost empty; digest intent `discovery_marketing` |
| 8 | 2026-08-14 16:00 | Laila Lounge | Laila turns one !! | `1a00213ccc404211` / `d4eaaf2c-…` | yes | **`discovery_subscription_welcome` → skipped** | 1870 / 18. “On Friday, August 14th, we invite” + posh.vip event URL | 0 | none | none | No | **not sent** (prior 8/12 copy was Telegram’d) | Dated anniversary event killed by `\bwelcome\b` in template. **Should have produced a Calendar event** |
| 9 | 2026-08-06 10:26 | Kauffman Center | Presales: Classic Albums Live: The Eagles… | (latest Kauffman in window) | yes | **welcome → skipped** | 6950 / 13 | 0 | none | none | No | sent | Ticketed dated shows never extracted |
| 10 | 2026-08-14 12:51 | Marshalls | EARLY ACCESS ISN’T GONNA LAST | `1a00166c5386f07c` / `2bd381ad-…` | yes | **`discovery_subscription_confirmation`** → `confirmation_manual` | 5078 / 30. Preheader “Be the first to save…” | 0 (confirmation path) | none; linked sub `f7d9f729-…` still `manual_action_required` | none | No | sent (digest intent `discovery_other`) | Routine national promo. **Correct to produce nothing useful.** Mis-labeled as confirmation because footer matches `CONFIRMATION_PATTERNS` |
| 11 | 2026-08-14 07:16 | TJ Maxx | These Runway finds are so you | `1a00033d1282b61f` / `104b712c-…` | yes | confirmation_manual | 5057 / 30. “Save 20-50%” | 0 | none | none | No | sent | Routine promo. Correctly no Calendar/Discover event. Wrong confirmation bucket |
| 12 | 2026-08-14 10:01 | Urban Planet | Denim done differently | `1a000ca8de641758` / `bf8b46b4-…` | yes | welcome → skipped | 6256 / 30 | 0 | none | none | No | sent (digest `discovery_marketing`) | Routine retail. Correctly nothing. Welcome false-positive |
| 13 | 2026-08-13 09:07 | Jack Stack | Three Best Sellers 15% OFF | `19ffb731cba52ad0` / `a93f2a0c-…` | yes | opportunity → processed | 2880 / 23 | 1 generic promo | `a608f042-…` “Jack Stack BBQ Offers 15% Off Best Sellers” **no date** `creator_candidate` | May surface as food promo | No | sent | **Routine promo persisted**, not suppressed. Not a Calendar event |
| 14 | 2026-08-09 06:53 | THE ReSALE SHOP | ESTATE JEWELRY DEBUT! CORRECTED DATES! | `19fe65ea69b055de` / `ece654ea-…` | yes | opportunity → processed | 2484 / 8. “Monday 8/10 … Saturday 8/15, 11 am - 2 pm” | 0 persisted | **no CI** (processed, ids null). Digest `promoted_opportunity` also null | none | No | sent | **Significant dated in-person sale lost before persist** |
| 15 | 2026-08-14 00:00 | Plato’s Closet OP | Reminder: Back to School Shopping Starts NOW! | `19ffea4b826e6954` / `f046f46d-…` | yes | opportunity → processed | 1537 / 6. “Our Next Back to School Event is Saturday!” | 0 persisted | **no CI** | none | No | sent | Local Saturday retail event lost at persist |
| 16 | 2026-08-14 06:54 | KCUR Early Bird | KC ends a construction equality program | `1a0002004fcbc2ca` / `032d1fa6-…` | yes | opportunity → processed | 8114 / 30 | 1 news item | `9ab49fb7-…` news title, `hidden_raw_signal`, hook also mentions “How KC Created the Bomb Pop” Aug 31 **not dated on row** | **quarantined** | No | sent | Civic news correctly should not be Calendar. Buried dated mention not extracted |
| 17 | 2026-08-14 07:02 | Made in KC | Kansas City's Time to Shine! | `1a000276b728ff9b` / `1c3b55fd-…` | yes | `discovery_other` → skipped | 1529 / 27 | 0 | none | none | No | sent | Local retail newsletter; no event token → other. July backfill of this sender **did** extract 12–14 entities |
| 18 | 2026-08-14 09:02 | Vine Street | The Liquid Speaks: Jazzman hits a 94 | `1a00095595758ca7` / `dd35ab2a-…` | yes | **marketing → skipped** | 3666 / 12 | 0 on intake | Digest `cd66f73a-…` beer-score story, no date | Generic brewery card possible | No (a **different** Vine Street show, Owen Pirch, is on Calendar from an earlier digest) | sent | Marketing skip; harvest created a score article, not an event |
| 19 | 2026-08-14 09:46 | WyCo Vintage | Drop 474: your early access is NOW! | `1a000bd4e5f1c80a` / `6659e8f4-…` | yes | other → skipped | 427 / 3 | 0 | none | none | No | sent | Routine drop email. Correctly nothing |
| 20 | 2026-08-09 07:36 | KC Defender | Black Media Matters Now More Than Ever | `19fe68668e06e4e0` / `df7e0f9a-…` | yes | welcome → skipped | 201 / 13 | 0 | none | none | No | sent | Fundraising/news. Correctly nothing |

---

## Event extraction outcomes

Live extractor for opportunity mail is `extractIntakeSubmission()` (`intake/openai-extract.ts`), **one object**, `extracted_date` optional ISO.

| Sample emails with real dated KC events in the body | Structured event candidates | Dated `content_items` | Notes |
|---|---|---|---|
| 1 Visit KC weekend guide | 0 (skipped) then 1 undated blob | 0 | Multi-event newsletter treated as one article |
| 2 Pitch Calendar shows | 0 then 1 undated blob | 0 | |
| 3 KC Mag twelve things | 0 then 1 undated blob | 0 | “events” ≠ `\bevent\b` |
| 4 Zoo Melon Smash + 2 more | 1 generic | 0 | Dates in `hook` only |
| 5 Axios 816 Day | 0 | 0 | Orphan duplicate |
| 8 Laila Aug 14 | 0 | 0 | Welcome skip |
| 9 Kauffman presales | 0 | 0 | Welcome skip |
| 14 BoostKC estate jewelry windows | 0 | 0 | Persist miss |
| 15 Plato Saturday event | 0 | 0 | Persist miss |

`extractNewsletterItems()` (multi-event) was **not invoked** for any of these 20 (`newsletter_category` NULL, `entities_extracted=0`).

July 26–28 backfill **did** invoke it on 35 emails (e.g. Pitch AMERI'KANA, Downtown KC Connects, Independence Today). Those rows show `entities_extracted` 1–14 and `occurrences_extracted` up to 8. Of 291 newsletter `opportunityLayer=occurrence` rows in inventory, **290 have `event_starts_at` NULL** and `occurrenceType` NULL. Extraction created occurrence **rows** without writing dates onto the Calendar authority column.

---

## Calendar outcomes

Projection rule (do not change): `population/sync.ts` `collectInventoryCandidates` — `event_starts_at` in window, then `evaluateInventoryCalendarEligibility`.

For every sampled newsletter that contained a real future/current KC event:

| Email | Durable dated event from **this** email? | Why Calendar does / doesn’t show it |
|---|---|---|
| Visit KC 816 Day / Mucha | **No** | Lost at `discovery_other` skip; digest blob has no `event_starts_at`. Mucha/816 cards on Calendar are `scrape_listing` / watchlist |
| Pitch Mammoth shows | **No** | Skip + undated hidden blob |
| KC Mag twelve things | **No** | Skip + undated blob |
| Zoo Melon Smash Aug 15 | **No** | Row exists; `event_starts_at` NULL. Eligibility never runs |
| Axios 816 Day | **No** | Orphan duplicate |
| Laila Aug 14 | **No** | Welcome skip; never persisted |
| Kauffman presales | **No** | Welcome skip |
| BoostKC jewelry dates | **No** | Processed, no row |
| Plato Saturday | **No** | Processed, no row |

Not “Calendar hid them.” **They never became dated `content_items`.**

The two email-origin Calendar rows that *do* exist (`Slicing Pie…` `population_source=discovery_email`, `Owen Pirch Live…` `email_digest`) show the architecture **works when `event_starts_at` is set**.

---

## Discover outcomes

`evaluateDiscoverEligibility()` (`inventory/discover-eligibility.ts`):

- `hidden_raw_signal` → `quarantined` (Pitch Calendar blob, KCUR news).
- `creator_candidate` + KC location + ingest provenance can be **eligible as a generic card** (Visit KC blob, Zoo “Upcoming Events”, Jack Stack 15% off).
- Eligibility does **not** require `event_starts_at`. So Discover can show a mushy newsletter card while Calendar shows nothing.
- Skipped / orphan emails have **no inventory row** → not hidden; **absent**.

This is the “persisted but not useful” case, not a Calendar-style date gate.

---

## Sale / promo behavior

| Kind | What happens today |
|---|---|
| Routine national `% off` (Marshalls, TJ Maxx, Urban Planet) | Often confirmation/welcome skip. Telegram still fires. **No Sales object.** Correctly not Calendar. |
| Routine local `% off` (Jack Stack 15% + free shipping) | **Persisted** as `creator_candidate` food promo. Not suppressed. |
| Significant dated sale (BoostKC estate jewelry windows; Plato Saturday drop) | Classified opportunity, then **lost at persist** (no CI). |
| Newsletter `MEANINGFUL_SALE` / prefilter `percent_off_offer` | Code exists; **not on live discoveries@ path**. |

**No suitable durable “Major Sales” model is being written from email today.** Adjacent inventory categories (`estate_sale`, `warehouse_sale`, `liquidation_sale`, `deal`) exist for other ingest. Do not stuff these onto Calendar.

---

## Telegram comparison

Telegram **does not wait** for newsletter extraction or `event_starts_at`.

| | Telegram | Durable discovery/event |
|---|---|---|
| Worker | `gmail-inbox-digest` ~45 min | `gmail-discovery-sync` ~15 min |
| Query | unread Primary+Promotions (plus other aliases) | discoveries@ last 7d |
| Classifier input | headers + **snippet** | headers + **full body** |
| Success condition | `sendTelegramMessage` | `content_items.event_starts_at` + eligibility |
| Sample | 18/20 sent (Laila latest unread-cleared) | 0/9 useful event emails became Calendar rows |

Why Benson is “comfortable” Telegram-notifying: `runGmailTelegramDigest()` groups by `emailCategory` (`discovery`) and sends `Benson · discovery inbox (N new)` from subject/snippet. It records `gmail_digest_messages` regardless of skip/extract/persist.

`tryAutoHarvestDigestMessage` sometimes creates an `email_digest` card **after** Telegram, still usually undated. Telegram is **upstream of structured intelligence**, not proof that intelligence was stored.

---

## Failure counts

### Last 16 days (308 discoveries@ emails)

| Metric | Count |
|---|---|
| Intake saw email (`discovery_email_messages`) | 308 |
| Telegram notified | 305 |
| Intent skipped (welcome/marketing/other) | 160 |
| Opportunity | 91 |
| Opportunity → processed + CI | 47 |
| Opportunity → processed, **no CI** | 15 |
| Duplicate orphans (no CI, no duplicate_of) | 28 |
| Linked `content_item_id` | 48 |
| Newsletter pipeline invoked (`newsletter_category` set) | 0 |

### This sample (20)

| Metric | Count |
|---|---|
| Emails sampled | 20 |
| Intake succeeded (row created) | 20 |
| Useful event-bearing emails | 9 (#1–5, #8–9, #14–15) |
| Event candidates extracted (structured multi-item) | **0** |
| Durable **dated** events created from those emails | **0** |
| Calendar eligible from those emails | **0** |
| Discover-eligible generic cards (not dated events) | ~3–4 (#1, #4, #13, maybe #18) |
| Telegram notified | 18 |
| Useful items lost **before** persist | 8 (#1–3, #5, #8–9, #14–15) |
| Useful items persisted but **unusable on Calendar** | 2 (#1 digest blob, #4 zoo) |
| Routine promos correctly no Calendar | 4 (#10–12, #19) |
| Routine promo incorrectly persisted as opportunity | 1 (#13 Jack Stack) |
| Significant sales incorrectly suppressed / lost | 2 (#14 BoostKC, #15 Plato) |
| Correctly nothing (news/fundraising/drop) | 3 (#16, #20, #19) |

### Inventory backdrop (not this week’s live path)

| Metric | Count |
|---|---|
| `newsletter_intelligence` content_items | 740 |
| … with `event_starts_at` | 1 |
| `discovery_email` + `email_digest` | 195 |
| … with `event_starts_at` | 13 |
| … future-dated | 3 |
| Calendar rows from those dated email items | 2 |
| Historical `newsletter_occurrence` calendar rows | 3 |
| `discovery_subscriptions` active/verified | **0 / 88** |
| `newsletter_sources` status=enabled | 41 (unused by live gate) |

---

## Concrete root causes

1. **`classifyDiscoveryIntent()` is a hard stop for most newsletters.** `processDiscoveryEmailMessage` skips `discovery_subscription_welcome`, `discovery_marketing`, and `discovery_other` with no extraction. Last 16 days: **160/308** emails die here. Visit KC weekend guide, Pitch “Calendar: … shows”, KC Mag “Weekend events”, Laila anniversary, Kauffman presales all hit this gate. `\bevent\b` does not match “events”; `\bnewsletter\b` is a **marketing** pattern (only reached if opportunity patterns miss).

2. **`findActiveSubscriptionForSender()` never succeeds in production.** 88/88 subscriptions are `manual_action_required`. `processNewsletterEmailRouted()` / `extractNewsletterItems()` therefore **never run** on live cron. 41 `newsletter_sources` are `enabled` and are ignored by this gate.

3. **Fallback persist is one undated `industry_insight`.** `ingestEmailMessageAsOpportunity()` → `extractIntakeSubmission()` emits a single title. Zoo (3 dated events) → “Upcoming Events at Kansas City Zoo” with `event_starts_at` NULL even though the hook names August 15. Calendar `collectInventoryCandidates` then **cannot see the row**.

4. **`persistIngestedContentItem()` URL-dedupe drops the id.** On `sourceUrl` collision it returns `'updated'` without the existing id. `email-ingest.ts` re-queries by `sourceExternalId` (the new id), finds nothing, returns `contentItemId=undefined`, `skipped=true`. Discovery row becomes `duplicate`/`processed` with **null** CI. Last 16 days: **28 orphan duplicates + 15 processed-without-CI**. First newsletter URL is often a shared tracking link.

5. **Telegram is a parallel snippet digest, not a persistence signal.** `runGmailTelegramDigest()` + `formatTelegramDigestBody('discovery')` explains operator-visible Telegram without Calendar/Discover intelligence.

6. **Historical newsletter inventory is the wrong shape for the new Calendar projector.** 739/740 `newsletter_intelligence` rows lack `event_starts_at`. Three July calendar suggestions use `source_record_type='newsletter_occurrence'`, which `collectInventoryCandidates` does not load.

---

## Smallest recommended next fix (do not implement)

**Stop using `classifyDiscoveryIntent()` welcome/marketing/other as a terminal skip on discoveries@, and call `processNewsletterEmail()` when `newsletter_sources.status='enabled'` for the sender domain (41 rows already exist) — do not require `discovery_subscriptions.status ∈ {verified,active}`.**

That is the smallest change that reconnects mail Benson already stores (`discovery_email_messages.body_text` + urls) to the only extractor that emits multiple dated occurrences (`extractNewsletterItems` → `persistNewsletterInventoryItem` → `event_starts_at`). Calendar projection can then see those rows without a Calendar rewrite.

Do **not** start with Telegram, Gmail labels, or a Sales surface. Do **not** loosen Calendar eligibility until dated rows exist.

Optional one-line companion if that fix is deferred: treat `\bevents?\b` as opportunity and stop matching `\bnewsletter\b` as skip-to-marketing — still insufficient without the newsletter persist path.

---

## Files / functions involved

| File | Functions |
|---|---|
| `services/workers/src/workflows/gmail-discovery-sync.ts` | `gmailDiscoverySyncWorker` |
| `services/workers/src/workflows/gmail-inbox-digest.ts` | `gmailInboxDigestWorker` |
| `services/core/src/gmail-inbox/discovery-process.ts` | `processDiscoveryEmailMessage`, `processOpportunityDiscoveryEmail` |
| `services/core/src/gmail-inbox/email-category.ts` | `classifyDiscoveryIntent`, `classifyInboundEmail`, `formatTelegramDigestBody` |
| `services/core/src/gmail-inbox/resolve-channel.ts` | `resolveInboundChannelFromHeaders`, `isDiscoveryEmail` |
| `services/core/src/gmail-inbox/email-ingest.ts` | `ingestEmailMessageAsOpportunity` |
| `services/core/src/gmail-inbox/digest.ts` | `runGmailTelegramDigest`, `classifySummaries` |
| `services/core/src/gmail-inbox/digest-query.ts` | `buildDigestUnreadQuery` |
| `services/core/src/gmail-inbox/digest-promote.ts` | `tryAutoHarvestDigestMessage`, `promoteDigestToOpportunity` |
| `services/core/src/gmail-inbox/message-parse.ts` | `fetchDiscoveryMessage` |
| `services/core/src/discovery-subscriptions/store.ts` | `findActiveSubscriptionForSender` |
| `services/core/src/newsletter-intelligence/pipeline-router.ts` | `processNewsletterEmailRouted`, `resolveNewsletterPipelineMode` |
| `services/core/src/newsletter-intelligence/pipeline.ts` | `processNewsletterEmail` |
| `services/core/src/newsletter-intelligence/extract.ts` | `extractNewsletterItems` |
| `services/core/src/newsletter-intelligence/classify.ts` | `classifyNewsletterEmail`, `isProcessableNewsletterCategory` |
| `services/core/src/newsletter-intelligence/quality-gates.ts` | `evaluateNewsletterItem` |
| `services/core/src/newsletter-intelligence/persist.ts` | `persistNewsletterInventoryItem` |
| `services/core/src/newsletter-intelligence/prefilter.ts` | `prefilterNewsletterEmail` (unused live) |
| `services/core/src/newsletter-intelligence/opportunity-promote.ts` | `scoreOpportunityCandidate`, `MEANINGFUL_SALE` (unused live) |
| `services/core/src/newsletter-intelligence/live-persist-approved.ts` | historical July persist / `newsletter_occurrence` calendar writes |
| `services/core/src/intake/openai-extract.ts` | `extractIntakeSubmission` |
| `services/core/src/scanner/ingest-persist.ts` | `persistIngestedContentItem` |
| `services/core/src/green-screen/duplicates.ts` | `findDuplicateBySubjectTitle` |
| `services/core/src/creator-calendar/population/sync.ts` | `collectInventoryCandidates` |
| `services/core/src/creator-calendar/population/eligibility.ts` | `evaluateInventoryCalendarEligibility`, `whyIncludedForInventory` |
| `services/core/src/inventory/discover-eligibility.ts` | `evaluateDiscoverEligibility` |

---

DISCOVERIES EMAIL PIPELINE AUDIT COMPLETE
NO PRODUCT CHANGES MADE
