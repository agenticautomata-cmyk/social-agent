# Benson Editorial Email Opportunity Discovery — 2026-09-14

**Branch:** `release/scout-expansion-2026-07-25`  
**Commits:** `b6374cf` → `be6fa52` (final)  
**Deploy fingerprint:** **MATCH `893f75d8e3511427`**  
**Public:** https://benson.kckellie.com · **API:** https://api.kckellie.com  

---

## Verdict

The monitored KCinsiders email that was previously skipped as `transactional_email` now creates a **reviewable creator/business opportunity** for Veronica Beard in Benson Opportunities — not a Calendar event, with no auto-outreach and no fabricated contacts.

| Field | Value |
|---|---|
| Gmail message ID | `1a07db8316ee1368` |
| Discovery email row | `d1c96a31-09df-4ba4-ae1c-390acf3dfab0` |
| Canonical opportunity ID | `1315fdc4-0d60-44bb-a9a0-3e3fb5f74902` |
| Final create run ID | `76f32e06-95e1-48df-83e6-e49783fb059a` |
| Final repeat run ID | `9665b887-24f4-4471-95fd-ecd6d5549645` (0 new logical opportunities) |
| MATCH | `893f75d8e3511427` |

---

## A. Diagnosis (exact production failure)

### Pipeline trace

1. **Acquisition** — Gmail discovery sync stored the message (`discovery_email_messages`).
2. **Sender** — `kcinsiders@substack.com` / Joyce Smith from KCinsiders.
3. **MIME/HTML** — Body text + Substack HTML chrome parsed; article URL present.
4. **Headline** — Subject retained: *Plaza Gets Another First-to-Market Luxury Retailer. But what’s The Clubhouse?*
5. **Article URL** — `https://kcinsiders.substack.com/p/plaza-gets-another-first-to-market` (+ Substack redirects).
6. **Classification** — `discovery_intent=discovery_opportunity` (correct), then newsletter category **`transactional_email`** (incorrect).
7. **Enrichment / opportunity / dedupe / dashboard** — never reached (early skip).
8. **Telegram** — inbox digest only; no opportunity-created alert.

### Precise skip reason

`processing_status=skipped`, `processing_error=transactional_email`, `newsletter_category=transactional_email`.

**Root cause:** `classifyNewsletterEmail` scanned raw `bodyHtml`. Substack templates include CSS/class chrome such as `email-receipt`, which matched `/\breceipt\b/i` and aborted the entire newsletter/opportunity path before extraction.

**Secondary systemic gap:** even when newsletter intelligence ran, success was defined almost exclusively as **dated Calendar occurrences** (`resolveDiscoveryOccurrenceOutcome`). Undated business openings could not count as successful opportunity processing.

---

## B–F. What shipped

Reusable module under `services/core/src/newsletter-intelligence/editorial-opportunity/`:

| Concern | Implementation |
|---|---|
| Classifier | Opening / first-to-market / coming soon / expansion / launch / etc. — **no brand/domain hard-coding**; influencer/PR keywords **not required** |
| Content types | Separated before persist (`business_opening_development`, `creator_business_opportunity`, `coming_soon`, `news_only`, …). Openings are **not** Calendar events (`calendarEligible: false`) |
| Quality fields | Business, development type, summary, location, dates when published, canonical URL, email source, evidence, why-it-matters, angles, next action, urgency, confidence, verification, contact-discovery status, dedupe identity |
| Article follow | Tracking strip + bounded public fetch; paywall/login → `subscription_required` / `blocked`; email evidence still sufficient |
| Multi-opp | One logical opportunity per supported business; shared article provenance; speculative headline-only names rejected |

Wired into live `processNewsletterEmail` (same path as scheduled discovery + manual reprocess API).

---

## G. Veronica Beard acceptance fields

