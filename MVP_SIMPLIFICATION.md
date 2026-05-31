# MVP Simplification Review

**Date:** 2026-05-31  
**Reviews:** [KELLIE_PRODUCT_SPEC.md](./KELLIE_PRODUCT_SPEC.md)  
**Informed by:** [KELLIE_TRANSFORMATION_PLAN.md](./KELLIE_TRANSFORMATION_PLAN.md), [PROJECT_AUDIT.md](./PROJECT_AUDIT.md), [BENSON_VISION.md](./BENSON_VISION.md)  
**Constraint:** Planning only — no code changes

---

## Assistant naming (Benson)

The **end-user assistant is Benson**. Kellie is the human operator. **Kellie Assistant** remains the internal product/engineering name during development.

MVP simplification (single creator mode) aligns with Benson's MVP role in [BENSON_VISION.md](./BENSON_VISION.md): one Kellie, one Benson, one workspace — no multi-client UI. Benson's greeting, score explanations, and "Ask Benson why" panels are the primary assistant touchpoints; full chat is Phase 2+.

---

## Executive Summary

[KELLIE_PRODUCT_SPEC.md](./KELLIE_PRODUCT_SPEC.md) describes a polished product, but it **inherits the social-agent campaign model** more heavily than the stated MVP goal requires. The spec assumes an agency operator managing multiple brands (`Kellie KC`, `Crossroads BID`), with dedicated **Clients** and **Client Detail** pages, per-client sources, per-client scoring context, and per-client autonomy modes.

That model made sense for **social-agent**, where each campaign was an isolated video factory with its own quotas, personas, publishing targets, and brand voice. For Kellie MVP — *discover, score, review, approve KC opportunities for one person* — most of that structure is premature.

**Recommendation: Option A — Single creator mode** for MVP.

Keep a hidden or singleton `workspace` record in the database so multi-client (Option B) can be added later without a rewrite, but **do not expose clients as a first-class UI concept in v1**.

---

## Inherited Concepts: Fit Assessment

### Legend

| Rating | Meaning |
|---|---|
| ✅ Keep | Core to Kellie MVP |
| ⚠️ Simplify | Keep the idea, strip the social-agent shape |
| ❌ Defer | Inherited; not needed to validate MVP |
| 🗑️ Remove | Wrong product; delete from MVP spec |

---

### Clients (renamed from campaigns)

| Aspect | social-agent origin | In product spec | MVP verdict |
|---|---|---|---|
| Entity name "client" | `campaigns` → multi-brand isolation | Full `/clients` list + CRUD | ❌ **Defer UI** |
| Default seeded client | Demo Brand campaign | "Kellie KC" on first login | ⚠️ **Singleton workspace** — Benson scans global sources; no user-facing "client" |
| `client_id` FK on opportunities | `campaign_id` on content_items | Every row scoped to client | ⚠️ **Keep in DB** as fixed UUID; hide from UI |
| Client table on Overview | Campaign table on dashboard | "Section: Clients" | ❌ **Remove** — replace with Sources summary |
| Client filter on Opportunities | Campaign filter on queue | Dropdown: Kellie KC · Crossroads BID | ❌ **Remove** |
| `client=` on approval card | `campaign=` metadata | Always shown | ❌ **Remove** from card |
| **+ New client** button | Multi-campaign creation | Clients page | ❌ **Defer** to v1.1 agency mode |
| Per-client pending counts | Per-campaign pipeline stats | Overview + clients table | ❌ **Remove** — global counts only |

**Why it inherited:** social-agent was built to run **several brands in parallel**, each with isolated config, quotas, and publishing targets. Renaming campaigns → clients preserved that multi-tenant shape without questioning whether Kellie needs it on day one.

**Why it doesn't belong in MVP:** Kellie MVP validates one loop — *scan KC → score → approve*. Multi-client adds pages, filters, CRUD, and per-tenant scoring context before anyone has approved a single opportunity.

---

### Client Detail pages (`/clients/[id]`)

| Element | social-agent equivalent | MVP verdict |
|---|---|---|
| Dedicated detail route | `/campaigns/[id]` | ❌ **Remove page** |
| **Scan now** button | Planner button | ✅ **Move to Overview or Settings** |
| Autonomy toggle | Campaign autonomy_mode | ⚠️ **Simplify** — see Autonomy modes |
| Sources table | Publishing targets + config | ⚠️ **Move to `/settings/sources`** |
| Category tags with weights | campaign_industries weights | ⚠️ **Move to Settings** — flat checklist, no weights in MVP |
| Brand voice block | campaigns.brand_voice | ⚠️ **Single field in Settings** |
| Per-client pipeline breakdown | Per-campaign state counts | ❌ **Remove** — Overview is global |
| `view opportunities →` filtered link | Campaign-scoped queue | ❌ **Remove** clientId query param |

