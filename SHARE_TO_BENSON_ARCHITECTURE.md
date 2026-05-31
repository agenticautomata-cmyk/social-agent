# Share-to-Benson Architecture

**Date:** 2026-05-31  
**Status:** Design document — **no application code modified**  
**Primary user:** Kellie (iPhone / iPad)  
**Assistant:** Benson  
**Related:** [BENSON_VISION.md](./BENSON_VISION.md), [KELLIE_PRODUCT_SPEC.md](./KELLIE_PRODUCT_SPEC.md), [PHASE_2M_PUBLIC_APPEARANCES_RESULTS.md](./PHASE_2M_PUBLIC_APPEARANCES_RESULTS.md)

---

## Executive Summary

Share-to-Benson is Kellie's **mobile capture lane** — a way to send anything she finds in the wild (Safari, social apps, email, texts, screenshots) into Benson with one gesture from the iOS Share Sheet. Benson receives the payload, runs AI extraction (URL fetch + OpenAI Vision for images), creates a **draft intake record**, and surfaces it in Kellie's review queue. Kellie approves or rejects; approved items promote into the existing `content_items` opportunity pipeline.

This closes the biggest gap in the current system: **410+ scanner-ingested rows** cover configured sources, but Kellie discovers high-value KC content constantly on Instagram, Facebook, Eventbrite, and via screenshots that no scanner will ever poll.

**Design principle:** Capture first, structure second. Kellie should never fill a form on her phone.

---

## Primary User

| Attribute | Detail |
|---|---|
| **Who** | Kellie — KC content strategist, non-developer |
| **Devices** | iPhone (primary), iPad |
| **Contexts** | Scrolling social feeds, email newsletters, group texts, event invites, in-person flyers photographed |
| **Apps** | Safari, Facebook, Instagram, TikTok, Eventbrite, Threads, Mail, Messages, Notes, Photos |
| **Goal** | "I saw something — send it to Benson" in under 5 seconds |
| **Constraint** | Must work without leaving the app she's in (Share Sheet only) |

---

## North-Star Flow

```
iPhone / iPad
    │
    ▼
Share Sheet  ──►  "Send to Benson"
    │
    ▼
POST /api/intake/share
    │
    ├── URL payload      ──► fetch / OG scrape / platform adapter
    ├── text payload     ──► direct LLM extraction
    ├── image payload    ──► OpenAI Vision OCR + structure
    └── mixed payload    ──► merge signals, highest-confidence wins
    │
    ▼
share_intake_submissions  (review_status: pending_ai)
    │
    ▼
AI extraction worker
    │
    ▼
Draft opportunity fields populated  (review_status: needs_review)
    │
    ▼
Kellie review inbox  ──►  Approve  ──►  content_items (published path)
                      ──►  Reject   ──►  terminal, optional reason
                      ──►  Edit     ──►  correct AI fields, then approve
```

**Benson notification (push or in-app):**

> *"Benson received your share — extracting details now. You'll review it in a moment."*

> *"Benson found a KC event: **Royals Rally autograph session** — Jan 31 at Kauffman. Ready for your review."*

---

## Intake Methods

### 1. URL Share

Kellie taps Share on a link. iOS passes one or more URLs to Benson.

| Source | Example URL pattern | Extraction strategy |
|---|---|---|
| **Safari / generic web** | `https://…` | HTTP fetch → readability extract → OG tags → LLM structure |
| **Event pages** | Venue sites, Visit KC, venue calendars | Date/venue/price from HTML + JSON-LD `Event` schema |
| **Facebook events** | `facebook.com/events/…` | OG tags + public scrape; note: many FB URLs require logged-in context — store raw URL, flag `needs_review` if thin |
| **Instagram posts** | `instagram.com/p/…`, `/reel/…` | oEmbed if available; else OG title/description; Vision fallback if Kellie also shares screenshot |
| **TikTok** | `tiktok.com/@…/video/…` | oEmbed API → caption text → LLM |
| **Eventbrite** | `eventbrite.com/e/…` | Structured event page scrape; Eventbrite often has JSON-LD |
| **Threads** | `threads.net/@…/post/…` | OG scrape + text extract |
| **MLB / team sites** | `mlb.com/…`, `chiefs.com/…` | Existing provider patterns where applicable |

