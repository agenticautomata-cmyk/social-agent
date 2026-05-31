# Sponsor Outreach Architecture

**Date:** 2026-05-31  
**Status:** Design document — **no application code modified**  
**Primary user:** Kellie (creator / business development)  
**Assistant:** Benson  
**Related:** [BENSON_VISION.md](./BENSON_VISION.md), [TIKTOK_ANALYTICS_ARCHITECTURE.md](./TIKTOK_ANALYTICS_ARCHITECTURE.md), [SHARE_TO_BENSON_ARCHITECTURE.md](./SHARE_TO_BENSON_ARCHITECTURE.md), [SHOPPING_INTELLIGENCE_RESULTS.md](./SHOPPING_INTELLIGENCE_RESULTS.md)

---

## Executive Summary

Benson already surfaces **sponsor-friendly opportunities** — editorial picks, shopping/retail openings, celebrity/charity events, estate sales — but Kellie has no system inside Benson to **act** on those matches. Outreach today happens in Gmail, Notes, and memory: media kits live in Drive, contact lists in spreadsheets, follow-ups get lost.

This document designs a **sponsor outreach system** that lets Kellie:

1. Maintain a **media kit library** (PDF versions with metadata).
2. Manage **sponsor contacts** linked to Benson opportunities when relevant.
3. Compose emails from **templates** tuned to KC content pillars.
4. **Schedule** sends with mandatory preview and approval — never auto-send.
5. Track status from lead → sent → replied → converted.

**Design principle:** Human-in-the-loop always. Benson drafts and suggests; Kellie previews, approves, and schedules every email. No public send endpoint. Full audit trail.

**Ethics alignment** ([BENSON_VISION.md](./BENSON_VISION.md)): Benson suggests matches; Kellie initiates outreach. No automated contact without explicit approval.

---

## Problem Statement

| Today | Gap |
|---|---|
| Inventory review flags `sponsorFriendly` opportunities | No CRM for sponsor contacts |
| Editorial picks rank sponsor potential | No outreach workflow or send tracking |
| `content_items` holds discovered businesses/events | No link from opportunity → contact → email |
| No email provider integrated | No scheduled send queue |
| Media kits external (Drive, email attachments) | No versioned kit library in Benson |

**Goal:** Allow Kellie to manage sponsor contacts, attach/select media kits, schedule outreach emails, and track send status — all within Benson.

---

## North-Star Flow

```
Benson opportunity (content_items)
    │
    ▼
Kellie creates / links sponsor contact
    │
    ▼
Benson suggests template + media kit + fit score
    │
    ▼
/outreach/compose — preview email (required)
    │
    ▼
Schedule send time → status: needs_approval
    │
    ▼
Kellie approves → status: scheduled
    │
    ▼
Worker picks up at scheduled_at (rate-limited)
    │
    ├── success → sent (+ update contact.last_contacted_at)
    └── failure → failed (+ failure_reason, retry policy)
    │
    ▼
Kellie marks replied / follow_up_needed / converted manually
```

---

## Phased Delivery

### Phase A — CRM + media kits + compose (no live send)

**Outcome:** Kellie can manage contacts, upload kits, compose and preview emails, save drafts. Sends are **simulated** in demo mode or marked `scheduled` without delivery.

| Work | Detail |
|---|---|
| DB migration | All outreach tables (see Data Model) |
| Media kit upload | PDF to object storage; metadata in DB |
| Sponsor CRUD | Contacts, statuses, opportunity linking |
| Templates | Seed 8 template types with merge fields |
| Compose UI | Preview, schedule picker, approval gate |
| Demo mode | Mock send log; no external API calls |

**Acceptance:** Kellie can prepare a World Cup pitch email with media kit attached, schedule it for Tuesday 9am, and see it in `/outreach/scheduled` awaiting approval.

---

### Phase B — Email provider + send worker