**Why it inherited:** Client Detail is the **campaign command center** from social-agent — autonomy toggle, planner trigger, industry weights, and state breakdown all lived on `/campaigns/[id]`. The product spec transplanted that page wholesale.

**Why it doesn't belong in MVP:** With one creator, there is nothing to "detail." Scan, sources, and preferences are **workspace settings**, not a second navigational hierarchy.

---

### Campaign concepts (lingering under new names)

These social-agent ideas appear in the spec even after the transformation plan dropped video production:

| Concept | social-agent | Kellie spec | MVP verdict |
|---|---|---|---|
| **Autonomy modes** (manual / hitl / auto) | Script approval gate for video pipeline | Per-client toggle on detail page | ⚠️ **Simplify to hitl-only** for MVP; defer auto |
| **manual mode** | All transitions need approval | Listed in toggle | 🗑️ **Remove** — never implemented in social-agent either |
| **auto mode + approval-gate worker** | End-to-end autonomous publishing | Auto-approve ≥0.75 relevance | ❌ **Defer** — trust-building HITL is the product |
| **Header `auto-approve on` pill** | Autonomous video indicator | Global header | ❌ **Defer** with auto mode |
| **Category weights** | campaign_industries.weight for planner rotation | "Arts & Culture (weight 1.2)" on card | ❌ **Defer** — flat categories in MVP |
| **Brand voice in scorer** | Script generation prompt | Per-client voice block | ⚠️ **One global voice** in Settings |
| **Weekly quotas** | planned content slots per type | *(removed from spec — good)* | 🗑️ Already dropped |
| **Posting schedule / cron** | campaigns.posting_schedule | *(removed — good)* | 🗑️ Already dropped |
| **Pipeline state tiles** | Video pipeline (planned → published) | discovered → approved | ✅ **Keep** — adapted correctly |
| **HITL approval inbox** | Script approval before HeyGen | Opportunity approval | ✅ **Keep** — core MVP |
| **Runs audit log** | workflow_runs for video workers | `/runs` page | ✅ **Keep** — useful for debugging |
| **Planner → Scanner rename** | Weekly calendar | Scan now | ✅ **Keep** — correctly adapted |
| **Scored / discovered states** | script_drafted, planned, etc. | Worker-visible states | ⚠️ **Simplify UI** — Kellie only sees pending_review, approved, rejected |
| **Analytics feedback loop** | topic_performance → planner | *(out of scope — good)* | 🗑️ Already dropped |

---

### Multi-tenant architecture

| Layer | social-agent | Kellie spec | MVP verdict |
|---|---|---|---|
| **Data model** | N campaigns, isolated rows | N clients, client_id everywhere | ⚠️ **Singleton in DB**, no tenant switcher |
| **Auth / users** | None (portfolio) | Single admin login | ✅ **Keep** — one user is correct for MVP |
| **Auth / tenants** | N/A | "Sole admin for workspace" but multi-client data | ⚠️ **One workspace** — not multi-tenant |
| **Sources per tenant** | Publishing targets per campaign | Sources per client | ⚠️ **Global sources** for MVP |
| **Scoring context per tenant** | Brand voice + industries per campaign | Per-client scorer input | ⚠️ **Global preferences** |
| **Dedup scope per tenant** | campaign + industry + language | Per client, 90 days | ⚠️ **Global dedup** for MVP |
| **API surface** | `/api/campaigns`, `?campaignId=` | `/api/clients`, `?clientId=` | ⚠️ **Drop client routes** from MVP API |
| **Navigation** | Campaigns in nav | Clients in nav | ❌ **Remove** — add Settings |
| **Examples with 2 clients** | Demo Brand | Kellie KC + Crossroads BID | ❌ **Remove** — confuses MVP scope |

**Verdict:** The spec describes **multi-client data architecture** with **single-user auth** — the worst of both worlds for MVP complexity. It pays the schema and UI cost of agency mode without delivering agency features (roles, billing, client onboarding, isolated dashboards).

---

## Other Inherited Noise in the Product Spec

Items that aren't "clients" but still carry social-agent weight:

| Item | Issue | MVP action |
|---|---|---|
| **Login / auth screen** | social-agent had no auth; spec adds it | ⚠️ Optional for local MVP — defer auth until deploy |
| **Workspace welcome banner** | References "one client and two sources" | Rewrite for single-creator: "two sources configured" |
| **Typical day: Crossroads BID check** | Agency workflow fiction | Remove — single inbox narrative |
| **Glossary: Client definition** | "may have multiple" | Remove or mark post-MVP |
| **`scored` state visible to user** | Worker transit state | Hide — Kellie sees pending_review, not scored |
| **Rejection reason → scorer tuning** | social-agent fed reject into script-writer | Store reason; don't promise tuning in MVP |
| **Slack notifications** | n8n portfolio artifact | Optional Phase 4 — not MVP |
| **Settings in user menu** | Spec mentions but doesn't define page | Define minimal `/settings` for MVP |

