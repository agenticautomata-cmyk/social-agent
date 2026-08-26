# Sponsor / outreach durable entity identity gate

Date: 2026-08-22 (operator timezone America/Chicago; work completed 2026-08-22 overnight into 2026-08-23)

**CODE-ONLY. Existing bad live `sponsor_contacts` / `sponsor_opportunities` rows were NOT cleaned. No email sent. Partnership fingerprint/migration untouched. SCHEELS research not rebuilt. Calendar / Discover listing identity untouched. Full outreach lifecycle not redesigned.**

---

## Proven root cause

Sponsor/outreach durable objects were created from **non-business strings**:

1. **Inbound sponsors@ / collabs@ / booking@ mail** (`promoteSponsorInboxToPipeline` in `services/core/src/gmail-inbox/sponsor-inbox-pipeline.ts`) took `subjectBusinessHint(subject)` (first `|:—` segment of the Gmail subject) as `businessName`, created a contact in `replied`, and set the pipeline opportunity **title to the raw subject**. ShopMy/MyyShop system mail is classified as `emailCategory: 'sponsor'` because it hits the sponsors@ alias, so it entered this path.

2. **Discovery / inventory promotion** (`createSponsorFromOpportunity` in `services/core/src/sponsor-outreach/contacts.ts`) used `item.businessName ?? item.title`. Inventory normalize already falls back `metadata.businessName` → `metadata.title`, and `title` is `content_items.topic`. Article headlines became CRM `business_name`.

3. **Inbound attachment** used subject-phrase `ILIKE business_name` after email match failed, so a later noisy subject could attach to the wrong contact (or to a contact that only existed because of a previous subject-as-name write).

Result: outreach list contained things that are not sponsors; contacts were not businesses; inbound replies could not attach to a real entity; follow-up/pipeline state on those rows is meaningless; ShopMy/platform system mail masqueraded as brand opportunities.

ShopMy **the platform** is a valid entity. `Thank you for your ShopMy application` is **not** a business name.

---

## Exact production write paths inspected

Production writers of `sponsor_contacts` / `sponsor_opportunities` / outreach-ready state / inbound attachment:

