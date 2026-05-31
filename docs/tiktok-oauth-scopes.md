# TikTok OAuth Scopes & Field Availability

**Phase B** prepares OAuth only. Benson does not assume TikTok will approve every scope.

## Requested OAuth scopes (Login Kit)

| Scope | Purpose | Phase |
|---|---|---|
| `user.info.basic` | `@username`, display name, avatar for connection UI | B |
| `video.list` | List videos via Display API (Phase C sync) | B request · C use |

Additional scopes (Business API, Research API, etc.) are **not** requested in Phase B.

## Connection status values

| Status | Meaning |
|---|---|
| `connected` | Valid tokens stored (encrypted at rest) |
| `disconnected` | No active OAuth session |
| `expired` | Access token past `expires_at` |
| `error` | Last OAuth or token exchange failed |
| `credentials_missing` | `TIKTOK_CLIENT_KEY` / `SECRET` / `REDIRECT_URI` not set |

## Field availability by source

### Manual / CSV import (Phase A — always available)

- `video_id`, title, caption, post URL, `published_at`
- Views, likes, comments, shares
- **Saves**, watch time, avg watch duration, completion rate (when Studio CSV includes them)
- Editorial tags: category, pillar, location, sponsor

### TikTok Display API (`video.list` / `video.query`) — likely after scope approval

- `video_id`, caption/title, share URL, create time, cover image, duration
- Views, likes, comments, shares
- Reach (sometimes)
- **Not** saves, watch time, completion rate (Display API limitation)

### Business / Research / Marketing APIs — approval uncertain (Phase D)

- Extended metrics, audience demographics, traffic sources
- Treat as optional; never block manual import or demo mode

## Token security (Phase B)

- Tokens stored in `creator_platform_connections.access_token_encrypted`
- Phase B uses placeholder encoding (`enc:v1:` base64) — **upgrade before production**
- Tokens are never returned in API JSON or rendered in the dashboard
- Application logs use `[redacted]` for token references

## Environment variables

```bash
TIKTOK_CLIENT_KEY=          # TikTok app client key
TIKTOK_CLIENT_SECRET=       # TikTok app client secret
TIKTOK_REDIRECT_URI=        # Must match Developer Portal, e.g. http://localhost:4000/api/analytics/tiktok/oauth/callback
DASHBOARD_PUBLIC_URL=       # Optional; OAuth callback redirect target (default http://localhost:3000)
```

Legacy publishing tokens (`TIKTOK_ACCESS_TOKEN`, `TIKTOK_OPEN_ID`) remain separate and optional.