**URL normalization (for dedup):**

- Strip tracking params (`utm_*`, `fbclid`, `igsh`)
- Lowercase host
- Resolve mobile → canonical (`m.facebook.com` → `www.facebook.com`)
- Instagram/TikTok: extract stable post ID segment

### 2. Text Share

Kellie copies caption, email body, group-text blurb, or Notes snippet and shares as plain text.

| Source | Typical content | Extraction focus |
|---|---|---|
| **Social captions** | "Mahomes signing at Dick's Leawood Friday 6pm" | Celebrity, venue, date, time |
| **Emails** | Newsletter event roundup | Multiple events → split or primary event |
| **Messages** | "Y'all going to Planet Comicon?" | Weak signal — low confidence, needs_review |
| **Notes** | Kellie's own draft list | Trust Kellie's text; moderate confidence boost |

**Multi-event text:** If LLM detects 2+ distinct events, create **one intake row per event** (linked by `intake_batch_id`) so Kellie reviews individually.

### 3. Image Share

Kellie shares a screenshot, photo of a flyer, or saved social graphic from Photos.

| Image type | Examples | Vision priorities |
|---|---|---|
| **Event posters** | Planet Comicon flyer, charity gala invite | Title, date, time, venue, price, URL/QR |
| **Social graphics** | Instagram story screenshot | Caption overlay text, handle, date |
| **Business openings** | "Grand opening Saturday" window sign | Business name, address, date |
| **Hotel / spa promos** | Package deal graphic | Property, price, dates, inclusions |
| **Restaurant specials** | Happy hour / chef tasting flyer | Restaurant, deal, dates |
| **Celebrity appearances** | Autograph signing announcement | Name, store, date, wristband rules |
| **Estate / liquidation** | Estate sale sign photo | Address, dates, company |
| **Closings** | "Last day" window sign | Business name, location, date |

**Image handling:**

1. Accept `multipart/form-data` or base64 in JSON (Shortcut-friendly)
2. Store original in object storage (`uploaded_image` → storage URL)
3. Generate thumbnail for review UI
4. Pass to OpenAI Vision with KC-specific extraction prompt
5. If QR code detected → decode URL → optional URL enrichment pass

---

## Preferred User Flow (Detailed)

### Happy path — URL from Safari (15 seconds)

1. Kellie reads Eventbrite listing for Rainy Day Books author signing
2. Tap **Share** → **Send to Benson** (Phase B+: Shortcut; Phase D: native app)
3. iOS POSTs URL to `/api/intake/share`
4. API returns `202 Accepted` + `{ intakeId, status: "pending_ai" }` immediately
5. Kellie returns to Safari — no blocking spinner required
6. Background worker fetches page, extracts fields (~5–15s)
7. Push notification: *"Benson parsed your Eventbrite share — review ready."*
8. Kellie opens review card in dashboard (or Shortcuts notification deep link)
9. Card shows: title, date, venue, Benson summary, confidence, original link
10. Kellie taps **Approve** → promotes to `content_items`, `review_status: published`

### Happy path — Screenshot from Instagram (20 seconds)

1. Kellie screenshots IG story: Chiefs player appearance at Rally House
2. Photos → Share → **Send to Benson**
3. Image uploaded; Vision extracts text + celebrity + venue + date
4. Confidence 0.72 (partial date) → `needs_review` with Benson note: *"Benson couldn't confirm the year — please check."*
5. Kellie edits date, approves

### Edge path — Facebook event (logged-in wall)