| Entry point | Input source | Candidate business name | Previous validation | Persist | Create vs update | Previously vulnerable? | Now gated? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `promoteSponsorInboxToPipeline` via digest `tryAutoPipelineSponsorInbox` | Gmail sponsors@ / collabs@ / booking@ | **`subjectBusinessHint(subject)`** | none (category only) | `createSponsorContact` + `createSponsorOpportunity`; title = **raw subject** | Create if no email match; else update notes/status `replied` | **YES** — ShopMy application + Email address verification opportunities | **YES** — `decideSponsorInboxPersist`; email-only match; unmatched inbound; no subject ILIKE |
| `findContactForInbound` (same file) | from-email, then **subject phrases ILIKE `business_name`** | subject phrases | none | update existing | Update | **YES** — wrong-attachment | **YES** — email / thread / message id only (`sponsorInboundAttachmentKeys`) |
| `createSponsorFromOpportunity` | inventory item (Ask Benson, intelligence, API, creator-interest, drafts) | **`item.businessName ?? item.title`** | none | `createSponsorContact` | Create unless sourceOpportunityId or canonical group hit | **YES** — pistachio-latte contact | **YES** — identity required; title is not evidence |
| Callers of `createSponsorFromOpportunity`: Ask Benson `mutate.ts` / `execute-safe.ts`; `POST /api/sponsors/from-opportunity`; `/sponsor-intelligence` lead/draft/pipeline; creator-interest contact + contact-actions; `createOpportunityFromIntelligence`; `benson-drafting/draft.ts`; `dismissOpportunity` | same | same | same | same | Create | **YES** (via callee) | **YES** (callee throws `SponsorBusinessIdentityRejectedError`; callers fail closed / 400) |
| `POST /api/sponsors` | operator JSON `businessName` | operator field | zod min(1) | `createSponsorContact` | Create | Partial — junk strings accepted | **YES** — `operatorProvided: true`; still rejects transactional/editorial/opaque |
| `PUT /api/sponsors/:id` | operator patch | incoming `businessName` | zod | `updateSponsorContact` | Update | **YES** — could overwrite valid name | **YES** — `selectSponsorIdentityForWrite`; junk does not overwrite |
| `createSponsorOpportunity` | pipeline API, inbox, `ensurePipelineDealOnReply`, intelligence | title often subject or `${businessName} partnership` | contact must exist | insert | Create | **YES** — deals for junk contacts | **YES** — refuses if contact name fails identity |
| `ensurePipelineDealOnReply` from `clearOutreachFollowUp` | verified Gmail **thread** reply (`sync-replies.ts`) | existing contact `businessName` | thread id | create deal if none open | Create/update | Thread match already correct; would still open a deal on a junk contact | **YES** — skip deal create if identity invalid |
| `syncGmailOutreachReplies` | Gmail thread id of sent pitch | N/A (uses pitch contact) | `gmailThreadId` | inbound `matchKind=outreach_reply` | Attach | Subject not used (already correct) | Unchanged thread match; subject still not a key |
| `digest-promote.ts` `promoteDigestToFollowUp` | inbound row only | does **not** create contacts | — | `outreach_inbound_messages` | Inbound only | Not a contact writer | Not a contact writer (left unmatched follow-up) |
| `associate.ts` `createOpportunityForBrand` | Ask Benson | creates **content_items**, not `sponsor_contacts` | — | content items | Out of scope | Discover/Ask Benson content | **Not gated** (not a sponsor writer; do not broaden) |
| `markContactSent` / `scheduleOutreachFollowUp` | after outbound send | existing row | — | status `follow_up_needed` | Update status | Not an identity create | **Not an identity create.** After-send status only. This task did not send mail. |

**No production `sponsor_contacts` insert path remains unguarded.** The only `db.insert(sponsorContacts)` in application code is `createSponsorContact`.

If a writer could not be gated without redesign: **none of the identity-create writers**. Residual after-send status writers (`markContactSent`) are not identity create paths and were not redesigned.

---

## Validators reused

No second semantic model. No coupling of sponsor workflow to `creator_partnership` persistence. Shared **low-level** checks only:

| Helper | Module | Use |
| --- | --- | --- |
| `classifyIdentityCandidateString` | `creator-partnership/entity-identity.ts` | Opaque / editorial / transactional / placeholder **shape** (no evidence required) |
| `evaluatePartnershipEntityIdentity` | same | URL host / JSON-LD / known program entity / operator brand evidence when a sponsor candidate already looks like a name |
| `classifyEmailIntent` | `creator-partnership/email-intent.ts` | ShopMy application, verification, newsletter, account/commerce transactional |
| `isOpaqueContentId` | `ask-benson/url-type.ts` | via partnership shape helper |
| Editorial/headline/container detectors | `editorial-roundup`, `editorial-container`, `inventory/today-clarity` | via partnership shape helper |
| Sponsor extras (not a new ontology) | `sponsor-outreach/entity-identity.ts` | campaign subjects, interrogative headlines (`Who has…?`), person-without-company, known sender domains |

---

## Sponsor / business identity gate semantics

Shared module: `services/core/src/sponsor-outreach/entity-identity.ts`

**Email subjects and article titles are never sufficient on their own.**

Reject as sponsor/business identity (do not create contact / do not create `ready_to_contact` / do not create pipeline deal):

