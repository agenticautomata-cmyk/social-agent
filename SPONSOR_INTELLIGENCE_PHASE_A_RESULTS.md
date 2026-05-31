# Sponsor Intelligence Phase A — Results

**Date:** 2026-05-31  
**Status:** Complete  
**Scope:** Rule-based sponsor scoring and ranked recommendations — no AI calls, no new sources, no real email

---

## Summary

Sponsor Intelligence Phase A helps Kellie decide **who to contact first**. Benson scores sponsor-friendly inventory items, ranks them into five recommendation lanes, and explains each pick with fit scores, pitch angles, and one-click actions into the existing CRM, outreach composer, and content planner.

---

## What Was Built

### Route (dashboard)

| Route | Purpose |
|---|---|
| `/sponsor-intelligence` | Five ranked recommendation sections + quick actions |

Nav adds **sponsor intel** after **sponsors** (when `ENABLE_OPPORTUNITIES_UI=true`).

### Scoring (rule-based, no LLM)

For each eligible opportunity Benson computes:

| Score | Purpose |
|---|---|
| **Sponsor fit** | Named business, sponsor-friendly flags, luxury/dining/opening signals |
| **Audience fit** | Base audience score + optional TikTok analytics category boost |
| **Revenue potential** | Luxury, dining, retail, World Cup, opening categories |
| **Confidence** | Source quality (non-Reddit boost), URL, venue, relevance |
| **Contact first** | Weighted composite for the “Contact First” lane |

Also surfaced per card:

- **Recommended pitch angle** (template-mapped sponsorship hook)
- **Why Benson recommends** (from inventory `whyItMatters`)
- **Expected audience fit** (human-readable band from audience score)
- **Suggested content angle**
- **Suggested sponsorship angle**

### Recommendation sections

| Section | Ranking logic |
|---|---|
| **Contact First** | Highest contact-first composite; excludes already `sent` / `converted` |
| **High Revenue Potential** | Luxury, dining, shopping, visitor-focused categories |
| **Fast Wins** | Named local businesses, sponsor-friendly, confidence ≥ 50, not Reddit |
| **World Cup Opportunities** | `worldCup` flag |
| **New Openings** | Business opening flag or opening category |

Dismissed opportunities (`not_interested` CRM status) are excluded from all lanes.

### Quick actions

| Action | API | Result |
|---|---|---|
| Create lead | `POST …/lead` | Creates or returns existing `sponsor_contacts` row |
| Create draft outreach | `POST …/draft-outreach` | Creates lead + draft email with best-fit template |
| Add to planner | `POST …/add-to-planner` | Saves to shortlist list **Sponsors** |
| Mark not interested | `POST …/dismiss` | Sets contact status `not_interested` |

Draft outreach redirects to `/outreach/compose?sponsor={id}`.

### API

Registered when `ENABLE_OPPORTUNITIES_API=true`:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/sponsor-intelligence?limit=N` | Full intelligence payload (default limit 6 per section) |
| `POST` | `/api/sponsor-intelligence/from-opportunity/:id/lead` | Create sponsor lead |
| `POST` | `/api/sponsor-intelligence/from-opportunity/:id/draft-outreach` | Lead + templated draft |
| `POST` | `/api/sponsor-intelligence/from-opportunity/:id/add-to-planner` | Shortlist save |
| `POST` | `/api/sponsor-intelligence/from-opportunity/:id/dismiss` | Mark not interested |

**Core module:** `services/core/src/sponsor-intelligence/`  
**Exports:** `@social-agent/core/sponsor-intelligence`

### Data sources (no new tables)

- **Inventory** — `content_items` + sources via existing normalize pipeline
- **Sponsor CRM** — `sponsor_contacts` for lead/dismiss state
- **Outreach** — `createOutreachDraft` + template picker from scoring
- **Planner** — `upsertPlannerItem` shortlist
- **Analytics** — optional TikTok category performance boost when platform data exists

---

## Verification

| Check | Result |
|---|---|
| `/sponsor-intelligence` loads | ✅ HTTP 200 |
| Recommendations generate | ✅ 5 sections, 194 eligible sponsors in test DB |
| Create lead | ✅ `POST …/lead` → contact id + `created: true` |
| Create outreach draft | ✅ draft email id + `restaurant_opening` template |
| Add to planner | ✅ `{"ok":true}` |
| Mark not interested | ✅ status `not_interested` |
| `/editor`, `/planner`, `/analytics/tiktok`, `/review/inventory` | ✅ HTTP 200 |
| `/sponsors`, `/outreach/compose` | ✅ HTTP 200 |
| TypeScript | ✅ `npx pnpm@10.30.3 -r typecheck` passes |

### Sample verification

```bash
# API (requires ENABLE_OPPORTUNITIES_API=true)
curl -s 'http://localhost:4000/api/sponsor-intelligence?limit=3' | jq '.sections[].id, .counts'

ITEM=$(curl -s 'http://localhost:4000/api/inventory?limit=5' | python3 -c "
import sys,json
for it in json.load(sys.stdin)['items']:
    if it.get('businessName'): print(it['id']); break
")

curl -X POST "http://localhost:4000/api/sponsor-intelligence/from-opportunity/$ITEM/lead"
curl -X POST "http://localhost:4000/api/sponsor-intelligence/from-opportunity/$ITEM/draft-outreach"
curl -X POST "http://localhost:4000/api/sponsor-intelligence/from-opportunity/$ITEM/add-to-planner"
```

---

## Files added

| Area | Path |
|---|---|
| Core scoring | `services/core/src/sponsor-intelligence/scoring.ts` |
| Core recommendations | `services/core/src/sponsor-intelligence/recommendations.ts` |
| Core actions | `services/core/src/sponsor-intelligence/actions.ts` |
| Core barrel | `services/core/src/sponsor-intelligence/index.ts` |
| API route | `services/api/src/routes/sponsor-intelligence.ts` |
| Dashboard page | `dashboard/app/sponsor-intelligence/page.tsx` |
| Dashboard panel | `dashboard/app/sponsor-intelligence/sponsor-intelligence-panel.tsx` |
| Quick actions | `dashboard/components/sponsor-intelligence-actions.tsx` |
| Types | `dashboard/lib/sponsor-intelligence-types.ts` |

**Wired in:** `services/api/src/server.ts`, `services/core/package.json` exports, `dashboard/lib/opportunities-ui.ts` nav.

---

## Not in scope (Phase A)

- LLM-generated pitch copy or explanations
- New opportunity sources or scanners
- Real email send or provider integration
- Persistent “dismiss” without CRM row (uses `sponsor_contacts.status`)
- Per-sponsor ML models or A/B pitch testing

---

## Next steps (Phase B)

- Tune scoring weights from real conversion data (reply rate, simulated send → reply)
- Surface intelligence cards on `/editor` and inventory detail (not only hub page)
- Auto-suggest media kit + template bundle per lane
- Sync “Contact First” queue with scheduled outreach calendar