**Outcome:** Approved scheduled emails actually send via chosen provider (see [Email Provider Recommendation](#email-provider-recommendation)).

| Work | Detail |
|---|---|
| Provider adapter | `EmailProvider` interface + Resend implementation |
| Send worker | Cron every 1–5 min; picks `scheduled` where `scheduled_at <= now` |
| Rate limiting | Configurable max sends per hour/day |
| Send log | Immutable `outreach_send_attempts` rows |
| Failure handling | Retry transient errors (max 3); permanent → `failed` |
| Cancel | Allowed until status transitions to `sending` |

**Acceptance:** Kellie approves email; it sends at scheduled time; history shows sent timestamp and provider message ID.

---

### Phase C — Public media kit links + analytics

**Outcome:** Shareable download URLs for kits; outreach analytics dashboard.

| Work | Detail |
|---|---|
| Public links | Signed/tokenized URLs for active kits (`/media-kits/public/:token`) |
| Analytics | Sent count, reply rate, follow-ups due, conversions |
| Benson suggestions | "3 sponsor contacts match this opening" from inventory |

---

### Phase D — Gmail send-as (optional)

**Outcome:** Emails sent from Kellie's actual Gmail address for higher trust.

| Work | Detail |
|---|---|
| Gmail OAuth | Separate from TikTok; send scope only |
| Provider swap | `EmailProvider` implementation for Gmail API |
| Thread tracking | Store Gmail `threadId` for reply detection (future) |

---

## Core Modules

### 1. Media Kit Library

Central store for Kellie's sponsorship PDFs and future collateral.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid | ✅ | |
| `version_name` | text | ✅ | e.g. `"2026 Q2 — KC Lifestyle"` |
| `description` | text | | Audience, rate card summary, highlights |
| `target_audience` | text | | e.g. `"Local restaurants, retail openings"` |
| `file_storage_path` | text | ✅ | Object storage key |
| `file_url` | text | | Internal download URL |
| `public_token` | text nullable | | Phase C — opaque token for public link |
| `public_url` | text nullable | | Phase C — `https://benson.../media-kits/public/{token}` |
| `mime_type` | text | ✅ | `application/pdf` |
| `size_bytes` | bigint | ✅ | |
| `status` | enum | ✅ | `active`, `inactive` |
| `created_at` | timestamptz | ✅ | |
| `updated_at` | timestamptz | ✅ | |
| `created_by` | text | | Kellie / operator id |

**Rules:**

- Only **one default active kit** per target audience (optional constraint; UI warns on conflict).
- Inactive kits remain linkable from historical send logs but hidden from compose picker.
- Max file size: **25 MB** (adjust per provider attachment limits).
- Virus scan optional (ClamAV or provider-side scan).
- PDF only for MVP; images/deck links later via `metadata.links[]`.

**Upload flow:**

```
POST /api/media-kits/upload  (multipart)
    → validate PDF magic bytes
    → store to object storage (local dev: ./storage/media-kits/)
    → insert media_kits row
    → return kit metadata (no public URL until Phase C)
```

**Future public download link (Phase C):**

- Unguessable token (32+ bytes, URL-safe).
- Optional expiry and download count limit.
- Served via authenticated API or CDN signed URL — never direct filesystem path.

---

### 2. Sponsor Contacts

CRM record for each business or individual Kellie may sponsor-pitch.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid | ✅ | |
| `business_name` | text | ✅ | |
| `contact_name` | text | | |
| `email` | text | ✅ | Validated format; unique per business optional |
| `phone` | text | | |
| `website` | text | | |
| `instagram_handle` | text | | Normalized without `@` |
| `tiktok_handle` | text | | |
| `category` | text | ✅ | Align with Benson categories (restaurant, retail, event, luxury, etc.) |
| `notes` | text | | Freeform |
| `sponsor_fit_score` | numeric(4,3) | | 0–1; Benson-computed or manual override |
| `content_item_id` | uuid FK nullable | | Linked Benson opportunity (`content_items.id`) |
| `last_contacted_at` | timestamptz nullable | | Updated on successful send |
| `next_follow_up_at` | timestamptz nullable | | Manual or template-suggested |
| `status` | enum | ✅ | See statuses below |
| `source` | enum | | `manual`, `inventory`, `import`, `benson_suggested` |
| `created_at` / `updated_at` | timestamptz | ✅ | |

**Status enum:**

| Status | Meaning | Typical next action |
|---|---|---|
| `lead` | Identified, not vetted | Research, set fit score |
| `ready_to_contact` | Vetted, ready to pitch | Compose email |
| `scheduled` | Outreach email scheduled | Wait for send / approve |
| `sent` | Last outreach delivered | Wait for reply |
| `replied` | Kellie marked reply received | Negotiate / follow up |
| `follow_up_needed` | Due for follow-up | Compose follow-up template |
| `not_interested` | Declined or unresponsive | Archive |
| `converted` | Sponsorship closed | Track value |

**Status transitions:**

```
lead → ready_to_contact → scheduled → sent → replied → converted
                                      ↘ follow_up_needed ↗
                                      ↘ not_interested
```

- `scheduled` syncs from linked `outreach_emails` row while send is pending.
- On successful send: contact → `sent`, set `last_contacted_at`.
- Kellie manually sets `replied`, `follow_up_needed`, `not_interested`, `converted`.

**Sponsor fit score:**

Computed from linked opportunity when present:

| Signal | Weight |
|---|---|
| `sponsorFriendly` flag | +0.15 |
| Editorial pick appearance (sponsor panel) | +0.10 |
| Category match to Kellie pillars | +0.10 |
| Recency / event timeliness | +0.10 |
| Prior converted sponsor in same category | +0.05 |
| Manual override | Replaces computed score |

Expose breakdown in contact detail UI (same pattern as inventory score cards).

**Opportunity linking:**

- From `/sponsors/[id]`: search `content_items` / inventory API.
- From `/review/inventory`: action **"Add sponsor contact"** pre-fills business name, category, URL, `content_item_id`.
- From editorial picks: **"Draft outreach"** → `/outreach/compose?sponsor=...&template=...`.

---

### 3. Email Templates

Reusable templates with merge fields. Stored in DB; seeded on migration.

| Template key | Purpose | Default subject pattern |
|---|---|---|
| `introduction` | First touch — who Kellie is | `Kansas City content partnership — {{business_name}}` |
| `media_kit_send` | Send kit with brief intro | `Media kit — {{business_name}} × Kellie KC` |
| `follow_up` | Post-send nudge | `Following up — {{business_name}}` |
| `event_specific` | Tied to a specific event/opportunity | `{{event_name}} — partnership idea for {{business_name}}` |
| `world_cup` | World Cup watch party / KC soccer angle | `World Cup in KC — {{business_name}}` |
| `luxury_date_night` | Fine dining, hotels, date-night sponsors | `Date night audience in KC — {{business_name}}` |
| `restaurant_opening` | Grand openings, restaurant week | `Grand opening coverage — {{business_name}}` |
| `estate_sale_retail` | Estate sales, retail, markets | `Local shopping audience — {{business_name}}` |

**Template schema:**

| Field | Type |
|---|---|
| `id` | uuid |
| `key` | text unique |
| `name` | text display |
| `subject_template` | text |
| `body_template` | text (Markdown or HTML) |
| `category` | text optional |
| `active` | boolean |
| `created_at` / `updated_at` | timestamptz |

**Merge fields:**

| Field | Source |
|---|---|
| `{{business_name}}` | sponsor_contacts |
| `{{contact_name}}` | sponsor_contacts |
| `{{category}}` | sponsor_contacts |
| `{{event_name}}` | linked content_items.topic |
| `{{event_date}}` | content_items.event_starts_at |
| `{{location}}` | content_items.location_name |
| `{{kellie_signature}}` | Config block |
| `{{media_kit_link}}` | Phase C public URL or "attached" |
| `{{custom_paragraph}}` | User-editable in compose UI |

Benson may **suggest** `custom_paragraph` via LLM from linked opportunity — Kellie edits before preview.

---

### 4. Scheduled Email Queue

Each outbound email is a durable row — never fire-and-forget.

**Table: `outreach_emails`**

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid | ✅ | |
| `sponsor_contact_id` | uuid FK | ✅ | Recipient |
| `template_id` | uuid FK nullable | | Source template |
| `media_kit_id` | uuid FK nullable | | Attached kit |
| `content_item_id` | uuid FK nullable | | Context opportunity |
| `to_email` | text | ✅ | Snapshot at compose time |
| `to_name` | text | | |
| `from_email` | text | ✅ | Provider from-address |
| `reply_to` | text | | Defaults to Kellie's email |
| `subject` | text | ✅ | Rendered, stored **before** send |
| `body_html` | text | ✅ | Full HTML stored **before** send |
| `body_text` | text | ✅ | Plaintext fallback |
| `scheduled_at` | timestamptz | ✅ | Send not before this time |
| `approval_required` | boolean | ✅ | Always `true` in MVP |
| `approved_at` | timestamptz nullable | | |
| `approved_by` | text nullable | | |
| `status` | enum | ✅ | See statuses |
| `sent_at` | timestamptz nullable | | |
| `provider_message_id` | text nullable | | Resend/SendGrid id |
| `failure_reason` | text nullable | | Last error |
| `retry_count` | integer | ✅ | Default 0 |
| `created_at` / `updated_at` | timestamptz | ✅ | |

**Status enum:**

| Status | Meaning |
|---|---|
| `draft` | Saved, not scheduled |
| `needs_approval` | Scheduled time set; awaiting Kellie approval |
| `scheduled` | Approved; waiting for `scheduled_at` |
| `sending` | Worker claimed; in flight |
| `sent` | Provider accepted |
| `failed` | Permanent or exhausted retries |
| `canceled` | Kellie canceled before send |

**State machine:**

```
draft → needs_approval → scheduled → sending → sent
  │           │              │
  │           │              └──→ canceled
  │           └──→ draft (edit back)
  └──→ canceled

sending → failed (on error)
failed → scheduled (manual retry, re-approval required)
```

**Table: `outreach_send_attempts`** (immutable log)

| Field | Type |
|---|---|
| `id` | uuid |
| `outreach_email_id` | uuid FK |
| `attempted_at` | timestamptz |
| `status` | `success`, `failure`, `rate_limited`, `canceled` |
| `provider` | text |
| `provider_response` | jsonb |
| `error_message` | text |

Every send try appends a row — never update in place.

---

## Safety Rules

Non-negotiable constraints enforced in API, worker, and UI.

| Rule | Enforcement |
|---|---|
| **No automatic sending without approval** | Worker only processes `status = scheduled` AND `approved_at IS NOT NULL`. `approval_required` defaults true; no bypass flag in MVP. |
| **Every email must be previewed before scheduling** | Compose flow requires explicit "Preview" step; `previewed_at` timestamp set on client + validated server-side before `needs_approval`. |
| **Store full email body before send** | `subject`, `body_html`, `body_text` written at schedule time; worker sends stored snapshot only — no re-render at send. |
| **Log all send attempts** | `outreach_send_attempts` append-only. |
| **Allow cancel before scheduled time** | `PATCH` → `canceled` while status in (`draft`, `needs_approval`, `scheduled`). Block cancel once `sending`. |
| **Rate limit outgoing emails** | Worker checks rolling window: default **10/hour**, **50/day** (env-configurable). Excess stays `scheduled` until window opens. |
| **No public send endpoint** | All routes require authenticated session / API key. No webhook-triggered send. Upload endpoints authenticated. |
| **Recipient validation** | Block obviously invalid emails; optional blocklist domain list. |
| **No bulk blind send** | MVP: one recipient per `outreach_emails` row. Batch compose creates multiple rows, each individually approved. |
| **Demo mode** | `DEMO_MODE=true` → simulate send, never call provider. |

**Approval UX:**

```
Compose → Preview (required) → Pick date/time → "Submit for approval"
    → needs_approval
Kellie reviews in /outreach/scheduled → Approve → scheduled
    OR Edit → back to draft
    OR Cancel
```

Optional future: second approver for team accounts — not MVP.

---

## Email Provider Recommendation

### Options compared

| Provider | Pros | Cons | Attachment | Scheduling | Best for |
|---|---|---|---|---|---|
| **Resend** | Simple API, modern DX, good docs, webhooks | From-domain verification required | ✅ | Worker-side (poll) | **MVP default** |
| **SendGrid** | Mature, analytics, high volume | Heavier setup, Twilio ecosystem | ✅ | Worker-side | Scale / marketing team |
| **Mailgun** | Flexible, logs | UI less polished | ✅ | Worker-side | Multi-region |
| **SMTP** | Universal fallback | Deliverability ops on you | ✅ | Worker-side | Self-hosted escape hatch |
| **Gmail API** | Sends from Kellie's real inbox | OAuth complexity, quota limits, audit | ✅ | Worker-side | **Phase D authenticity** |

### Recommended MVP path: **Resend**

1. **Fastest integration** — single API key, REST send, attachment support for PDF media kits.
2. **Clear delivery events** — webhooks map to send log (delivered, bounced).
3. **Reply-To** — set `reply_to: kellie@...` so replies land in Kellie's inbox even if `from` is `outreach@kelliebrand.com`.
4. **No OAuth blocker** — Phase B can ship before Gmail approval.
5. **Provider adapter** — swap to Gmail later without changing queue schema.

**Setup (Phase B):**

- Verify sending domain (SPF, DKIM, DMARC).
- Env: `RESEND_API_KEY`, `OUTREACH_FROM_EMAIL`, `OUTREACH_REPLY_TO`.
- `EmailProvider` interface:

```typescript
interface EmailProvider {
  send(input: {
    to: string;
    from: string;
    replyTo?: string;
    subject: string;
    html: string;
    text: string;
    attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
  }): Promise<{ messageId: string; raw: unknown }>;
}
```

**Phase D migration to Gmail:** Add `GMAIL_SEND_PROVIDER` flag; store OAuth tokens separately; map `threadId` when available. Keep Resend as fallback for system notifications.

**Why not Gmail first:** Google OAuth verification, scope approval, and token refresh add weeks. Kellie needs scheduling and tracking before inbox integration is perfect.

**Why not raw SMTP first:** Deliverability and attachment handling become operational burden without provider dashboards.

---

## Data Model

### Entity diagram

```
media_kits
sponsor_contacts ──> content_items (optional)
    │
    └──< outreach_emails ──> media_kits (optional)
              │              email_templates (optional)
              │              content_items (optional)
              └──< outreach_send_attempts

outreach_analytics_snapshots (Phase C — daily rollups)
```

### Migration

| Migration | Contents |
|---|---|
| `25_sponsor_outreach.sql` | Enums, all tables, indexes, template seed |

**Indexes:**

- `sponsor_contacts(status, next_follow_up_at)`
- `sponsor_contacts(content_item_id)`
- `sponsor_contacts(email)`
- `outreach_emails(status, scheduled_at)` — partial where status = `scheduled`
- `outreach_send_attempts(outreach_email_id, attempted_at DESC)`
- `media_kits(status)`

### Storage

Reuse `assets`-style pattern but **separate table** — media kits are not tied to `content_items`:

| Environment | Storage |
|---|---|
| Local dev | `./storage/media-kits/{uuid}.pdf` |
| Production | S3-compatible bucket `benson-media-kits` |

---

## API Surface

All routes behind `ENABLE_SPONSOR_OUTREACH` (default `false`).

### Media kits

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/media-kits` | List (filter active) |
| `POST` | `/api/media-kits/upload` | Upload PDF |
| `GET` | `/api/media-kits/:id` | Detail + download URL |
| `PATCH` | `/api/media-kits/:id` | Update metadata / status |
| `GET` | `/api/media-kits/public/:token` | Phase C — public download |

### Sponsor contacts

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/sponsors` | List + filter by status/category |
| `POST` | `/api/sponsors` | Create |
| `GET` | `/api/sponsors/:id` | Detail + outreach history |
| `PATCH` | `/api/sponsors/:id` | Update |
| `POST` | `/api/sponsors/from-opportunity/:contentItemId` | Create from inventory row |

### Templates

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/outreach/templates` | List templates |
| `GET` | `/api/outreach/templates/:key` | Single template |
| `PATCH` | `/api/outreach/templates/:id` | Edit body (Kellie customization) |

### Outreach queue

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/outreach/compose/preview` | Render merge fields → HTML (no save) |
| `POST` | `/api/outreach/emails` | Create draft or submit for approval |
| `GET` | `/api/outreach/emails` | List scheduled/history |
| `GET` | `/api/outreach/emails/:id` | Detail + attempts |
| `PATCH` | `/api/outreach/emails/:id` | Edit draft / approve / cancel |
| `POST` | `/api/outreach/emails/:id/retry` | Re-queue failed (requires re-approval) |

**Auth:** Session cookie or `Authorization: Bearer` service token — same pattern as existing API routes. Rate limit compose endpoints separately from send worker.

---

## Workers

| Worker | Schedule | Action |
|---|---|---|
| `outreach-send` | Every 2 min | Claim due `scheduled` emails; rate limit; call provider; log attempt |
| `outreach-follow-up-reminder` | Daily 8am CT | Surface contacts where `next_follow_up_at <= today` |
| `sponsor-fit-suggest` | On inventory scan | Optional: propose new contacts from high sponsor-score items |

**Send worker pseudocode:**

```
FOR email IN SELECT ... WHERE status='scheduled' AND scheduled_at <= now()
  ORDER BY scheduled_at LIMIT batch_size:
  IF rate_limit_exceeded(): BREAK
  UPDATE status='sending' WHERE id AND status='scheduled'  -- optimistic lock
  TRY:
    result = provider.send(snapshot from row + media kit bytes)
    INSERT outreach_send_attempts success
    UPDATE outreach_emails SET status='sent', sent_at=now(), provider_message_id=...
    UPDATE sponsor_contacts SET status='sent', last_contacted_at=now()
  CATCH:
    INSERT outreach_send_attempts failure
    IF retryable AND retry_count < 3:
      UPDATE status='scheduled', scheduled_at=now()+backoff, retry_count++
    ELSE:
      UPDATE status='failed', failure_reason=...
```

---

## UI Pages

Follow dashboard patterns from `/editor` and `/review/inventory` (server page + client panel, feature-flag gated).

### `/sponsors`

**Sponsor contact list**

- Filters: status, category, follow-up due, fit score range
- Columns: business, contact, category, status, fit score, last contacted, next follow-up
- Actions: Add contact, Import CSV (future), link to opportunity
- Banner: "N follow-ups due this week"

### `/sponsors/[id]`

**Contact detail**

- Contact fields (editable)
- Linked opportunity card (if `content_item_id`)
- Fit score breakdown
- Outreach timeline (emails sent, statuses)
- Actions: Compose email, Mark replied, Set follow-up date, Mark converted

### `/media-kits`

**Media kit library**

- Grid/list: version name, target audience, status, created date, file size
- Upload PDF dialog
- Activate / deactivate toggle
- Phase C: copy public link button

### `/outreach/compose`

**Email composer**

- Step 1: Select sponsor (or pre-filled from query param)
- Step 2: Select template
- Step 3: Select media kit (optional)
- Step 4: Edit subject + body (merge preview live)
- Step 5: **Preview** (required) — rendered HTML + attachment indicator
- Step 6: Schedule date/time → Submit for approval

Query params: `?sponsor={id}&template={key}&opportunity={contentItemId}`

### `/outreach/scheduled`

**Approval + upcoming queue**

- Tabs: Needs approval | Scheduled | Sending
- Cards: recipient, subject, scheduled time, kit name
- Actions: Approve, Edit, Cancel, Preview again
- Approval requires checkbox: "I have reviewed this email"

### `/outreach/history`

**Sent and failed log**

- Filter: date range, sponsor, template, status
- Columns: sent at, recipient, subject, status, failure reason
- Expand row → full stored body + send attempts
- Action: Mark contact as replied (links to sponsor detail)

### Navigation

Add to opportunities-era nav (when `ENABLE_SPONSOR_OUTREACH_UI`):

```
Sponsors | Media Kits | Outreach
```

---

## Benson Integration Points

| Source | Integration |
|---|---|
| Inventory review | "Add sponsor contact" / "Draft outreach" on sponsor-friendly rows |
| Editorial picks (sponsor panel) | Bulk "Review sponsor leads" → pre-filtered contact suggestions |
| Command Center (`/editor`) | "Contact businesses" section links to compose with template |
| TikTok analytics (future) | Media kit stats page views when public links enabled |
| BENSON_VISION Phase 3 | Sponsorship cards → compose pre-fill |

**LLM assist (optional, Phase A):**

- Given linked `content_item`, suggest `custom_paragraph` for template.
- Never auto-schedule; output lands in compose editor only.

---

## Analytics (Phase C — Later)

Dashboard route: `/sponsors/analytics` or section on `/sponsors`.

| Metric | Source |
|---|---|
| Emails sent | `COUNT(outreach_emails) WHERE status=sent` by period |
| Replies | Manual mark on contact → `status=replied` |
| Follow-ups due | `next_follow_up_at <= now()` |
| Categories contacted | `GROUP BY sponsor_contacts.category` |
| Converted sponsors | `status=converted` count |
| Estimated sponsorship value | Manual `converted_value` column on contact (Phase C) |
| Template performance | Open/reply rate by template key (reply manual only in MVP) |
| Time to convert | `converted_at - first sent_at` |

**Not in MVP:** Open tracking pixels (privacy), automatic reply detection (Phase D Gmail).

---

## Feature Flags

| Flag | Default | Phase |
|---|---|---|
| `ENABLE_SPONSOR_OUTREACH` | `false` | A — master API gate |
| `ENABLE_SPONSOR_OUTREACH_UI` | `false` | A — dashboard routes |
| `ENABLE_OUTREACH_SEND` | `false` | B — live provider calls |
| `ENABLE_MEDIA_KIT_PUBLIC_LINKS` | `false` | C |
| `ENABLE_OUTREACH_ANALYTICS` | `false` | C |
| `DEMO_MODE` | existing | Simulated sends |

---

## Demo Mode Behavior

When `DEMO_MODE=true`:

- Seed 5 sponsor contacts across categories (restaurant opening, retail, World Cup watch party, estate sale, luxury dining).
- Seed 2 active media kits.
- Compose + preview fully functional.
- Approve + schedule → worker sets `sent` after 5s with mock `provider_message_id`.
- No Resend/Gmail calls.

---

## Security & Privacy

- PII (emails, phone) server-side only; redact in client logs.
- Media kit files served via short-lived signed URLs (15 min).
- Public kit links (Phase C) optional per kit; disabled by default.
- CSRF protection on approve/cancel mutations.
- Audit: `approved_by`, `approved_at`, all send attempts retained 2 years minimum.
- CAN-SPAM: include physical mailing address in template footer config (Kellie-provided).
- Unsubscribe: not applicable to 1:1 sponsor outreach; document as personal business development email.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Email sent without review | Mandatory preview timestamp + approval gate + stored snapshot |
| Wrong attachment | Show kit filename + size in preview; snapshot `media_kit_id` |
| Provider outage | Retry with backoff; failed status visible; no silent drop |
| Duplicate sends | Idempotency key on worker claim; block second `scheduled` for same contact+template within 24h (configurable) |
| Kellie expects Gmail From | Set expectations; Reply-To Kellie; Phase D Gmail |
| Spam complaints | Rate limits; no bulk; personal copy; manual approval |

---

## Success Metrics

| Metric | Target (90 days post Phase B) |
|---|---|
| Contacts in CRM | ≥ 30 active sponsor contacts |
| Outreach sent | ≥ 20 approved emails/month |
| Reply tracking | ≥ 50% of sent marked replied or follow-up |
| Conversions | ≥ 2 marked `converted` |
| Follow-up discipline | ≤ 10% overdue follow-ups unactioned |
| Time to compose | < 10 min from opportunity to scheduled email |

---

## Implementation Order (when approved)

1. Migration + seed templates + demo contacts
2. Media kit upload API + `/media-kits` UI
3. Sponsor CRUD + `/sponsors` UI + opportunity linking
4. Compose + preview + `/outreach/compose` (draft / needs_approval only)
5. Scheduled queue UI + approval flow
6. Resend adapter + send worker (Phase B)
7. History + follow-up reminders
8. Public kit links + analytics (Phase C)
9. Gmail provider (Phase D)
10. Inventory / editor integration buttons

---

## Appendix: Existing Code Touchpoints

| File | Relevance |
|---|---|
| `services/core/src/inventory/editorial-picks.ts` | Sponsor-friendly scoring — feed fit score |
| `services/core/src/inventory/normalize.ts` | `sponsorFriendly` flag |
| `services/api/src/routes/inventory.ts` | Opportunity data for linking |
| `dashboard/app/editor/` | Command Center — contact businesses section |
| `dashboard/app/review/inventory/` | Sponsor contact creation entry point |
| `services/core/src/schema.ts` | `content_items`, `assets` patterns |
| `BENSON_VISION.md` | Ethics: suggest, don't auto-contact |

---

*Document only. No application code, database, or email sends were modified.*