| Expected | Observed |
|---|---|
| Business | Veronica Beard |
| Type | business opening / first-to-market signal in evidence |
| Location | Country Club Plaza, Kansas City metro |
| Development | Luxury women’s clothing/accessories store opened |
| Opened | **2026-09-03** (from email/article) |
| Address | **4747 Broadway** |
| Canonical URL | https://kcinsiders.substack.com/p/plaza-gets-another-first-to-market |
| Urgency | **timely** (recent opening remains actionable) |
| Status | `creator_candidate` / reviewable opportunity |
| Calendar | **not admitted** (`event_starts_at=null`, `calendarEligible=false`, 0 calendar links) |
| Auto outreach | **false** |
| Contact discovery | `not_started`, `emailsFound=[]`, `verified=false` |

Also extracted (article-supported, separate logical opportunities):

- **Reformation** — coming soon (415 Nichols)
- **SKIMS** — coming soon / build-out (Nichols)

---

## H. Contact / program research

Bounded policy stub only at create time: no guessed emails, no private PII scrape, contact found ≠ verified. Next action text instructs human review for official PR / creator / affiliate programs.

---

## I–K. Urgency, dedupe, Telegram

- Urgency states: urgent / timely / evergreen / stale / closed / needs_research.
- Dedupe identity: normalized business + location + development family + date (address/URL merge provenance, do not mint duplicates).
- Final repeat run: **0 created / 3 merged / 0 Telegram**.
- Telegram: notifies once only when `created=true` (first genuine logical opportunity); includes review link; no business outreach.

---

## L. Bounded historical backfill

| Metric | Count |
|---|---|
| Emails examined (signal-bearing) | 18 |
| Possible opportunities detected | 18 |
| Opportunities created | 2 |
| Rejected items | 19 |
| Blocked links | 0 |
| Sample recovered | GolfTRK; KCRep |

---

## M. Tests

`src/newsletter-intelligence/editorial-opportunity/editorial-opportunity.test.ts` — **all 20 acceptance regressions + transactional HTML chrome guards**.

Related suites run green (101 tests): editorial + classify + discovery-newsletter-route + calendar admission subset.

---

## N. Live verification

1. Deploy **MATCH `893f75d8e3511427`**
2. Reprocess gmail `1a07db8316ee1368` via production API `/api/newsletter-intelligence/editorial-opportunity/reprocess`
3. Veronica Beard opportunity present in Opportunities workflow (`content_items` ingest=`editorial_email_opportunity`, destination=`opportunity`)
4. Second run: **zero new logical opportunities**
5. Not on Calendar; no outreach sent
6. Article access: **fetched** (public Substack)

---

## O. Files changed

- `services/core/src/newsletter-intelligence/classify.ts` — transactional false-positive fix (plain text, not HTML chrome)
- `services/core/src/newsletter-intelligence/pipeline.ts` — editorial opportunity on live path
- `services/core/src/newsletter-intelligence/occurrence-outcome.ts` — opportunities count as processed
- `services/core/src/newsletter-intelligence/editorial-opportunity/**` — classifier, extract, article fetch, persist, telegram, reprocess, backfill, tests
- `services/core/src/scripts/reprocess-editorial-email-opportunity.ts`
- `services/api/src/routes/newsletter-intelligence.ts` — reprocess + backfill endpoints
- `services/core/package.json` — test glob

---

## Classifier / scoring rules (summary)

- Development signals from general phrases (opened, first-to-market, coming soon, grand opening, …).
- Persist only when content type is opportunity-class and local KC angle is plausible.
- Proper-noun name gate rejects sentence fragments (“A LV official even”, etc.).
- Recent openings stay **timely** after open day (not expired solely because doors opened).

---

## Limitations

- Evidence excerpts can still include Substack redirect URL noise; readable cleanup is a follow-up.
- Contact/program discovery is policy-gated and does not yet crawl official brand press pages automatically after create.
- Early live runs minted interim duplicate rows while dedupe identity was tightened; superseded rows were archived (`editorial_dedupe_canonicalize` / false-positive suppression). Stable identity is now business+location+type-family+date.
- Telegram for the first Veronica create fired during intermediate runs; final verification runs used `notifyTelegram:false` to avoid repeat noise after identity stabilization.

---

## Success criteria

**Met:** Real monitored email → evidence-backed Veronica Beard opportunity in deployed Benson Opportunities, MATCH deploy, repeat run zero dups, no Calendar force, no auto outreach.