---

## Option A vs Option B

### Option A — Single creator mode (recommended)

**Who it's for:** Kellie (one KC content creator) with **Benson** as her local opportunity assistant.

**Product shape:**

```
/                 Overview + Scan now + pending count
/approvals        Primary workspace (approve / reject)
/opportunities    Full history with filters
/settings         Sources, categories, brand voice, autonomy (hitl only)
/runs             Audit log (optional nav item)
```

**Characteristics:**

- One implicit workspace — no client list, no client picker, no `client=` on cards
- Sources are workspace-global (r/kansascity, Visit KC RSS)
- One brand voice, one category preference set
- Scoring asks: *"Is this a strong KC content opportunity for Kellie?"* — Benson explains why or why not
- Dedup is global across all opportunities
- `client_id` in database = constant singleton (or nullable) for future migration

**Pros:**

- Fastest path to validated MVP (~1 week less UI/API work)
- Matches product name — **Kellie Assistant** is personal tooling first
- Removes 2 pages and entire CRUD surface
- Simpler mental model for first user testing
- Transformation plan's core loop unchanged

**Cons:**

- Second brand requires v1.1 schema/UI work (but singleton FK makes this incremental)
- Agency use case not demo-able on day one

---

### Option B — Multi-client agency mode

**Who it's for:** Kellie (or an agency operator) managing **multiple KC brands** — restaurant group, BID, sports property — each with different sources and voice.

**Product shape:** As written in [KELLIE_PRODUCT_SPEC.md](./KELLIE_PRODUCT_SPEC.md) — Clients list, Client Detail, per-client scan, filters, card metadata.

**Pros:**

- Direct inheritance from social-agent campaigns — less redesign of transformation plan
- Supports real agency workflow if that's the business model
- Per-client sources and scoring are genuinely different for restaurant vs BID

**Cons:**

- **~40% more MVP surface area** (2 pages, client CRUD, filters, scoped API, seed data for 2 clients)
- Validates multi-tenancy before validating the core discover → approve loop
- Spec already contradicts itself: "single admin" + "multiple clients" + "no roles"
- Empty states and onboarding become harder ("create a client before you can scan")
- Crossroads BID example implies B2B agency — may not be Kellie's actual v1 user

---

## Recommendation: **Option A — Single creator mode**

### Rationale

1. **MVP goal is narrow.** Discover → score → review → approve does not require tenant isolation. social-agent needed campaigns because video output, publishing credentials, and quotas were per-brand. Kellie MVP produces **approved opportunity records**, not per-client deliverables.

2. **The spec persona is Kellie, not an agency.** The product is named after one person. The agency examples (Crossroads BID, client table, + New client) read like inherited campaign architecture, not validated user research.

3. **Multi-client without multi-user is incomplete.** True agency mode needs at least client switching, separate source configs, and eventually roles. Shipping client CRUD with one login adds data model complexity without agency value.

4. **Settings absorb what Client Detail did.** Scan now, sources list, categories, and brand voice belong in **Settings**, not a phantom entity Kellie never creates.

5. **Database can stay forward-compatible.** Keep `clients` table with one seeded row, `client_id` FK on opportunities and sources — but hardcode the singleton in API and UI. Option B becomes additive in v1.1, not a rewrite.

---

## Simplified MVP Product Spec (corrections)

Apply these changes to [KELLIE_PRODUCT_SPEC.md](./KELLIE_PRODUCT_SPEC.md) when revising (this document does not edit that file):

### Navigation

| Remove | Add / keep |
|---|---|
| `[clients]` | `[settings]` |
| Client links on Overview | **Scan now** on Overview header |
| manage clients → | configure sources → (Settings) |

### Pages

| Page | MVP status |
|---|---|
| `/` Overview | ✅ Keep — add Scan now, remove Clients section |
| `/clients` | ❌ Remove |
| `/clients/[id]` | ❌ Remove — merge into Settings |
| `/approvals` | ✅ Keep — primary workspace |
| `/opportunities` | ✅ Keep — remove client filter |
| `/settings` | ✅ Add — sources, categories, brand voice |
| `/runs` | ✅ Keep — demote to footer link or Settings tab |

### Approval card — remove fields

| Remove | Keep |
|---|---|
| `client=Kellie KC` | title, type, category, source |
| Category weight in "Why this score" | Plain "Matches category: Events" |
| — | relevance, urgency, summary, angle, links |

