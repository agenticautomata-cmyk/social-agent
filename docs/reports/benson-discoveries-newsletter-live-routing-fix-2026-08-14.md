# Discoveries@ live newsletter intelligence routing — 2026-08-14

**Fingerprint:** `398687093463491b` (API / dashboard / workers **MATCH**)  
**Scope:** Live discoveries@ routing only. No Calendar, Telegram, Discover UI, Gmail, or historical backfill.

---

## What changed

Enabled `newsletter_sources` (`status='enabled'`) is now sufficient authority to run the **existing** newsletter intelligence pipeline. `discovery_subscriptions` verified/active is no longer required.

Coarse `classifyDiscoveryIntent()` welcome / marketing / other is **not** a terminal skip for those sources. Confirmation handling still runs when the intent is confirmation; enabled sources also continue into newsletter intelligence so footer “confirm / welcome / newsletter” cannot erase useful content.

Routine promo filtering uses existing `prefilterNewsletterEmail()` (now called from the legacy `processNewsletterEmail()` path) plus `evaluateNewsletterItem()`.

When the reused `extractNewsletterItems()` LLM omits dates, existing `normalizeExtractedEventDate` parsers recover title-local dates from the stored body and persist `event_starts_at` / `event_ends_at`. Reprocessing updates the undated sibling instead of creating a second occurrence.

---

## Routing rules

| Intent | Enabled newsletter source **or** active subscription | Otherwise |
|---|---|---|
| `discovery_subscription_confirmation` | confirmation **and** newsletter intelligence | confirmation only |
| `discovery_subscription_welcome` / `marketing` / `other` | newsletter intelligence | skip (unchanged) |
| `discovery_opportunity` | newsletter intelligence | single-item `ingestEmailMessageAsOpportunity` (unchanged) |

Lookup: `findEnabledNewsletterSourceForSender()` matches enabled `sender_email`, full domain, or root domain.

---

## Tests

`services/core/src/gmail-inbox/discovery-newsletter-route.test.ts` and `services/core/src/newsletter-intelligence/date-normalize.test.ts` (also in `benson-deploy-local`):

- enabled source bypasses inactive subscription
- random / non-enabled sender does not gain newsletter authority
- enabled-source welcome still routes to newsletter intelligence
- enabled-source marketing is not a terminal skip; prefilter can still reject `% off`
- “Weekend events” wording is `discovery_other` but still routes when enabled
- footer confirm on an enabled source is `confirmation_and_newsletter`
- multi-event items stay independent; dated items produce `event_starts_at`
- occurrence fingerprints are idempotent
- routine percent-off is prefilter-suppressed
- dated ReSALE Shop sale survives quality gates with start/end bounds
- title-local date recovery: Zoo multi-event, weekday slash sale window, Friday/Saturday concert day
- unrelated titles do not inherit the first date in the email

Deploy stabilization: **93 pass / 0 fail**.

---

## Deploy

| Check | Result |
|---|---|
| API `/health` | 200 |
| Dashboard `/` | 200 |
| Workers | `tsx src/benson.ts` running |
| Fingerprints | **MATCH** `398687093463491b` |

No historical backfill. No Telegram / Calendar / Discover / Gmail changes.

---

## Controlled smoke (4 stored emails only)

Used existing `discovery_email_messages` bodies. Called `processNewsletterEmailRouted()` (legacy). No Gmail refetch. No paid web research. Repeat pass created **0** new entities/occurrences.

| Class | Email | Enabled source? | Intent → route | Outcome |
|---|---|---|---|---|
| Event newsletter | Visit KC “This Weekend in KC: 816 Day and Timeless Mucha” | yes `visitkc.com` | `discovery_other` → **newsletter** | Pipeline ran. Multiple independent occurrences (Fan Festival, Sheryl Crow, All-American Rejects, Luke Bryan, marketplace, Jersey Party, Night Market). **Not** one weekend blob. Dated: Fan Festival `2026-08-14`, Sheryl Crow `2026-08-14`, All-American Rejects `2026-08-15`. |
| Multi-event newsletter | KC Zoo “Melon Summer Smash Coming Saturday!” | yes `fotzkc.org` | `discovery_opportunity` → **newsletter** | Independent dated rows: **Melon Summer Smash** `2026-08-15`, **Brew at the Zoo** `2026-10-10`, **A Pirate’s Feast at GloWild** `2026-09-12`–`2026-10-24`. **Not** “Upcoming Events at Kansas City Zoo”. |
| Routine promo | Urban Planet “Denim done differently” | yes `urban-planet.com` | `discovery_subscription_welcome` → **newsletter** (no terminal skip) | Existing prefilter skipped: `account_order_notice`. **0** items. |
| Significant sale | THE ReSALE SHOP “ESTATE JEWELRY DEBUT! CORRECTED DATES!” | yes `boostkc.org` | `discovery_opportunity` → **newsletter** | Durable **ESTATE JEWELRY DEBUT** with `event_starts_at=2026-08-10` and `event_ends_at=2026-08-15`. No Sales UI. Repeat pass updated the same row (0 new creates). |

Marshalls / TJ Maxx are **not** enabled newsletter sources. They correctly **do not** gain newsletter authority. Laila Lounge (`thelailalounge.com`) is also not enabled; welcome still skips until that source is enabled. Tests cover the welcome-bypass once enabled.

---

## Operator notes

- Do **not** backfill all 510 historical emails until a small dated-quality sample is reviewed.
- Calendar projection is unchanged and will pick up rows that now have `event_starts_at`.
- Telegram is unchanged (parallel snippet digest, not intelligence authority).

---

## Files

| File | Change |
|---|---|
| `gmail-inbox/discovery-newsletter-route.ts` | route authority |
| `gmail-inbox/discovery-process.ts` | use enabled source; no terminal skip |
| `gmail-inbox/discovery-newsletter-route.test.ts` | routing / persist-shape / promo tests |
| `newsletter-intelligence/sources.ts` | `findEnabledNewsletterSourceForSender` |
| `newsletter-intelligence/pipeline.ts` | treat enabled source as trusted; run existing prefilter; pass `emailSentAt` |
| `newsletter-intelligence/pipeline-router.ts` | pass `fromEnabledNewsletterSource` |
| `newsletter-intelligence/extract.ts` | reuse date-normalize on extracted/cached items |
| `newsletter-intelligence/date-normalize.ts` | title-local date recovery via existing parsers |
| `newsletter-intelligence/date-normalize.test.ts` | recovery fixtures |
| `newsletter-intelligence/persist.ts` | export bounds helper; update undated sibling with dates |
| `scripts/benson-deploy-local.sh` | include new tests |

---

DISCOVERIES NEWSLETTER INTELLIGENCE LIVE
BENSON LEFT HEALTHY
STOP.
