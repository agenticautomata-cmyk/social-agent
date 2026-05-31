# Share-to-Benson Phase A — Manual Intake Results

**Date:** 2026-05-31  
**Status:** Complete — manual intake backend + dashboard review flow  
**Design source:** [SHARE_TO_BENSON_ARCHITECTURE.md](./SHARE_TO_BENSON_ARCHITECTURE.md)  
**Out of scope (as requested):** Apple Shortcut, PWA Share Target, native iOS, OpenAI Vision, existing providers, scoring, ranking

---

## Summary

Phase A delivers Kellie's **manual capture lane** for Share-to-Benson:

- New `share_intake_submissions` table with full intake/review fields
- `POST /api/intake/share` (JSON + multipart-ready)
- Stub extraction only — **no live OpenAI calls**
- Dashboard **Add Opportunity** form and **Share Intake** review page
- Approve promotes rows into existing `content_items` as `Share Intake` source (`manual` type)
- Reject marks intake terminal without creating opportunities

---

## What Was Built

### Database (migration 22)

| Object | Details |
|---|---|
| `intake_type` enum | `url`, `text`, `image`, `mixed` |
| `intake_review_status` enum | `pending_ai`, `needs_review`, `approved`, `rejected` |
| `intake_source_type` enum | `manual_share` |
| `share_intake_submissions` | All required columns + indexes |

**Files:** `db/migrations/22_share_intake_submissions.sql`, `db/init/22_share_intake_submissions.sql`

### Core module (`services/core/src/intake/`)

| File | Purpose |
|---|---|
| `stub-extraction.ts` | Phase A draft fields from URL/text/image flag — no OpenAI |
| `promote.ts` | Approve → `content_items`; reject; Share Intake source seed-on-demand |
| `storage.ts` | Image file save to `uploads/intake/` (API multipart path; UI placeholder only) |
| `index.ts` | Public exports |

### API (`services/api/src/routes/intake.ts`)

| Method | Path | Behavior |
|---|---|---|
| `POST` | `/api/intake/share` | Create intake → `needs_review` with stub extraction |
| `GET` | `/api/intake` | List by `reviewStatus` (default `needs_review`) |
| `GET` | `/api/intake/:id` | Single intake |
| `POST` | `/api/intake/:id/approve` | Promote to `content_items` |
| `POST` | `/api/intake/:id/reject` | Mark rejected |

Registered when `ENABLE_OPPORTUNITIES_API=true`.

### Dashboard

| Route | Purpose |
|---|---|
| `/intake` | Review pending shares; **Add Opportunity** button |
| `/intake/add` | Manual form: URL, text, notes, category suggestion, image placeholder checkbox |

Nav: `[share intake]` added when `ENABLE_OPPORTUNITIES_UI=true`.

### Seed

- **Share Intake** source (`type: manual`, `config.ingest: share_intake`) added to `seed.ts`

---

## Verification Results

| Check | Result |
|---|---|
| Migration 22 applied | Pass |
| `npx tsc --noEmit` (core, api, dashboard) | Pass |
| Manual URL intake → row | Pass |
| Manual text intake → row | Pass |
| Review list (`GET /api/intake`) | Pass — pending rows returned |
| Approve → `content_items` | Pass — `ingest: share_intake`, `source_url` preserved |
| Reject → `review_status: rejected` | Pass |
| URL dedup on approve | Pass — returns `409 duplicate` if URL exists |
| Existing `/api/content` opportunities | Pass — unchanged |
| Existing scanner providers | Pass — not modified |
| Scoring / ranking | Pass — not modified |

### Live API samples

**Text intake:**

```json
POST /api/intake/share
{ "text": "Test KC food opening on Main St", "categorySuggestion": "business_opening" }
→ reviewStatus: "needs_review", confidenceScore: "0.550"
```

**Approve:**

```json
POST /api/intake/:id/approve
→ contentItem.topic: "Test KC food opening on Main St"
→ metadata.ingest: "share_intake"
```

**URL intake:**

```json
POST /api/intake/share
{ "url": "https://rainydaybooks.com/events" }
→ extractedTitle: "rainydaybooks.com/events"
```

### Script verification

`npx tsx src/scripts/verify-share-intake-phase-a.ts` — promote + reject cycle confirmed against Postgres.

---

## Stub Extraction Behavior (Phase A)

| Input | Extracted title | Confidence | Notes |
|---|---|---|---|
| URL only | `{hostname}{path}` | ~0.35 | No page fetch yet |
| Text only | First line (≤120 chars) | ~0.55 | Full text in `ai_summary` |
| Category suggestion | → `extracted_category` + tag | — | From form |
| Image placeholder | "Shared image opportunity" | ~0.25 | Vision disabled |
| Mixed | Combines signals | max of parts | `intake_type: mixed` |