| Reason | Examples |
| --- | --- |
| `transactional_subject` | `Thank you for your ShopMy application`, `Email address verification`, password reset, confirm your email |
| `editorial_headline` / `listing_container_title` | `Top Things To Do This Summer 2025`, `Best Restaurants in Kansas City` |
| `interrogative_headline` | `Who has the best pistachio latte in KC?` |
| `campaign_subject` | `BEST SELLERS: Just for you`, Fall sweaters / shop now / % off |
| `placeholder_or_empty` / `opaque_content_id` | empty, n/a, shortcodes |
| `person_without_company` | Jane Smith + no company field — person may remain evidence; **do not invent `business_name` from the subject** |
| `no_entity_evidence` | plausible token with no operator / domain / signature / JSON-LD / known entity |

Allow when **shape is a usable business name** and at least one defensible signal exists:

- operator-provided business name (`POST /api/sponsors`)
- explicit business/company field **that is not identical to the page title/subject**, unless independent URL/domain/JSON-LD/signature evidence supports it
- sender organization/domain (including known ShopMy / SCHEELS / Loews / Etsy / LTK / REKLAIM / Nike hosts)
- email signature organization / JSON-LD organization
- linked creator partnership brand
- website host that looks like the business

Choke points:

- `createSponsorContact` — persist `identity.businessName`, never the rejected candidate
- `createSponsorFromOpportunity` — no title fallback
- `updateSponsorContact` — junk incoming names do not overwrite; junk identities are not promoted to `ready_to_contact` / `replied` / `follow_up_needed`
- `createSponsorOpportunity` — refuse if the contact’s stored name fails identity
- Inbox — `decideSponsorInboxPersist`

Failure behavior: throw `SponsorBusinessIdentityRejectedError` on create; inbox writes `outreach_inbound_messages` with `matchKind: unmatched_identity` and digest `actionStatus: skipped_identity`. No new moderation system.

---

## Transactional-vs-entity handling (ShopMy)

| Case | Identity | Intent | Persist |
| --- | --- | --- | --- |
| Subject only: `Thank you for your ShopMy application` | reject (`transactional_subject`) | `platform_creator` | **no contact, no opportunity** |
| Same + `hello@shopmy.us` / The ShopMy Team | **entity = ShopMy** | `platform_creator` (transactional/platform) | **no new subject-named contact, no pipeline deal** |
| `Email address verification` | reject | `security_auth` | **no contact, no opportunity** |
| ShopMy marketing with unknown intent (`Get paid for what you already recommend`) | entity may be ShopMy | not `creator_business` | **no pipeline create** (`platform_entity:ShopMy:…`) |

Creator-platform entities (ShopMy, LTK, Etsy, REKLAIM) only enter the sponsor pipeline from inbox when intent is `creator_business`. That is sponsor persist policy, not a general mail-router rewrite. Existing `creator_platform_activities` / waiting-follow-up producers are unchanged.

### ShopMy example before / after

**Before:** contact `business_name` = `Thank you for your ShopMy application`; opportunity title = same string; `lead_source=sponsors_inbox`; status `interested` / contact `replied`.

**After (new writes):** identity may resolve to `ShopMy`; intent `platform_creator`; inbound row unmatched-or-notes-only; **no fake subject-name contact**; **no new opportunity titled the subject**. Live junk rows **left in place**.

---

## Contact person vs business-name

Kept distinct.

- Person: `Jane Smith`
- Company: missing
- Subject: `Partnership opportunity for Kellie`

Gate: `person_without_company` or `no_entity_evidence`. `business_name` is **not** invented from the subject because company extraction failed. Person may remain on `contactName` when a real company identity later exists.

---

## Inbound reply attachment safeguards

Did not redesign matching broadly.

- **Removed** subject-phrase `ILIKE sponsor_contacts.business_name`.
- Inbox match is **from-email only**.
- Outreach replies remain **Gmail thread id** (`sync-replies.ts` / `matchKind=outreach_reply`).
- `sponsorInboundAttachmentKeys` exposes email / thread / message — **subject is not a lookup key**.
- If attachment cannot be resolved: inbound stays unmatched (`unmatched_identity` / no `outreach_email_id`). A bad subject-derived identity cannot attach to the wrong sponsor.

