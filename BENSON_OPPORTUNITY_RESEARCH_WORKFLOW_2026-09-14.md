# Benson Opportunity Research Workflow — 2026-09-14

**Branch:** `release/scout-expansion-2026-07-25`  
**Public:** https://benson.kckellie.com · **API:** https://api.kckellie.com  
**Host:** mappy  

**Prior discovery MATCH:** `893f75d8e3511427`  
**Opportunity:** Veronica Beard — Business Opening · Country Club Plaza  
**Opportunity ID:** `1315fdc4-0d60-44bb-a9a0-3e3fb5f74902`  
**Source message ID:** `1a07db8316ee1368`

---

## Verdict

“Research this” is now a **complete, source-backed opportunity dossier workflow** — staged public research, ranked contacts, programs, citations, Contact business gating, and Opportunities UI — with **no auto-outreach** and **no fabricated emails**. Live Veronica Beard research produced an actionable dossier (official contact form, store phone lead, address, hours, socials, opening date, next action).

| Field | Value |
|---|---|
| Final MATCH | **`f772fc9fea395fc7`** |
| First research run ID | `28213cc6-7bdb-4289-a3cc-37bf5eddb2c0` |
| Second research run ID | `031c089a-ed2a-447c-8426-a6594db46d71` |
| Post-MATCH research run ID | `517bbe66-7a33-4a25-993b-740e79139ee2` |
| Opportunity ID | `1315fdc4-0d60-44bb-a9a0-3e3fb5f74902` |
| Auto outreach | **false** |
| Second-run duplicate contacts avoided | **1** (single merged contact retained) |

---

## Prior Research this behavior

Discoveries “Research this” queued `creator_research_jobs` and ran shallow `runBusinessEnrichment` (one web search + LLM field extract + assistance package). Editorial opportunities kept `contactDiscovery: not_started` at create time. Opportunities list had **no detail page** and no dossier. Contact business could open without research.

## Root cause of incomplete enrichment

Discovery created reviewable opportunities, but enrichment stopped at headline/visit assistance. There was no staged contact/program research, no claim labels/citations dossier, no Contact business gate requiring research, and no Opportunities detail surface for “Research this.”

---

## What shipped

Reusable module: `services/core/src/opportunity-research/`

| Concern | Implementation |
|---|---|
| Tracked run | `researchRunId`, stages 1–15, progress on job + dossier |
| Sources | Bounded web search + article fetch (robots/paywall respected) |
| Business facts | Official name, website, address, phone, hours, socials, opening — claim labels + citations |
| Contacts | Full schema; reject email guesses / private personal; retain forms/phones honestly |
| Ranking | Tiers 1–8 with explicit reasons |
| Programs | Creator vs affiliate separated; third-party affiliate listings unverified |
| Fit | Explicit dimension ratings + reasons (not a single mysterious score) |
| Content ideas | Concept / access / effort / permission / timing |
| Outreach prep | Draft + ranked contacts; `autoSend: false`; user approval required |
| Persistence | `content_items.metadata.opportunityResearch`; merge contacts; audit history |
| UI | `/opportunities/[id]` dossier; Discoveries dossier panel; Contact business Research-first gate |
| API | `/api/opportunity-research/:id`, `/research`, `/research/sync`, `/contact-gate` |

Wired into existing `runResearchJob` for editorial / business-opening opportunities (extends creator-interest; does not fork Calendar / Watchlist / IG paths).

---

## Research-source hierarchy

1. Official first-party pages (brand site, store locator, press/contact forms)
2. Monitored email + linked article provenance (stripped tracking)
3. Credible local news coverage (facts only)
4. Directories (phone/hours) — **partially verified / unverified lead**, never preferred over conflicting official data

Paywalls / login / CAPTCHA / robots → stage `blocked` or `authentication_required` — never bypassed.

## Contact-verification rules

- Never guess emails from naming patterns
- Never mark inferred emails verified
- Never collect private personal webmail / residential contacts
- Contact form or store phone alone is saved honestly
- “Contact found” ≠ “contact verified”

---

## Veronica Beard live results

### Business details found

