# Benson Product Review

**Date:** 2026-05-31  
**Status:** Audit only — no features added  
**Assumption:** Review reflects the **intended Kellie configuration**: `ENABLE_OPPORTUNITIES_UI=true`, `ENABLE_OPPORTUNITIES_API=true`, `ENABLE_KC_SCANNER=true`, `DEMO_MODE=true`. Routes gated by those flags return 404 when flags are off.

**Primary user:** Kellie — Kansas City content strategist (non-developer, iPhone-first in vision docs)  
**Current product center of gravity:** Scanner-ingested KC inventory (~400+ rows), editorial review UI, daily command center, manual analytics import.

---

## Executive Summary

Benson today is a **strong internal intelligence and review product** with a **weak outward-facing operator shell**. Kellie's highest-value daily workflows live in **Inventory Review** and the **Editor (Command Center)**. TikTok Analytics Phase A is **genuinely usable** with demo or imported data. Share Intake works as a **web-only manual capture lane** with stub extraction. The legacy **video pipeline** surfaces (Overview stats, Approvals, Runs) remain in nav but are **misaligned** with Kellie's opportunity-discovery mission unless the HeyGen publish pipeline is re-enabled.

**Sponsor outreach** is architecture-only — zero implementation. Kellie cannot manage contacts, media kits, or scheduled emails inside Benson today.

---

## Route Inventory

### Navigation (Benson mode)

| Nav label | Route | Also reachable |
|---|---|---|
| overview | `/` | — |
| opportunities | `/opportunities` | `/queue` redirects here |
| editor | `/editor` | — |
| inventory review | `/review/inventory` | — |
| analytics | `/analytics` | `/analytics/tiktok`, `/analytics/import` |
| share intake | `/intake` | `/intake/add` |
| approvals | `/approvals` | — |
| runs | `/runs` | — |

### Hidden / redirected (still accessible)

| Route | Behavior when Benson UI on |
|---|---|
| `/analytics/tiktok` | Full TikTok dashboard (not in nav) |
| `/analytics/import` | Import UI (not in nav) |
| `/intake/add` | Manual add form (button from intake) |
| `/campaigns`, `/campaigns/[id]` | Redirect to `/` |
| `/queue` | Redirect to `/opportunities` |

---

## Route-by-Route Audit

### 1. Overview — `/`

| Dimension | Assessment |
|---|---|
| **Purpose** | Workspace health: content pipeline state counts (planned, in flight, scheduled, published, failed) and ASCII state distribution. |
| **Intended user** | Operator / Kellie glancing at system status. |
| **Current usefulness** | **Low for Kellie.** Counts reflect the **video production state machine**, not KC opportunity freshness, intake backlog, or editorial picks. Campaign table hidden in Benson mode. |
| **Missing pieces** | Benson greeting and KPIs (new today, sponsor-friendly count, intake pending, link to Editor as home); opportunity-oriented stats; mobile layout; no connection to inventory or analytics. |
| **Priority score** | **4 / 10** |

---

### 2. Opportunities — `/opportunities`

| Dimension | Assessment |
|---|---|
| **Purpose** | Tabular browse of `content_items` framed as "opportunities" with state filter. |
| **Intended user** | Kellie scanning what Benson has ingested. |
| **Current usefulness** | **Medium-low.** Shows title, category, source, location, dates when KC scanner enabled — but **no scores, no detail view, no actions**, and largely **duplicates Inventory Review** with fewer capabilities. |
| **Missing pieces** | Detail drawer, relevance/urgency scores, editorial flags, "open in editor context," dedup with inventory, sponsor/contact actions, sorting beyond state filter. |
| **Priority score** | **5 / 10** |

---

### 3. Inventory Review — `/review/inventory`

| Dimension | Assessment |
|---|---|
| **Purpose** | Internal review UI for the full scanner-backed opportunity database: stats, 7 editorial pick panels, presets, rich filters, searchable table, item detail. |
| **Intended user** | Kellie (primary) and internal review / editorial QA. |
| **Current usefulness** | **Very high.** This is Benson's flagship screen — sponsor-friendly presets, shopping/retail, estate sales, World Cup, celebrity/charity panels, score breakdowns on picks, source links. |
| **Missing pieces** | No "plan this" / calendar action; no sponsor contact creation; no promote-to-publish workflow; no Ask Benson panel; desktop-heavy (1100px+ table); no iPhone layout; editorial ranking is **review-only** (does not change production scoring). |
| **Priority score** | **10 / 10** |