`updateSponsorContact` / `selectSponsorIdentityForWrite`: a later transactional subject **does not overwrite** a valid existing business name (shape-rejected proposed names are non-writable even if the existing website would resolve a known entity).

---

## Files changed (this task)

| File | Change |
| --- | --- |
| `services/core/src/sponsor-outreach/entity-identity.ts` | **New** sponsor identity gate + inbox persist decision |
| `services/core/src/sponsor-outreach/entity-identity.test.ts` | **New** unit + postgres regressions |
| `services/core/src/creator-partnership/entity-identity.ts` | Extract/export `classifyIdentityCandidateString` (shared shape helper) |
| `services/core/src/creator-partnership/index.ts` | Export that helper |
| `services/core/src/sponsor-outreach/contacts.ts` | Gate create / from-opportunity / update |
| `services/core/src/sponsor-outreach/index.ts` | Export identity APIs |
| `services/core/src/sponsor-outreach/follow-up.ts` | Skip pipeline deal on junk identity |
| `services/core/src/sponsor-outreach/benson-drafting/draft.ts` | Fail closed on identity reject |
| `services/core/src/sponsor-pipeline/opportunities.ts` | Refuse deals for junk contacts |
| `services/core/src/gmail-inbox/sponsor-inbox-pipeline.ts` | Intent + identity persist; email-only match; unmatched inbound |
| `services/core/src/ask-benson/evidence-orchestration/execute-safe.ts` | Blocker `sponsor_business_identity_rejected` |
| `services/core/src/sponsor-intelligence/actions.ts` | Dismiss records passed without creating junk; draft skip |
| `services/api/src/routes/sponsors.ts` | `operatorProvided`; 400 on identity reject |
| `services/api/src/routes/sponsor-intelligence.ts` | 400 on identity reject |
| `services/api/src/routes/creator-interest.ts` | 400 on identity reject |
| `services/core/package.json` | `test:postgres` includes sponsor identity tests |

**Not changed:** partnership fingerprint / V2 helpers / live fingerprint rows; SCHEELS research; Calendar; Discover listing ingest; email send.

---

## Tests run + pass/fail counts

All postgres tests used `TEST_DATABASE_URL` → `social_agent_test` only. Live `social_agent` was **not** used for tests.

| Suite | Tests | Result |
| --- | --- | --- |
| `evaluateSponsorBusinessIdentity` (unit, cases 1–11 + ShopMy marketing) | 12 | **pass** |
| `sponsor identity gate — postgres` | 7 | **pass** |
| `canonicalize.test.ts` | 12 | **pass** |
| `contact-confidence.test.ts` | 6 | **pass** |
| `gmail-inbox/inbound-actionability.test.ts` | 13 | **pass** |
| `creator-partnership/entity-identity.test.ts` (partnership gate, including postgres persist) | 25 | **pass** |
| evidence-orchestration Loews (`--test-name-pattern=Loews`) | 2 | **pass** |

Focused identity file last run: **19 pass / 0 fail**. Combined sponsor+inbound+canonicalize run earlier in the session: **49 pass / 0 fail** (identity suite then 18 tests; one extra unit added after). Partnership identity **25 pass**. Loews orchestration **2 pass**.

Repo-wide `tsc --noEmit` still has **pre-existing** errors (Calendar tests, scripts, Discover helpers). **None** were in files changed for this gate.

### Proof bad subject/headline cannot create sponsor/contact

Postgres (`social_agent_test`; counts of existing rows with that `business_name` unchanged; `SponsorBusinessIdentityRejectedError`):

1. `createSponsorContact({ businessName: 'Thank you for your ShopMy application' })` → reject, **zero inserts**
2. `createSponsorFromOpportunity` on content topic `Who has the best pistachio latte in KC?` → reject, **zero contacts named that string**
3. Direct legacy contact named `Email address verification` → `createSponsorOpportunity` **throws**; no new deal

