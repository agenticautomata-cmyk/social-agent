# KC PR / Affiliate Directory → Benson Contact Intelligence

**Workbook:** `Kansas_City_PR_Affiliate_Directory.xlsx`  
**Checked:** 2026-09-08 (stated on sheet; no inferred emails)  
**Fixture:** `docs/ops/fixtures/kc-pr-affiliate-directory-2026-09-08.json`  
**Owner lane:** data/import

This is the exact field mapping for both sheets. Import code lives under
`services/core/src/contact-intelligence/import/`.

---

## Sheets

| Sheet | Rows (data) | Purpose |
|-------|-------------|---------|
| Outreach Directory | 48 contacts / 44 establishments | Named people, role inboxes, phones, forms, affiliate apps |
| Programs | 10 | Creator/affiliate/media-access/hosted-visit routes |
| Read Me | (ops guidance) | Priority order + refresh cadence 60–90 days — not imported as entities |

---

## Outreach Directory → Benson concepts

| Workbook column | Benson concept / field | Notes |
|-----------------|------------------------|-------|
| Establishment | **business** (`businessName`) + org alias key | Multi-row same establishment = one business, multiple contact rows |
| Category | `category` | Free text; keep as-is (Destination / tourism, Hotel, …) |
| Area | provenance `geoArea` (notes/import block) | Not a first-class column today — see handoff |
| Contact | **contact** (`contactName`) | Null = role/desk only |
| Title / Desk | `contactRole` | Role inbox label when no person |
| Email | email channel | Classified via Route Type → evidence state (proposed) |
| Phone | `phone` / `contactPhonePublic` | Prefer `contactPhonePublic` when route is media phone |
| Route Type | delivery / evidence class | See route map below |
| Best Use | provenance `bestUse` + notes | Guides recommendation, not send |
| Confidence | **workbook confidence** (imported evidence) | High/Medium — **not** permanent verification |
| Source URL | `evidenceUrl` + provenance | Official page that published the contact |
| Notes | `notes` (operator) + provenance `workbookNotes` | Append; never wipe unrelated notes |

### Route Type → evidence / channel mapping

| Route Type (workbook) | Channel concept | Proposed `contactEvidenceState` | `nextContactPath` |
|----------------------|-----------------|----------------------------------|-------------------|
| Direct media/PR/marketing/press/publicity/communications/content/business media email | **role inbox** or **named decision maker** | Named Contact → `verified_named_decision_maker`; else role local-part → `verified_role_inbox`; else `official_general_inbox` | — |
| Media email / Corporate media/PR/press / Association email | role or general inbox | local-part heuristic | — |
| General public / Management / General business email | **general inbox** | `official_general_inbox` | — |
| Official contact page / Official media form / Influencer email / form | **form** | `official_contact_form` | `official_contact_form` |
| Application / Affiliate application / Partner page | **affiliate / creator program application** | `official_contact_form` (path) + link Programs row | `official_contact_form` |
| Staff page / general phone / Direct media phone | **phone** | `unknown` if no email | `phone` |
| Official leadership page (no email) | needs research | `unknown` | `named_person_needs_research` |

**Hard rule:** workbook Confidence is stored as import provenance. It must not silently become permanent verification after freshness expiry (60–90 days per Read Me). Discovery lane owns recheck.

**Send-gate coordination (do not unilaterally change):** today `verified_*` / `official_general_inbox` are emailable. Primary should decide whether `verificationMethod = workbook_import` requires a freshness gate before send. See handoff.

---

## Programs → Benson concepts

| Workbook column | Benson concept | Notes |
|-----------------|----------------|-------|
| Program | program name (`programLibrary.programName`) | |
| Type | program kind | Mapped below — **media-access / hosted-visit** need schema extension |
| Benefit / Pay | `commissionBenefit` and/or `audienceBenefit` | Affiliate % → commission; access-only → audienceBenefit |
| Requirements | `eligibility` | |
| Source URL | `officialProgramUrl` / `applicationUrl` | Both set when URL is apply page |
| How to Use | `notes` + provenance | |

### Program Type → library / intelligence concepts

| Workbook Type | Benson concept | Suggested `programType` (today) | Needs primary |
|---------------|----------------|----------------------------------|---------------|
| Affiliate | **affiliate** | `affiliate` | |
| Affiliate / creator collaboration | **affiliate** + **creator program** | `creator` (or affiliate + note) | optional dual-tag |
| Influencer network | **creator / influencer program** | `influencer` | |
| Hosted destination / media coordination | **hosted-visit** | `other` + tag | add `hosted_visit` enum |
| Media access | **media-access** | `other` + tag | add `media_access` enum |
| Consumer rewards / content hook | content hook (not creator pay) | `other` + tag `consumer_rewards` | keep out of affiliate pay claims |

Authority for all imported program claims: `operator_supplied` with note `workbook_import` — display state `operator_supplied` / `needs_verification`, **not** `verified_official`.

---

## Deterministic org alias merge (summary)

Full rules: `org-aliases.ts`.

1. **Domain wins** when email or evidence URL host is in an alias domain set (and not an aggregator).
2. **Alias key** maps normalized name variants → one canonical business name.
3. **No soft substring merges** on short tokens (`kansas`, `city`, `hotel`).
4. Known pairs: Visit KC; Visit KCK; Worlds of Fun/Oceans of Fun; Union Station/Science City; Starlight Theatre; 21c Museum Hotel KC; Power & Light / Live! Hospitality; Joe’s KC BBQ; KC Restaurant Week (campaign, linked to Visit KC but **separate** business key).

---

## Match against DB (read-only)

Source: live `sponsor_contacts` + `creator_partnerships` where `metadata ? 'programLibrary'`.  
Workbook: **48** outreach rows, **10** programs.

### Pre-import baseline

DB totals: **154** sponsor_contacts (**112** active), **92** program-library rows.

Same org with a **different** published email is a **new contact row** (Visit KC has two people).  
**Conflicting** only when the same named person/role already has a different email.

| Bucket | Count | Meaning |
|--------|------:|---------|
| equivalent | 0 | — |
| incomplete | 6 | Crown Center, KC Current, Monarchs, Crossroads, Loews, Hotel Kansas City |
| conflicting | 0 | None under same-person rule |
| new | 42 | Net-new orgs **and** additional people at known orgs (Starlight `rachel.bliss@`, 21c `pr@`, …) |
| stale | 0 | — |

| Programs | Count |
|----------|------:|
| incomplete | 1 (MRA) |
| new | 9 |

### Post-import rematch (idempotency)

After import applied (48 contacts with workbook provenance): DB **196** contacts / **102** programs.  
Outreach: equivalent **38** · incomplete **9** · stale **1** · new **0**.  
Programs: incomplete **10** · new **0**.

Re-run: `pnpm exec tsx src/scripts/match-kc-pr-directory.ts` from `services/core`.

---

## Idempotency

Import key:  
`kc-pr-dir:2026-09-08:{orgKey}:{contactKey}`  
where `contactKey` = lowercased email, or `phone:{digits}`, or `form:{url-hash}`, or `role:{role-slug}`.

Re-import updates provenance / fills nulls; never duplicates the same import key; never overwrites a conflicting email without recording `evidenceConflictNote`.