**Editorial panels available:** Top Today, Sponsor, Engagement, New Businesses, Celebrity/Charity, Estate Sales This Week, Top Shopping.

---

### 4. Editor (Content Command Center) — `/editor`

| Dimension | Assessment |
|---|---|
| **Purpose** | Answer Kellie's daily editorial questions in six card sections: post today, post weekend, contact businesses, highest confidence, trending, World Cup visitors. |
| **Intended user** | Kellie — daily planning session. |
| **Current usefulness** | **High.** Best "what should I do today?" experience; cards include confidence, audience fit, sponsor potential, and why-it-matters copy. |
| **Missing pieces** | Read-only — cannot save picks, assign dates, or mark done; no drill-through to inventory item; no outreach compose; no integration with TikTok analytics recommendations; no push notifications. |
| **Priority score** | **9 / 10** |

---

### 5. Share Intake — `/intake` and `/intake/add`

| Dimension | Assessment |
|---|---|
| **Purpose** | Manual capture lane: Kellie submits URL/text (and API supports image); review queue; approve promotes to `content_items`. |
| **Intended user** | Kellie capturing discoveries outside scanners. |
| **Current usefulness** | **Medium.** Web form + review + approve/reject **works end-to-end**. `/intake/add` is usable from desktop. |
| **Missing pieces** | **No iOS Share Sheet** (vision doc primary flow); extraction is **stub only** (no OpenAI/Vision); image upload underdeveloped in UI; no edit-before-approve; no Benson push notification; mobile UX not designed. |
| **Priority score** | **6 / 10** (importance **8**, completeness **6**) |

---

### 6. Approvals — `/approvals`

| Dimension | Assessment |
|---|---|
| **Purpose** | Human-in-the-loop **script approval** for items in `script_drafted` (HeyGen/video pipeline). |
| **Intended user** | Kellie when autonomous video production is active. |
| **Current usefulness** | **Low in Benson opportunity mode.** Unrelated to KC discovery; inbox often empty when pipeline disabled or unused. |
| **Missing pieces** | Opportunity-context approvals (intake is separate); Benson copy; connection to Editor picks. |
| **Priority score** | **3 / 10** (for current Kellie product) |

---

### 7. Runs — `/runs`

| Dimension | Assessment |
|---|---|
| **Purpose** | Workflow execution log (worker name, state transitions, errors, duration). |
| **Intended user** | Developer / operator debugging workers. |
| **Current usefulness** | **Very low for Kellie.** Technical telemetry, not a creator tool. |
| **Missing pieces** | Kellie-friendly language (partially via terminology flags); should not be in primary nav for creator product. |
| **Priority score** | **2 / 10** |

---

### 8. Analytics Hub — `/analytics`

| Dimension | Assessment |
|---|---|
| **Purpose** | Platform entry: TikTok, Instagram, YouTube Shorts cards with video counts and links. |
| **Intended user** | Kellie — creator performance orientation. |
| **Current usefulness** | **Medium.** Clear entry point; only TikTok has data (demo or import). |
| **Missing pieces** | TikTok not in sub-nav; Instagram/YouTube are placeholders; no cross-platform summary on overview. |
| **Priority score** | **6 / 10** |

---

### 9. TikTok Analytics — `/analytics/tiktok`

| Dimension | Assessment |
|---|---|
| **Purpose** | Full creator analytics: KPIs, top videos, categories, locations, posting times, sponsor performance, trends, patterns, Benson recommendations. |
| **Intended user** | Kellie learning what content performs on her TikTok page. |
| **Current usefulness** | **High (Phase A).** Demo mode auto-seeds 30 KC videos; recommendations are data-driven; import path documented via `/analytics/import`. |
| **Missing pieces** | No TikTok OAuth/sync; no per-video detail page; no link to Benson opportunities; demo data ≠ real account until CSV import; watch-time/saves depend on import richness. |
| **Priority score** | **8 / 10** |

---

### 10. Analytics Import — `/analytics/import`

| Dimension | Assessment |
|---|---|
| **Purpose** | CSV upload, JSON upload, manual single-video entry for creator metrics. |
| **Intended user** | Kellie (or assistant) importing TikTok Studio / Creator Center exports. |
| **Current usefulness** | **High for Phase A path.** Template download, three import modes, result feedback. |
| **Missing pieces** | In-app TikTok export instructions; column mapping preview; bulk tag editing after import; validation report export. |
| **Priority score** | **7 / 10** |