Unit: subject-only ShopMy / verification / pistachio / `BEST SELLERS: Just for you` → `createContact=false`.

### Proof valid later identity cannot be overwritten by junk

- Unit `selectSponsorIdentityForWrite`: existing `SCHEELS` + incoming ShopMy application subject + scheels.com website → `writeBusinessName=false`, name stays `SCHEELS`
- Postgres: create SCHEELS contact, `updateSponsorContact({ businessName: 'Thank you for your ShopMy application' })` → **still SCHEELS**

Valid creates still succeed: `partnerships@scheels.com` / SCHEELS, operator `Northfield Supply Co`, Loews + `loewshotels.com` (including evidence-orchestration Loews path).

---

## Bounded live read-only classification

`SELECT` only against `social_agent` (`localhost:5433`). Limit: required examples + controls (8 classified objects; all 11 live inbound rows are `sponsors_inbox_pipeline` with `outreach_email_id` null). No `DELETE`/`UPDATE`. Inspect script was ephemeral (`/tmp`); not a live mutation job.

There is **no** live `match_kind=unmatched*` row. Audit “unmatched / attached=false” is inbound with **`outreach_email_id` null** (not attached to a sent pitch thread).

| # | row id | object type | current business/entity name | source email/content | sender/domain | subject/title | status | follow-up | NEW gate | defensible entity if any | exact old write path |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `835380c7-e10f-4636-bb05-21f5ed23302e` | sponsor_opportunity | contact `Thank you for your ShopMy application` | sponsors@ Gmail notes `gmailMessageId=19fe59b743d39a51` | `hello@shopmy.us` | **Thank you for your ShopMy application** | opp `interested`; contact `replied` | `next_follow_up_at` null | **reject persist** (`blocked_intent:platform_creator`); identity **allow ShopMy** | ShopMy | `promoteSponsorInboxToPipeline`: `subjectBusinessHint` → `createSponsorContact.businessName`; opportunity `title = subject`; `lead_source=sponsors_inbox` |
| 2 | `a1372cc9-e55e-458f-a507-b8a578fc6703` | sponsor_contact (same ShopMy thread) | `Thank you for your ShopMy application` | same inbox notes (application + “You’re in!”) | `hello@shopmy.us` | (stored as business name, not a real org) | `replied` | null | identity **allow ShopMy**; **do not create** from this mail | ShopMy | same inbox create |
| 3 | `552c9766-ab9f-4348-a628-d76f1f54dfb1` | sponsor_opportunity | contact `Email address verification` | sponsors@ `gmailMessageId=19fe58fd2bdf997e` | `welcome@myyshop.com` | **Email address verification** | opp `interested`; contact `replied` | null | **reject** `transactional_subject` + `blocked_intent:security_auth` | none | same inbox path; title = subject |
| 4 | `a9611eba-d06a-4586-a5aa-5e9542e3391f` | sponsor_contact | **Who has the best pistachio latte in KC?** | content `f71f4a8a-debf-4334-891b-001b160776a2` topic same | website `thepitchkc.com/who-has-the-best-pistachio-latte-in-kc/` | article headline = topic | `ready_to_contact` | null | **reject** `interrogative_headline` | none | `createSponsorFromOpportunity` `businessName ?? title` from Pitch article inventory |
| 5 | `3e2ed3c2-90dd-4a46-8c9c-a0beedfc39ea` | sponsor_contact | **21c Museum Hotels** | CRM / inventory | `kjessen@21chotels.com` / 21cmuseumhotels.com | n/a | `ready_to_contact` | `2026-08-11T01:23:35.137Z` | **allow** | 21c Museum Hotels | legitimate explicit name + URL host |
| 6 | `9f1a5a1c-9eec-40b1-a21b-c9b3399d3e59` | sponsor_contact | **Loews Kansas City Hotel** | inventory / Loews site | `ssccustomerservice@loewshotels.com` | n/a | `ready_to_contact` | null | **allow** (canonical **Loews**) | Loews | known domain + explicit field |
| 7 | `98cd505d-beeb-4cbc-adb1-4dca1d28b3d6` | outreach_inbound | n/a | Gmail | `hello@shopmy.us` The ShopMy Team | Thank you for your ShopMy application | `match_kind=sponsors_inbox_pipeline`; `actionability=waiting_followup`; **`outreach_email_id` null** | n/a | persist **no contact/opportunity**; entity ShopMy | ShopMy | inbox auto-promote treated platform mail as sponsor pipeline |
| 8 | `e04a202a-1516-495b-af22-be7f51048778` | outreach_inbound | n/a | Gmail | `welcome@myyshop.com` | Email address verification | `security_auth` / `actionability=none`; **unattached** | n/a | persist **no contact/opportunity** | none | same inbox path |
| 9 | `4fe40ee0-8a5e-4a69-9b9c-571942badbeb` | outreach_inbound (unattached control) | n/a | Gmail | `hello@shopmy.us` | Get paid for what you already recommend | stored `newsletter_marketing`; **`outreach_email_id` null** | n/a | identity ShopMy; **no pipeline create** (`platform_entity`) | ShopMy | same inbox path; subject is campaign copy, not a business |

