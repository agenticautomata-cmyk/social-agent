# Sponsor Outreach Phase B — Results

**Date:** 2026-05-31  
**Status:** Complete  
**Scope:** Resend live send, `EmailProvider` architecture, outreach queue — approval gate preserved

---

## Summary

Phase B adds real outbound email when `OUTREACH_ENABLE_LIVE_SEND=true` and Resend credentials are configured. Otherwise Benson continues **simulation mode** (Phase A behavior). Every send still requires preview → schedule → **approve** before delivery.

---

## What Was Built

### Provider architecture

`services/core/src/sponsor-outreach/email-providers/`

| Provider | Status |
|---|---|
| **Resend** (`ResendEmailProvider`) | Primary — `POST https://api.resend.com/emails` |
| **Gmail Send-As** (`GmailSendAsProvider`) | Stub — returns not-implemented error |

```typescript
interface EmailProvider {
  readonly providerId: string;
  send(payload: EmailSendPayload): Promise<EmailSendResult>;
}
```

`createEmailProvider()` selects Resend when live mode is ready.

### Environment

| Variable | Purpose |
|---|---|
| `OUTREACH_ENABLE_LIVE_SEND` | `true` to allow live sends (default `false`) |
| `RESEND_API_KEY` | Resend API bearer token |
| `OUTREACH_FROM_EMAIL` | Verified sender (`Name <email@domain>`) |
| `OUTREACH_REPLY_TO` | Optional reply-to header |

Documented in `.env.example`.

### Send mode logic

| Condition | Mode |
|---|---|
| `OUTREACH_ENABLE_LIVE_SEND` + `RESEND_API_KEY` + `OUTREACH_FROM_EMAIL` | **live** (Resend) |
| Otherwise | **simulate** (demo provider, no network) |

### Workflow (unchanged gates)

```
Compose → Preview → Schedule → Approve → Send
```

- `POST /api/outreach/emails/:id/send` — unified send (live or simulate)
- `POST /api/outreach/emails/:id/simulate-send` — explicit simulate only when mode is simulate (403 when live enabled)
- Approval enforced: `status === scheduled` and `approvedAt` set when `approvalRequired`

### Send attempt audit fields

Migration `29_sponsor_outreach_phase_b.sql`:

| Column | Purpose |
|---|---|
| `provider_message_id` | Resend message id |
| `recipient` | Sponsor email used |
| `subject` | Email subject at send time |
| `attempted_at` | Send timestamp (existing) |
| `status` | `simulated` · `sent` · `failed` · `canceled` |
| `error_message` | Failure detail |

### Email statuses

Added: `sending`, `sent` (live success). Kept: `simulated_sent`, `failed`, `canceled`.

### API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/outreach/send-config` | Mode, missing env vars, from/reply |
| `POST` | `/api/outreach/emails/:id/send` | Live or simulate send |
| `GET` | `/api/outreach/emails?view=queue` | Draft / needs_approval / scheduled / sending |

### Dashboard

| Route | Purpose |
|---|---|
| `/outreach/queue` | Queue: scheduled, sending, approve, send/simulate |
| `/outreach/history` | Sent, simulated_sent, failed, canceled + provider ids |
| `/outreach/scheduled` | Redirects → `/outreach/queue` |

`OutreachQueuePanel` shows send mode banner and **Send now** vs **Simulate send** based on config.

### Sponsor CRM

On successful send (live or simulate), `markContactSent()` sets:

- `last_contacted_at` → send time
- `status` → `sent`

---

## Verification

| Check | Result |
|---|---|
| `pnpm -r typecheck` | ✅ Passes |
| `pnpm migrate:sponsor-outreach-phase-b` | ✅ Applied |
| Simulate mode (default env) | ✅ `POST /send` → `simulated_sent`, attempt `provider: demo` |
| Live disabled without API key | ✅ `send-config.mode === simulate`, missing vars listed |
| `POST /simulate-send` when live enabled | ✅ 403 `simulate_disabled` |
| Sponsor `last_contacted_at` after send | ✅ Updated + status `sent` |
| `/outreach/queue`, `/outreach/history` | ✅ HTTP 200 |
| Send attempt records subject | ✅ Stored on attempt row |

### Sample commands

```bash
pnpm migrate:sponsor-outreach-phase-b

curl -s http://localhost:4000/api/outreach/send-config | jq .

# After approve → scheduled:
curl -s -X POST http://localhost:4000/api/outreach/emails/{id}/send | jq .

# Live (requires verified Resend domain):
# OUTREACH_ENABLE_LIVE_SEND=true
# RESEND_API_KEY=re_...
# OUTREACH_FROM_EMAIL="Kellie <outreach@yourdomain.com>"
```

### Enabling live Resend

1. Verify domain in [Resend](https://resend.com/)
2. Set env vars and restart API
3. Ensure sponsor contact has an **email** address
4. Approve email in queue → **Send now**

---

## Not in scope (Phase B)

- Background send worker / cron for `scheduled_send_at`
- Gmail OAuth implementation
- Attachments / media kit PDF upload
- Reply tracking webhooks (Resend webhooks → Phase C)

---

## Next steps (Phase C)

- Scheduled send worker (poll due `scheduled` emails)
- Resend webhook for bounces/replies
- Gmail Send-As provider behind feature flag