---

### 11. Sponsor Outreach — architecture readiness (no routes)

| Dimension | Assessment |
|---|---|
| **Purpose (designed)** | Media kit library, sponsor CRM, email templates, scheduled outreach queue with mandatory approval, send logging. |
| **Intended user** | Kellie — business development and sponsorship. |
| **Current usefulness** | **None.** [SPONSOR_OUTREACH_ARCHITECTURE.md](./SPONSOR_OUTREACH_ARCHITECTURE.md) only. No `/sponsors`, `/media-kits`, or `/outreach/*` routes. No DB tables, no API, no email provider. |
| **Missing pieces** | Entire Phase A (CRM + kits + compose drafts); Resend integration; inventory/editor "draft outreach" entry points; link from analytics sponsor performance to contacts. |
| **Readiness score** | **2 / 10** — vision and schema design are clear; zero shipped surface for Kellie. |
| **Priority score (to build)** | **9 / 10** — closes the largest gap between Benson's sponsor **intelligence** and sponsor **action**. |

---

## Cross-Cutting Gaps

| Gap | Impact |
|---|---|
| **No mobile / iOS Share Sheet** | Kellie's primary capture context (vision) is unsupported. |
| **Two overlapping browse surfaces** | `/opportunities` vs `/review/inventory` confuses product story. |
| **Pipeline UI in creator nav** | Approvals, Runs, pipeline-centric Overview feel like a different product. |
| **Read-only editorial layers** | Editor and editorial picks inform but don't persist Kellie's decisions. |
| **Intelligence → action broken** | Sponsor picks, shopping openings, and analytics recommendations don't connect to outreach or content calendar. |
| **Stub intake extraction** | Manual review burden high; "Benson extracted this" trust is limited. |
| **Demo mode everywhere** | Useful for dev; Kellie needs clear "real vs sample" labeling (partially done on analytics). |

---

## Answers to Product Questions

### 1. If Kellie sat down right now, what could she actually use?

**Immediately useful (with flags on, API running, seeded inventory):**

| Workflow | Where |
|---|---|
| "What's worth covering in KC today?" | **Editor** (`/editor`) |
| Deep browse, filter, and judge the full database | **Inventory Review** (`/review/inventory`) |
| Find sponsor-friendly, shopping, estate sale, World Cup picks | Editorial panels on inventory |
| Import TikTok performance and see what to repeat/avoid | **Analytics → TikTok** (demo or CSV) |
| Manually add a link she found and approve it into the system | **Share Intake** (`/intake/add` → `/intake`) |

**Marginal or wrong tool:**

| Workflow | Reality |
|---|---|
| Quick scan of ingested rows only | `/opportunities` works but inventory is better |
| Approve video scripts | `/approvals` only if video pipeline is running |
| System debugging | `/runs` — not for Kellie |
| Email sponsors, send media kits | **Not in product** — external tools only |

---

### 2. What screens feel complete?

| Screen | Verdict |
|---|---|
| **Inventory Review** | **Most complete** — stats, panels, filters, detail, presets, flags. |
| **Editor (Command Center)** | **Complete as a read-only daily briefing** — six sections, scored cards, Benson voice. |
| **TikTok Analytics** | **Complete for Phase A** — dashboard cards + recommendations + import path. |
| **Analytics Import** | **Complete for Phase A** — three import modes functional. |

These four could be shown to Kellie for real feedback with minimal apology.

---

### 3. What screens are prototype-only?

| Screen | Why prototype |
|---|---|
| **Overview** | Pipeline metrics shell; not Benson's home. |
| **Opportunities** | Thin table without scores, detail, or actions — inventory superseded it. |
| **Share Intake** | Web stub without Share Sheet, real AI, or mobile UX. |
| **Approvals** | Legacy video pipeline gate — not opportunity workflow. |
| **Runs** | Operator/debug tool in creator nav. |
| **Analytics hub (non-TikTok platforms)** | Placeholder cards only. |
| **Sponsor outreach (all)** | Design doc only. |

---

### 4. What are the 10 highest ROI improvements?

Ranked by impact on Kellie's daily value per engineering effort:

| # | Improvement | ROI rationale | Est. priority |
|---|---|---|---|
| 1 | **Make Editor the home screen** — redirect `/` or lead with Command Center KPIs | Kellie's #1 question answered immediately | 10 |
| 2 | **Sponsor Outreach Phase A** — CRM, media kits, compose drafts (no send yet) | Closes intelligence → action gap; architecture ready | 9 |
| 3 | **Inventory → "Save to my plan" / shortlist** | Makes editorial review actionable without full calendar | 9 |
| 4 | **Real intake extraction** (OpenAI URL + Vision) | Reduces manual review friction on Share Intake | 8 |
| 5 | **Merge or retire `/opportunities`** — deep-link to inventory with filters | Removes duplicate product surface | 8 |
| 6 | **Editor ↔ Inventory drill-through** | Card click opens inventory detail | 8 |
| 7 | **Analytics → Editor bridge** | Surface TikTok recommendations on Command Center | 7 |
| 8 | **Inventory "Add sponsor contact" stub** (pre-outreach) | Links sponsor picks to future CRM | 7 |
| 9 | **iOS Share Sheet / mobile capture** | Vision-primary capture lane | 7 |
| 10 | **Benson Overview KPIs** — intake pending, new today, top sponsor count | Replaces pipeline-centric overview | 6 |

---

### 5. What should be built next?

**Recommended sequence (no new scope beyond existing architecture docs):**

1. **Sponsor Outreach Phase A** — media kits, sponsor contacts, compose + preview, draft queue (per [SPONSOR_OUTREACH_ARCHITECTURE.md](./SPONSOR_OUTREACH_ARCHITECTURE.md)). Highest strategic gap.
2. **Editor as home + inventory drill-through** — low effort, high daily UX win.
3. **Share Intake Phase B** — real AI extraction (architecture exists; stub today).
4. **TikTok Analytics Phase B** — OAuth connect button + account status (no sync required for first increment).
5. **Retire or redirect `/opportunities`** to filtered inventory view.

**Do not start yet:** Instagram analytics, live email send, TikTok catalog sync worker — depend on prior phases.

---

### 6. What should be delayed?

| Delay | Reason |
|---|---|
| **TikTok OAuth + Display API sync (Phase C)** | Phase A import satisfies learning loop; OAuth adds compliance and ops overhead. |
| **Live sponsor email send (Resend/Gmail)** | CRM and compose must exist first; sending without drafts creates risk. |
| **Instagram / Facebook / YouTube analytics** | TikTok Phase A not yet fed with Kellie's real CSV habit. |
| **Video pipeline prominence** (Approvals, HeyGen, publish) | Misaligned unless Kellie returns to autonomous video production via Benson. |
| **Runs in primary nav** | Move to operator/settings area for creator-facing product. |
| **Global Ask Benson chat** | Editor + inventory panels deliver 80% of value with lower scope. |
| **Production scoring changes from editorial panels** | Explicit product rule — keep review UI separate until deliberate merge. |

---

## Product Maturity Matrix

| Area | Maturity | Kellie-ready? |
|---|---|---|
| KC scanner inventory | Production | Yes |
| Inventory review + editorial picks | Production | Yes |
| Command Center / Editor | Beta (read-only) | Yes |
| TikTok analytics (import) | Beta (Phase A) | Yes with demo/import |
| Share Intake (web) | Alpha | Partial |
| Opportunities list | Alpha | Redundant |
| Overview | Alpha (wrong domain) | No |
| Video approvals / runs | Legacy | No (for this product) |
| Sponsor outreach | Not started | No |
| Mobile / Share Sheet | Not started | No |

---

## Recommended Nav (future, not implemented)

For a Kellie-first product, primary nav might become:

```
editor · inventory · analytics · intake · sponsors
```

…with **overview**, **approvals**, and **runs** demoted to operator settings or removed from creator mode.

---

## Related Documents

- [BENSON_VISION.md](./BENSON_VISION.md) — north-star product
- [TIKTOK_ANALYTICS_ARCHITECTURE.md](./TIKTOK_ANALYTICS_ARCHITECTURE.md) / [TIKTOK_ANALYTICS_PHASE_A_RESULTS.md](./TIKTOK_ANALYTICS_PHASE_A_RESULTS.md)
- [SPONSOR_OUTREACH_ARCHITECTURE.md](./SPONSOR_OUTREACH_ARCHITECTURE.md)
- [SHARE_TO_BENSON_ARCHITECTURE.md](./SHARE_TO_BENSON_ARCHITECTURE.md)

---

*Audit complete. No application code was modified.*