| Field | Value | Label |
|---|---|---|
| Official name | Veronica Beard | partially_verified |
| Website | https://www.veronicabeard.com | partially_verified |
| Contact / press form | https://veronicabeard.com/pages/contact-us | partially_verified |
| Address | 4747 Broadway Boulevard (Plaza) | partially_verified |
| Phone | (816) 203-2338 | unverified_lead (directory-sourced; confirm on official) |
| Hours | Mon–Sat 10–7, Sun 12–6 | unverified_lead |
| Socials | Instagram + Facebook official accounts | partially_verified |
| Opening | 2026-09-03 | partially_verified (editorial provenance) |
| Local location page | not found | not_found |
| Creator / affiliate program | not confirmed on official sources | not_found / absent |

### Contacts (with evidence)

| Rank | Contact | Path | Evidence |
|---|---|---|---|
| #6 | Press / contact form | https://veronicabeard.com/pages/contact-us (+ store phone lead) | Official contact page |

No corporate PR email published in research evidence — **not fabricated**.

### Programs

- Creator / influencer / ambassador: **not found** on official sources
- Affiliate: none confirmed as official (third-party-only claims would remain unverified leads)

### Content recommendations

Store-opening spotlight; What’s new at the Plaza; first impressions / styling session (permission advised) — with access, effort, timing.

### Missing / blocked

- Dedicated store location page not confirmed
- Official creator/affiliate program not confirmed
- Corporate PR email not found
- PR agency not found
- Phone/hours remain directory leads until first-party confirmation

### Next action

Use the official contact/press form after human review — do not invent an email.

---

## Freshness / dedupe

| Run | ID | Result |
|---|---|---|
| First | `28213cc6-7bdb-4289-a3cc-37bf5eddb2c0` | Dossier persisted; outreachSent=false |
| Second | `031c089a-ed2a-447c-8426-a6594db46d71` | 1 contact retained; duplicateContactsAvoided=1; createdOpportunity=false |
| Post-MATCH | `517bbe66-7a33-4a25-993b-740e79139ee2` | Homepage website + form contact; dup merge; outreachSent=false |

Audit history retained across runs. Telegram not fired for research refresh without meaningful new actionable alert policy.

---

## Contact business gate

After research: **ready=true**, ranked contact IDs present, draft prepared, **requiresApproval=true**.  
Before research: offers **Research first** (no blank generic outreach).

---

## Tests

`services/core/src/opportunity-research/opportunity-research.test.ts` — **23 passing** (22 required + Research-first gate).

Editorial opportunity suite remains green (22). Deploy stabilization suites green.

---

## Files changed

- `services/core/src/opportunity-research/**` — workflow core
- `services/core/src/creator-interest/actions.ts` — Research this → dossier for editorial openings; refreshable research
- `services/api/src/routes/opportunity-research.ts` + `server.ts`
- `dashboard/app/opportunities/[id]/**` — Research this + dossier
- `dashboard/components/opportunity-research-dossier.tsx`
- `dashboard/app/discoveries/...` — dossier + Contact business gate
- `dashboard/components/opportunity-command-card.tsx` — Research first when incomplete

Preserved: editorial classifier, Calendar separation, Watchlist, IG repairs.

---

## Commits

1. `632e99a` — Upgrade Research this into a source-backed opportunity dossier workflow  
2. `ba860cf` — Harden opportunity research extraction from web summaries  
3. `7af7e54` — Prefer brand homepage over contact paths as official website  

---

## Deploy / MATCH

**Final fingerprint: MATCH `f772fc9fea395fc7`**

API excerpts: `/tmp/vb-research-run1.json`, `/tmp/vb-research-run2.json`, `/tmp/vb-research-final.json`  
UI: `/opportunities/1315fdc4-0d60-44bb-a9a0-3e3fb5f74902` (HTTP 200)  
Contact gate: ready=true, requiresApproval=true, draft present

---

## Remaining limitations

- Store phone/hours often arrive via directories → labeled unverified_lead until first-party confirmation
- Official creator/affiliate pages frequently absent; honesty preferred over invention
- Website field may still surface contact-path URLs when homepage is not cited in summaries (homepage preference shipped in `7af7e54`; post-MATCH run resolved `https://www.veronicabeard.com`)
- Async Research this job progress is polled; sync endpoint used for acceptance proof
- No automatic PR-agency discovery beyond public web evidence

---

## Success criteria

**Met:** Deployed Research this turns Veronica Beard into an actionable, source-backed dossier with contacts (official form + phone lead), citations, ranked next steps, Contact business gating, no outreach sent, and second-run contact merge without duplicates.