### Autonomy

| Mode | MVP |
|---|---|
| hitl | ✅ Default and **only** mode |
| auto | ❌ Defer — removes approval-gate worker from MVP |
| manual | 🗑️ Remove entirely |

### Scoring prompt (simplified)

**Before (multi-client):** *"Is this worth covering for **this client** in Kansas City?"*

**After (single creator):** *"Is this a strong Kansas City content opportunity for **Kellie's** focus areas?"*

Inputs: global category checklist, one brand voice, KC geo bounds, global dedup history.

### API (MVP)

| Remove / hide | Keep |
|---|---|
| `GET/POST /api/clients` (user-facing) | `/api/opportunities` |
| `?clientId=` query params | `/api/approvals` |
| `PATCH /api/clients/:id` autonomy | `POST /api/scanner/run` (no clientId) |
| — | `/api/settings` (sources, preferences) |
| — | `/api/runs`, `/api/metrics/overview` |

Internally, scanner and scorer always use the singleton `client_id`.

---

## Schema: minimum viable vs agency-ready

### MVP schema (Option A)

```
workspace_settings   (or single row in clients — id fixed, never listed)
  brand_voice, autonomy_mode='hitl', geo_center, geo_radius_km

categories           (global KC categories, no M:N weights)
sources              (workspace-level, no client_id OR client_id = singleton)
opportunities        (client_id = singleton, hidden)
workflow_runs
source_scan_runs
```

**Drop for MVP UI (can keep nullable columns):**

- `client_categories` weight table — replace with `workspace_settings.enabled_category_ids[]`
- Client list CRUD
- Per-client geo (one KC metro default)

### Agency schema (Option B — v1.1)

Re-introduce:

- `/clients` CRUD
- `client_categories` with weights
- Sources scoped per client
- `?clientId=` on API and filters
- auto autonomy mode per client

---

## Worker architecture simplification

| Worker | social-agent / current plan | MVP (Option A) |
|---|---|---|
| scanner-cron | Per client or all | All workspace sources |
| scorer | Per client context | Singleton preferences |
| approval-gate | auto mode bypass | ❌ **Remove from MVP** |
| — | — | 2 workers + manual scan API |

Fewer workers, fewer states visible to user:

```
discovered → pending_review → approved | rejected
              (scorer skips "scored" in UI)
```

---

## Effort impact

| Area | Option B (spec as written) | Option A (simplified) |
|---|---|---|
| Dashboard pages | 6 | 4 (+ settings) |
| API routes | clients CRUD + scoped queries | settings + global queries |
| Seed data | 2 demo clients | 1 singleton workspace |
| Onboarding copy | "Create or select a client" | "Scan now to start" |
| Approval card | +client field | Simpler |
| Workers | 3 (incl. approval-gate) | 2 |
| **Estimated savings** | — | **~5–7 days** |

---

## Migration path: A now, B later

If agency mode becomes necessary:

1. **v1.0 (MVP):** Option A — single creator UI, singleton client in DB
2. **v1.1:** Expose existing `clients` table — add `/clients`, client switcher, migrate sources to per-client
3. **v1.2:** Category weights, per-client brand voice, auto mode

No schema rewrite required if `client_id` FK is kept from the start.

---

## Decision

| Question | Answer |
|---|---|
| Should MVP include Clients page? | **No** |
| Should MVP include Client Detail? | **No** — use Settings |
| Should MVP support multiple clients in UI? | **No** |
| Should MVP keep campaign/client in database? | **Yes** — singleton row, future-proof |
| Should MVP include auto autonomy mode? | **No** — hitl only |
| Should MVP include category weights? | **No** — flat categories |
| **A or B?** | **A — Single creator mode** |

---

## Summary table: inherited vs MVP-essential

| Concept | Origin | MVP (Option A) |
|---|---|---|
| Opportunities + state machine | Adapted from content_items | ✅ Essential |
| Approval inbox | social-agent HITL | ✅ Essential |
| Scanner + scorer workers | planner + script-writer | ✅ Essential |
| Sources | New for Kellie | ✅ Essential (in Settings) |
| Categories | industries | ✅ Essential (flat list) |
| Runs audit | workflow_runs | ✅ Keep |
| **Clients / campaigns** | campaigns | ❌ DB only (singleton) |
| **Client Detail page** | campaigns/[id] | ❌ Remove |
| **Multi-client filters** | campaign filter | ❌ Remove |
| **Autonomy auto/manual** | social-agent pipeline | ❌ Defer |
| **Category weights** | campaign_industries | ❌ Defer |
| **Per-client brand voice** | campaigns.brand_voice | ⚠️ One global voice |
| Publishing / video / personas | social-agent | 🗑️ Already removed |

---

*End of simplification review.*
