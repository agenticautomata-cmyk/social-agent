# Cloudflare Access — Benson Pre-Alpha

Benson has **no in-app login**. Cloudflare Access is the authentication boundary for Kellie and Elliott.

## Local ports

| Service | Port | Expose via tunnel? |
|---------|------|-------------------|
| Dashboard | 3000 | Yes |
| API | 4000 | Yes (or proxy via Next rewrites) |
| Postgres | 5433 | **Never** |

## Recommended tunnel setup

### Option A — Single hostname (simplest)

1. `cloudflared tunnel` → `http://localhost:3000`
2. DNS: `benson.yourdomain.com`
3. Set `NEXT_PUBLIC_API_URL` empty or same-origin; browser calls `/api/*` on the tunnel host (Next rewrites to `localhost:4000` on the server).

### Option B — Split hostnames (TikTok OAuth)

1. `app.yourdomain.com` → `:3000`
2. `api.yourdomain.com` → `:4000`
3. `NEXT_PUBLIC_API_URL=https://api.yourdomain.com`
4. `TIKTOK_REDIRECT_URI=https://api.yourdomain.com/api/analytics/tiktok/oauth/callback`

## Access policy

1. Zero Trust → Access → Applications → Add self-hosted
2. Domain: `benson.yourdomain.com` (and `api.` if split)
3. Policy: **Allow** → Include → emails:
   - `elliott@…`
   - `kellie@…`
4. Default: **Block**

## Routes that must stay protected

Protect the **entire** hostname. Sensitive API paths (no separate auth today):

- `POST /api/outreach/emails/:id/send`
- `POST /api/action-center/execute`
- `POST /api/scanner/run`
- `POST /api/pre-alpha/feedback` (low risk; still private)

## Pre-alpha safety checklist

- [ ] `OUTREACH_ENABLE_LIVE_SEND=false` in production `.env`
- [ ] No `RESEND_API_KEY` on shared host (or live send stays off)
- [ ] `DEMO_MODE=true` for Kellie testing
- [ ] Run `pnpm pre-alpha:smoke` after tunnel is up
- [ ] Verify status banner shows `outreach=simulate`

## Smoke after tunnel

```bash
curl -sf https://benson.yourdomain.com/api/pre-alpha/status | jq '.safety,.outreach'
```

## Kellie invite text

Share the HTTPS URL only. Mention: demo mode, simulated outreach, feedback footer on every page, start at **Home**.