1. Kellie shares FB event URL
2. Scrape returns thin OG data only
3. Benson creates draft with title from OG, flags `confidence_score: 0.45`
4. Review card shows: *"Benson couldn't read full details — add what you know or share a screenshot."*
5. Kellie optionally attaches screenshot in review UI (Phase 2 enhancement) or rejects

---

## API Design

### `POST /api/intake/share`

**Purpose:** Single intake endpoint for all Share Sheet, Shortcut, PWA, and future native app submissions.

**Auth:** Bearer token (Kellie's personal API key) or session cookie from dashboard. Shortcuts use long-lived device token scoped to `intake:write`.

**Content types:**

| Content-Type | Use case |
|---|---|
| `application/json` | Shortcuts, programmatic clients |
| `multipart/form-data` | Image + optional text/URL fields |

#### Request body (JSON)

```json
{
  "intakeType": "mixed",
  "url": "https://www.eventbrite.com/e/example-123",
  "text": "Optional caption or email excerpt Kellie shared alongside the URL",
  "imageBase64": null,
  "sourceHint": "eventbrite",
  "clientPlatform": "ios-shortcut",
  "clientVersion": "1.0",
  "submittedBy": "kellie@example.com",
  "metadata": {
    "appBundleId": "com.apple.mobilesafari",
    "shareSheetItems": ["url", "text"]
  }
}
```

#### Request body (multipart)

| Field | Type | Required |
|---|---|---|
| `intakeType` | `url \| text \| image \| mixed` | Yes |
| `url` | string | No |
| `text` | string | No |
| `image` | file (jpeg/png/heic/webp, max 10 MB) | No |
| `sourceHint` | string | No |
| `submittedBy` | string | Yes (or from auth) |

At least one of `url`, `text`, or `image` must be present.

#### Response `202 Accepted`

```json
{
  "intakeId": "550e8400-e29b-41d4-a716-446655440000",
  "reviewStatus": "pending_ai",
  "message": "Benson received your share and is extracting details.",
  "estimatedProcessingSeconds": 15
}
```

#### Response `409 Conflict` (duplicate detected)

```json
{
  "error": "duplicate",
  "message": "Benson already has this opportunity.",
  "existingIntakeId": "…",
  "existingContentItemId": "…",
  "matchReason": "url"
}
```

#### Response `422 Unprocessable`

```json
{
  "error": "empty_payload",
  "message": "Share must include a URL, text, or image."
}
```

### Supporting endpoints (future)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/intake/share/:id` | Poll intake status + extracted fields |
| `GET` | `/api/intake/share` | List Kellie's recent submissions (`?reviewStatus=needs_review`) |
| `PATCH` | `/api/intake/share/:id` | Kellie edits AI fields before approve |
| `POST` | `/api/intake/share/:id/approve` | Promote to `content_items` |
| `POST` | `/api/intake/share/:id/reject` | Terminal reject with reason |
| `POST` | `/api/intake/share/:id/retry` | Re-run AI extraction |

---

## Database Design

### New table: `share_intake_submissions`

Separate from `content_items` until Kellie approves. Keeps scanner pipeline clean and preserves raw share artifacts for audit.

```sql
CREATE TYPE intake_type AS ENUM ('url', 'text', 'image', 'mixed');

CREATE TYPE intake_review_status AS ENUM (
  'pending_ai',
  'needs_review',
  'approved',
  'rejected',
  'published'
);

CREATE TYPE intake_source_type AS ENUM (
  'safari',
  'facebook',
  'instagram',
  'tiktok',
  'eventbrite',
  'threads',
  'email',
  'sms',
  'notes',
  'screenshot',
  'unknown'
);

CREATE TABLE share_intake_submissions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id           UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,

  -- Provenance
  source_type           intake_source_type NOT NULL DEFAULT 'unknown',
  intake_type           intake_type NOT NULL,
  original_url          TEXT,
  raw_text              TEXT,
  uploaded_image        TEXT,          -- storage URL to original image
  uploaded_image_thumb  TEXT,          -- thumbnail for review UI

  -- AI extraction output
  ai_summary            TEXT,
  ai_extracted_title    TEXT,
  ai_extracted_date     TIMESTAMPTZ,
  ai_extracted_end_date TIMESTAMPTZ,
  ai_extracted_location TEXT,
  ai_extracted_business TEXT,
  ai_extracted_category TEXT,
  ai_extracted_tags     TEXT[],        -- e.g. {'autograph_signing','chiefs','free_event'}
  ai_raw_response       JSONB NOT NULL DEFAULT '{}',

  -- Quality
  confidence_score      NUMERIC(4,3),  -- 0.000–1.000
  extraction_errors     TEXT[],
  dedup_match_reason    TEXT,          -- url | title_date | semantic | null

  -- Review workflow
  review_status         intake_review_status NOT NULL DEFAULT 'pending_ai',
  reviewed_by           TEXT,
  reviewed_at           TIMESTAMPTZ,
  rejection_reason      TEXT,

  -- Promotion link
  content_item_id       UUID REFERENCES content_items(id) ON DELETE SET NULL,
  intake_batch_id       UUID,          -- groups multi-event text splits

  -- Audit
  submitted_by          TEXT NOT NULL,
  submitted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  client_platform       TEXT,          -- ios-shortcut | pwa | dashboard | native-ios
  client_metadata       JSONB NOT NULL DEFAULT '{}',

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_share_intake_campaign_status
  ON share_intake_submissions (campaign_id, review_status, submitted_at DESC);

CREATE INDEX idx_share_intake_original_url
  ON share_intake_submissions (original_url)
  WHERE original_url IS NOT NULL;

CREATE UNIQUE INDEX idx_share_intake_url_dedup
  ON share_intake_submissions (campaign_id, original_url_normalized)
  WHERE original_url_normalized IS NOT NULL AND review_status NOT IN ('rejected');
```

**Note:** Add computed column or application-level `original_url_normalized` for dedup index (not shown in user spec but required for URL matching).

### Field mapping — intake → `content_items` (on approve)

| Intake field | `content_items` field |
|---|---|
| `ai_extracted_title` | `topic` |
| `ai_summary` | `hook` + `metadata.benson.summary` |
| `original_url` | `source_url` |
| `ai_extracted_date` | `event_starts_at` |
| `ai_extracted_end_date` | `event_ends_at` |
| `ai_extracted_location` | `location_name` |
| `ai_extracted_category` | `metadata.opportunityCategory` |
| `ai_extracted_tags` | `metadata.tags` |
| `uploaded_image` | `assets` row (`kind: intake_screenshot`) |
| — | `source_id` → seeded **"Share Intake"** source (`source_type: manual`) |
| — | `source_external_id` → `share-intake-{intake_id}` |
| — | `discovered_at` → `submitted_at` |
| — | `state` → `planned` (enters existing scorer pipeline) |

### Review statuses

| Status | Meaning | Kellie sees? | Next step |
|---|---|---|---|
| `pending_ai` | Received; worker not finished | Optional "Processing…" list | Worker → `needs_review` or auto-reject on hard failure |
| `needs_review` | AI extraction complete | **Yes — primary inbox** | Kellie approve / reject / edit |
| `approved` | Kellie accepted; promotion in progress | Brief confirmation | Worker creates `content_items` row |
| `rejected` | Kellie or system rejected | Archive only | Terminal |
| `published` | Linked `content_item_id` exists | Moves to main Opportunities | Scorer runs on `content_items` |

**Auto-promote threshold (optional, off by default):** If `confidence_score ≥ 0.92` AND dedup clean AND category in allowlist, Benson may skip to auto-create `content_items` in `planned` state — still shown in inbox with "Benson auto-drafted" badge. Kellie retains reject. Matches HITL default from [KELLIE_TRANSFORMATION_PLAN.md](./KELLIE_TRANSFORMATION_PLAN.md).

---

## AI Extraction Pipeline

### Worker: `intake-extraction-worker`

Triggered on `POST /api/intake/share` via async queue (Redis job, pg NOTIFY, or inline for MVP).

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Intake row  │────►│ Route by type    │────►│ Merge signals   │
│ pending_ai  │     │ url/text/image   │     │ + confidence    │
└─────────────┘     └──────────────────┘     └────────┬────────┘
                                                       │
                                                       ▼
                                              ┌─────────────────┐
                                              │ Dedup check     │
                                              └────────┬────────┘
                                                       │
                              ┌────────────────────────┼────────────────────────┐
                              ▼                        ▼                        ▼
                         duplicate               needs_review              low confidence
                         → 409 or link           → inbox                   → flag + inbox
```

### URL extraction steps

1. Detect `source_type` from URL hostname
2. Fetch with mobile User-Agent, 10s timeout
3. Parse JSON-LD `Event`, Open Graph, `<meta>` tags
4. Platform adapters (priority order):
   - Eventbrite → structured scrape
   - TikTok → oEmbed
   - Instagram → oEmbed / OG (fallback)
   - Facebook → OG only + low-confidence flag
   - Generic → readability + LLM
5. If Kellie also sent `text`, merge: text overrides ambiguous URL fields

### Text extraction

Single GPT-4o call with KC-aware system prompt:

- Output JSON schema matching intake fields
- Require `confidence_score` per field and overall
- Split multi-event text into batch when detected

### Image extraction — OpenAI Vision

**Model:** `gpt-4o` (vision) or successor.

**System prompt core:**

> You extract structured Kansas City content opportunities from images. Focus on events, businesses, deals, and appearances in the KC metro. Return JSON only. If the image is not KC-relevant or not an opportunity, set `is_opportunity: false`.

**Extraction schema (Vision output):**

```json
{
  "is_opportunity": true,
  "title": "Planet Comicon Kansas City 2026",
  "business_name": null,
  "celebrity_names": ["Veronica Taylor"],
  "venue": "Kansas City Convention Center",
  "address": "301 W 13th St, Kansas City, MO 64105",
  "event_date": "2026-03-27",
  "event_end_date": "2026-03-29",
  "start_time": "13:00",
  "end_time": "20:00",
  "price": "$45 weekend pass",
  "discount": null,
  "category": "convention",
  "tags": ["comic_con", "fan_event", "autograph_signing"],
  "ticket_url": null,
  "phone": null,
  "notes": "QR code points to planetcomicon.com/tickets",
  "confidence": 0.88,
  "is_kc_metro": true
}
```

### Vision processing requirements

OpenAI Vision **must attempt extraction** for all of the following when present in the image:

| Domain | Fields to extract |
|---|---|
| **Events** | Event name, date, time, venue, address |
| **Businesses** | Business name, address, opening/closing context |
| **Celebrities** | Named people (athletes, actors, authors, chefs) |
| **Pricing** | Admission, ticket tiers, discounts, promo codes |
| **Hospitality** | Hotel packages, spa packages, staycation deals |
| **Dining** | Restaurant specials, chef appearances, tasting menus |
| **Commerce** | Estate sales, liquidation sales, grand openings, closings |
| **Charity** | Nonprofit name, beneficiary (route to charity category if detected) |
| **Appearances** | Autograph signings, meet-and-greets, wristband rules |
| **Contact** | URL, phone, QR destination (decode if readable) |

**Category taxonomy** (align with existing scanner phases):

`free_event`, `business_opening`, `business_closing`, `liquidation_sale`, `estate_sale`, `charity_event`, `celebrity_event`, `autograph_signing`, `public_appearance`, `convention`, `fan_event`, `restaurant_special`, `hotel_package`, `spa_package`, `luxury_deal`, `sports_appearance`, `other`

**KC geo guard:** If Vision detects non-KC location with confidence > 0.8, set `is_kc_metro: false` and `confidence_score` cap at 0.4 — Benson copy: *"This doesn't look like KC — still want to add it?"*

---

## Deduplication Logic

Run **after** AI extraction, **before** setting `needs_review`.

### Layer 1 — Exact URL match

```
normalized_url = normalize(original_url)
IF EXISTS content_items WHERE source_url normalized match
   OR EXISTS share_intake_submissions WHERE original_url_normalized match
      AND review_status NOT IN ('rejected')
THEN → duplicate (matchReason: url)
```

Reuse scanner normalization: strip fragments unless meaningful (`#charity-event` suffixes from Phase 2L/2J), strip tracking params.

### Layer 2 — Platform ID match

| Platform | Stable ID |
|---|---|
| Eventbrite | `/e/{slug}-{id}` numeric id |
| Instagram | `/p/{shortcode}` |
| TikTok | `/video/{id}` |
| Facebook | `/events/{id}` |

Store as `source_external_id` equivalent on intake: `intake_external_id`.

Check against `content_items.source_external_id` where source is Share Intake or matching platform source.

### Layer 3 — Title + date fuzzy match

```
IF ai_extracted_title AND ai_extracted_date:
  slug = slugify(title)
  IF EXISTS content_items WHERE
       similarity(topic, title) > 0.85
       AND event_starts_at::date = ai_extracted_date::date
  THEN → duplicate (matchReason: title_date)
```

Use `pg_trgm` extension (already common in Postgres stacks) or application-level Levenshtein.

### Layer 4 — Semantic match (optional Phase 2)

```
embedding = embed(ai_extracted_title + ai_summary)
IF cosine_similarity(embedding, content_items.topic_embedding) > 0.85
   AND event date within ±1 day
THEN → duplicate candidate (matchReason: semantic)
```

Surface as **"Possible duplicate"** rather than hard 409 — Kellie decides.

### Dedup UX

| Result | Behavior |
|---|---|
| **Hard duplicate (URL)** | `409` on POST if within 7 days; or link existing row on GET |
| **Soft duplicate (title/date)** | Create intake with `dedup_match_reason`, show warning banner in review |
| **Semantic near-dup** | Benson: *"Similar to **Royals Rally** you approved Jan 15 — duplicate or update?"* |

---

## Apple Ecosystem Integration Phases

### Phase A — Manual Add button (dashboard)

**Effort:** Low | **Timeline:** First implementation slice

Add **"+ Share to Benson"** on dashboard (desktop + mobile web):

- Paste URL field
- Paste text area
- Upload image drag-and-drop
- Calls same `POST /api/intake/share`

**Why first:** Validates API, AI pipeline, and review UI without iOS Shortcuts complexity. Kellie can use Safari "Copy link" → dashboard paste on iPhone immediately.

```
Dashboard (mobile web)
  └── [ + Add to Benson ]
        ├── Paste link
        ├── Paste text
        └── Upload photo
```

### Phase B — Apple Shortcut "Send to Benson"

**Effort:** Medium | **Timeline:** After Phase A stable

Pre-built iOS Shortcut Kellie installs once:

1. Receives **Share Sheet** input (URLs, text, images, any combination)
2. Maps Share Sheet variables → JSON or multipart POST
3. Authenticates with personal API token (stored in Shortcut Keychain)
4. Shows notification: *"Sent to Benson ✓"*

**Shortcut actions:**

```
Receive [URLs, Text, Images] from Share Sheet
  → If URL count > 0 → set url variable
  → If Text exists → append to text variable
  → If Image exists → POST multipart with image
  → Else → POST JSON
  → Get Contents of URL: POST /api/intake/share
  → Show Notification "Benson received your share"
```

**Distribution:** Host `.shortcut` file on dashboard; QR code on Settings page. Document iOS steps with screenshots.

**Limitations:** Shortcuts cannot add a custom icon to Share Sheet natively — appears under **Shortcuts** submenu unless using Phase C/D.

### Phase C — PWA Share Target

**Effort:** Medium–High | **Timeline:** After dashboard is installable PWA

Register Benson dashboard as **Web Share Target** in `manifest.json`:

```json
{
  "share_target": {
    "action": "/intake/share",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "url": "url",
      "text": "text",
      "files": [{ "name": "image", "accept": ["image/*"] }]
    }
  }
}
```

**Requirements:**

- HTTPS deployed dashboard
- Kellie adds Benson to Home Screen
- **"Send to Benson"** appears directly in Share Sheet when PWA installed

**Fallback:** Phase B Shortcut remains for apps that don't expose share targets cleanly.

### Phase D — Native iOS app

**Effort:** High | **Timeline:** Phase 3+ (optional)

Thin SwiftUI shell:

- Share Extension target (appears in Share Sheet as **Benson** with branded icon)
- Background upload queue (retry offline shares)
- Push notifications for `needs_review`
- Optional: widget showing pending review count

**When justified:** Kellie hits Shortcut reliability limits (large images, auth refresh, background failures) or wants App Store discoverability.

**Shared backend:** Same `POST /api/intake/share` — no forked API.

### Phase comparison

| Phase | Share Sheet visibility | Offline | Push | Dev cost |
|---|---|---|---|---|
| **A** Manual Add | N/A (in-app) | No | No | ★☆☆☆☆ |
| **B** Shortcut | Under Shortcuts menu | Limited | Via Shortcut | ★★☆☆☆ |
| **C** PWA Share Target | Home Screen install | Limited | Web push | ★★★☆☆ |
| **D** Native app | Full extension + icon | Yes | APNs | ★★★★★ |

**Recommended path:** A → B → C → (D only if needed)

---

## For Kellie — Review Experience

*(Completes the mobile → Benson → approval loop from Kellie's perspective.)*

### Intake review inbox (new dashboard tab or filter)

**Route:** `/intake` or `/approvals?source=share`

**Card layout:**

```
┌─────────────────────────────────────────────────────────────┐
│  Benson · From your iPhone · 2 min ago                      │
│  📷 Screenshot · Instagram                                   │
│                                                             │
│  Chiefs autograph signing at Dick's Leawood                 │
│  Fri Feb 17 · 6:00 PM · Dick's Sporting Goods, Nall Ave    │
│                                                             │
│  Benson's summary: Player signing event — wristband FCFS.   │
│  Confidence: 78%  ⚠ Confirm date (year inferred)           │
│                                                             │
│  [ View original screenshot ]  [ View link ]                │
│                                                             │
│  [ Approve ]  [ Edit ]  [ Reject ]                          │
└─────────────────────────────────────────────────────────────┘
```

### Edit modal

Kellie can override any AI field before approve:

- Title, date, time, venue, business, category, tags
- Edits stored in `client_metadata.kellie_edits` for future model tuning

### Benson copy rules (review)

| Situation | Benson says |
|---|---|
| High confidence | *"Benson is confident this is a KC opportunity."* |
| Medium confidence | *"Benson extracted this from your screenshot — please confirm the date."* |
| Duplicate warning | *"This looks similar to **Planet Comicon** already in your list."* |
| Not KC | *"Benson doesn't think this is in the KC metro — your call."* |
| Extraction failed | *"Benson couldn't read this image — try a clearer photo or paste the link."* |

### Approve → what Kellie expects

1. Intake moves to `published`
2. New row appears in **Opportunities** with source **"Share Intake"**
3. Scorer runs (existing pipeline) — relevance/urgency bars populate
4. Item enters normal approval flow if scorer drafts script (`script_drafted`)

---

## For Security & Auth

| Concern | Mitigation |
|---|---|
| **API token theft** | Personal intake token; rotatable in Settings; scoped to `intake:write` + `intake:read` only |
| **Image malware** | MIME validation; max 10 MB; scan/store outside web root; no execution |
| **SSRF on URL fetch** | Blocklist private IPs; allowlist optional; 10s timeout; no redirect to file:// |
| **Prompt injection in shared text** | Sanitize; system prompt ignores instruction overrides in user content |
| **PII in screenshots** | Storage retention policy (90 days); Kellie-only access |
| **Rate limiting** | 60 shares/hour per user (generous for Kellie; blocks abuse) |

---

## For Error Handling

| Error | HTTP | User message |
|---|---|---|
| Empty payload | 422 | *"Share must include a link, text, or photo."* |
| Image too large | 413 | *"Photo too large — try a screenshot instead of full-res."* |
| URL fetch failed | 202 → intake `needs_review` with error | *"Benson couldn't open that link — saved for your review."* |
| Vision unreadable | 202 → low confidence | *"Benson couldn't read this image clearly."* |
| Duplicate URL | 409 | *"Benson already has this one."* |
| Worker crash | intake stays `pending_ai` > 5 min → alert | Ops retry; Kellie sees *"Still processing…"* |

**Idempotency:** `Idempotency-Key` header (UUID from Shortcut) prevents double-submit on iOS retry.

---

## Integration with Existing System

### Relationship to scanner pipeline

```
Scanner sources (410+ rows)          Share-to-Benson (Kellie-initiated)
        │                                      │
        └──────────────┬───────────────────────┘
                       ▼
              content_items (planned)
                       │
                       ▼
                 Scorer worker
                       │
                       ▼
              Opportunities inbox
```

Share intake is **`source_type: manual`** with seeded source name **"Share Intake"** — distinct from Reddit, Visit KC, etc. Metadata includes `ingest: "share_intake"` and `intakeSubmissionId`.

### No changes to existing providers

Per current project rules: Share-to-Benson is a **parallel intake lane**, not a modification to Phase 2A–2M scanner providers.

### Overlap with Phase 2M

When Kellie shares a Collect-A-Con screenshot before the scanner runs:

- Dedup Layer 1 catches URL if she shared the link
- Dedup Layer 3 catches title/date if scanner already ingested convention row
- Soft duplicate UX prevents double inbox clutter

---

## Implementation Roadmap (Future — Not Started)

| Step | Deliverable | Depends on |
|---|---|---|
| 1 | Migration: `share_intake_submissions` table | — |
| 2 | `POST /api/intake/share` + auth | Step 1 |
| 3 | `intake-extraction-worker` (URL + text) | Step 2 |
| 4 | Vision extraction for images | Step 3 |
| 5 | Dedup layers 1–3 | Step 3 |
| 6 | Dashboard Phase A: Manual Add + review inbox | Step 2 |
| 7 | Apple Shortcut template (Phase B) | Step 2 stable |
| 8 | PWA share_target manifest (Phase C) | Deployed HTTPS |
| 9 | Semantic dedup layer 4 | pgvector on intake titles |
| 10 | Native iOS (Phase D) | Optional |

---

## Open Questions

1. **Push notifications:** APNs (Phase D) vs web push (Phase C) vs email digest for `needs_review`?
2. **Multi-campaign:** Kellie has one campaign today — intake assumes single `campaign_id` from auth context.
3. **Facebook/Instagram auth:** Long-term, Meta oEmbed token may be required for reliable IG/FB extraction.
4. **Auto-approve threshold:** Default off; revisit after 30 days of Kellie review data.
5. **Batch approve:** If Kellie shares email newsletter with 10 events, review UX needs batch actions.

---

## Related Documents

- [BENSON_VISION.md](./BENSON_VISION.md) — assistant persona and review philosophy
- [KELLIE_PRODUCT_SPEC.md](./KELLIE_PRODUCT_SPEC.md) — dashboard approvals UX baseline
- [PHASE_2M_PUBLIC_APPEARANCES_RESULTS.md](./PHASE_2M_PUBLIC_APPEARANCES_RESULTS.md) — share intake fills mobile discovery gap for appearances
- [PHASE_2_KC_DATA_PLAN.md](./PHASE_2_KC_DATA_PLAN.md) — scanner dedup patterns (`source_external_id`, embeddings)

---

*End of Share-to-Benson architecture.*