All submissions land directly in **`needs_review`** (skips `pending_ai` worker for Phase A).

---

## Promotion Mapping (approve → content_items)

| Intake field | content_items field |
|---|---|
| `extracted_title` | `topic` |
| `ai_summary` | `hook`, `script` |
| `original_url` | `source_url` |
| `extracted_date` | `event_starts_at` |
| `extracted_location` | `location_name` |
| `extracted_category` | `metadata.opportunityCategory` |
| `extracted_tags` | `metadata.tags` |
| — | `source_id` → Share Intake source |
| — | `source_external_id` → `share-intake-{id}` |
| — | `metadata.ingest` → `share_intake` |
| — | `state` → `planned` |

Intake row updated: `review_status: approved`, `promoted_content_item_id` set.

---

## Field Coverage (intake table)

| Field | Populated on submit | Source |
|---|---|---|
| intake_type | 100% | Derived from payload |
| source_type | 100% | Always `manual_share` |
| original_url | URL/mixed only | Form/API |
| raw_text | text/mixed only | Form/API |
| ai_summary | 100% | Stub extractor |
| extracted_title | 100% | Stub extractor |
| extracted_category | When suggested | Form |
| confidence_score | 100% | Stub extractor |
| review_status | 100% | Always `needs_review` on create |
| uploaded_image_path | Multipart API only | Not exposed in UI yet |

---

## Source Quality (Phase A)

| Component | Quality | Notes |
|---|---|---|
| **Manual Add form** | ★★★★☆ | URL + text + notes + category — sufficient for Kellie desktop workflow |
| **Stub extraction** | ★★☆☆☆ | Intentionally minimal; titles from hostname/first line |
| **Review UI** | ★★★★☆ | Shows all draft fields, confidence, approve/reject |
| **Promotion** | ★★★★★ | Clean handoff to existing opportunities pipeline |
| **Image upload** | ★☆☆☆☆ | Checkbox placeholder only; multipart API ready |

---

## Engagement / Product Impact

| Metric | Before Phase A | After Phase A |
|---|---|---|
| Manual capture path | None | URL + text via dashboard |
| Share intake review | None | `/intake` inbox |
| Kellie-discovered content in pipeline | Scanner only | + Share Intake source on approve |
| Mobile Share Sheet | Not available | Phase B (Shortcut) |

Kellie can now paste an Eventbrite link or Instagram caption description, review Benson's draft, and approve it into the same **410+** opportunity inventory without waiting for a scanner source.

---

## Remaining Gaps (Phase B+)

| Gap | Phase |
|---|---|
| OpenAI URL fetch + structured extract | B |
| OpenAI Vision for screenshots | B |
| Apple Shortcut "Send to Benson" | B |
| PWA Share Target | C |
| Native iOS Share Extension | D |
| Image file upload in dashboard UI | B |
| `pending_ai` async worker | B |
| Edit fields before approve | B |
| Push notifications | B/C |

---

## Files Changed / Added

| Path | Change |
|---|---|
| `db/migrations/22_share_intake_submissions.sql` | New |
| `db/init/22_share_intake_submissions.sql` | New |
| `services/core/src/schema.ts` | Intake enums + table |
| `services/core/src/intake/*` | New module |
| `services/core/src/scripts/migrate-share-intake.ts` | New |
| `services/core/src/scripts/verify-share-intake-phase-a.ts` | New |
| `services/core/package.json` | `migrate:share-intake`, `./intake` export |
| `services/api/src/routes/intake.ts` | New |
| `services/api/src/server.ts` | Register `/api/intake` |
| `services/core/src/scripts/seed.ts` | Share Intake source |
| `dashboard/app/intake/*` | Review + add pages |
| `dashboard/lib/api.ts` | ShareIntakeSubmission type |
| `dashboard/lib/opportunities-ui.ts` | Nav + Share Intake label |
| `.gitignore` | `uploads/` |

**Not modified:** Scanner providers, scoring, ranking, existing opportunity list logic.

---

## How to Run

```bash
# Migration
cd services/core && npx tsx src/scripts/migrate-share-intake.ts

# Seed Share Intake source (if missing)
cd services/core && npx tsx src/scripts/seed.ts

# API (requires ENABLE_OPPORTUNITIES_API=true)
cd services/api && npx tsx src/server.ts

# Dashboard (requires ENABLE_OPPORTUNITIES_UI=true)
cd dashboard && npm run dev
```

Open `/intake/add` to submit, `/intake` to review and approve.

---

*End of Phase A results.*