Existing bad live rows **explicitly NOT cleaned**.

---

## Confirmations

| Constraint | Result |
| --- | --- |
| Live sponsor/outreach data changed | **no** |
| Email sent | **no** |
| Partnership fingerprint / migration | **untouched** (no edits to fingerprint V2 helpers as part of this task; no live fingerprint rewrite) |
| SCHEELS research rebuilt | **no** |
| Calendar / Discover | **untouched by this task** (other dirty files exist in the worktree from prior work; not edited here) |
| Existing bad live sponsor/contact rows cleaned | **no** |
| Full outreach lifecycle redesigned | **no** |
| New moderation system | **no** |

---

## Remaining unguarded writer

**No production `sponsor_contacts` insert remains unguarded.**

Not identity-create (out of scope, named for completeness):

- `markContactSent` / `scheduleOutreachFollowUp` still set `follow_up_needed` **after an outbound send**. This task did not send email and did not redesign send.
- `digest-promote.ts` still inserts unmatched inbound rows without contacts.
- Ask Benson `associate.ts` can still ILIKE `sponsor_contacts.business_name` for **content/partnership association** (not inbound reply attachment). Not redesigned.
- Test/`db.insert(sponsorContacts)` fixtures are not production.

---

## Unrelated findings (out of scope)

- All 11 live `outreach_inbound_messages` rows are `match_kind=sponsors_inbox_pipeline` with `outreach_email_id` null — platform mail was promoted into the sponsor inbound table. Identity gate stops **new** CRM objects; historical inbound rows were not reclassified.
- `classifyEmailIntent` without body text can return `unknown` for some ShopMy marketing subjects that were stored as `newsletter_marketing`. Inbox persist now additionally refuses non-`creator_business` mail from known creator-platform entities (ShopMy/LTK/Etsy/REKLAIM). Broader intent retune was not done.
- Inventory `stringField(metadata, 'businessName', 'title')` still copies article titles into the inventory `businessName` field. Discover/inventory normalize was **not** changed; the sponsor persist gate now refuses that string.
- Repo-wide TypeScript errors in Calendar / scripts / Discover tests pre-exist; not this task.
- Partnership fingerprint V2 and live junk `creator_partnerships` rows remain a separate parked track.

---

## What operators should expect next

New ShopMy application / verification / headline promotions **will not** create fake sponsors. Live junk CRM rows still appear until a later bounded cleanup (not this task). Inbound replies on **known Gmail threads** still attach; subject-only identity cannot attach to the wrong contact.
