# Reddit 403 Analysis — Benson / Phase 2A Scanner

**Date:** 2026-05-31  
**Host tested:** `136.32.2.135` (Google Fiber, Kansas City, MO — residential, not datacenter)  
**Context:** Phase 2A `fetchRedditPosts()` calls `https://www.reddit.com/r/kansascity/hot.json` and receives `403 Blocked` from this environment.  
**Scope:** Investigation only — no application code changes.

---

## Executive Summary

Reddit is **intentionally blocking unauthenticated JSON/API-style requests** from this host. The failure is **not** caused by a missing or malformed User-Agent, and **not** explained by datacenter IP reputation alone (this host is residential Google Fiber in KC).

Reddit’s current official policy states:

> **“Traffic not using OAuth or login credentials will be blocked.”**  
> — [Reddit Data API Wiki](https://support.reddithelp.com/hc/en-us/articles/16160319875092-Developer-Platform-Access)

Anonymous `.json` listing endpoints that Phase 2A relies on are therefore **no longer a supported production path**. Custom User-Agent strings do not restore access.

**Lowest-complexity production options (ranked):**

1. **Switch ingest to Reddit RSS/Atom** (`/r/kansascity/hot.rss`) — works anonymously from this host today; minimal setup; loses some fields (score, comment count, flair).
2. **OAuth-authenticated Data API** (script app + `oauth.reddit.com`) — Reddit-supported JSON path; requires developer app registration and token lifecycle; preserves full post metadata.

---

## Failing URL (Phase 2A)

```
https://www.reddit.com/r/kansascity/hot.json?limit=50&raw_json=1
```

Implemented in `services/core/src/providers/reddit.ts` with:

```
User-Agent: Benson/0.1 (Kellie Assistant; +https://github.com/anthonyonazure/social-agent)
Accept: application/json
```

---

## Test Matrix

All tests run from this host on 2026-05-31 unless noted.

| Test | URL / method | User-Agent | HTTP status | Content-Type | Result |
|---|---|---|---|---|---|
| curl (default) | `…/hot.json?limit=3&raw_json=1` | *(curl default)* | **403** | `text/html` | Block page HTML (~190 KB) |
| curl + custom UA | same | Benson/0.1 (…) | **403** | `text/html` | Block page HTML |
| curl + browser UA + browser headers | same | Chrome 124 | **403** | `text/html` | Block page HTML |
| Node `fetch` (no UA) | same | *(none)* | **403** | `text/html` | `statusText: "Blocked"` |
| Node `fetch` + custom UA | same | Benson/0.1 (…) | **403** | `text/html` | Blocked |
| Node `fetch` + browser UA | same | Chrome 124 | **403** | `text/html` | Blocked |
| Playwright Chromium (real browser) | same | *(browser default)* | **403** | `text/html` | Block page in DOM |
| old.reddit.com JSON | `https://old.reddit.com/r/kansascity/hot.json?…` | Benson/0.1 | **403** | `text/html` | Block page HTML |
| Alternate JSON paths | `…/r/kansascity/.json`, `…/hot/.json` | Benson/0.1 | **403** | `text/html` | Blocked |
| HTML listing (not JSON) | `https://www.reddit.com/r/kansascity/hot/` | Chrome 124 | **200** | `text/html` | SPA shell loads |
| **RSS/Atom feed** | `https://www.reddit.com/r/kansascity/hot.rss?limit=3` | Benson/0.1 | **200** | `application/atom+xml` | **Live posts returned** |
| OAuth token (no creds) | `POST https://www.reddit.com/api/v1/access_token` | Benson/0.1 | **401** | `application/json` | `{"message":"Unauthorized","error":401}` — endpoint reachable |
| OAuth API (no token) | `GET https://oauth.reddit.com/r/kansascity/hot?…` | Benson/0.1 | **403** | `text/html` | Same block page |
| Reddit dev docs | `https://www.reddit.com/dev/api/` | *(fetch tool)* | **403** | — | Also blocked without auth |

---

## Response Details (403 JSON request)

### Request

```http
GET /r/kansascity/hot.json?limit=3&raw_json=1 HTTP/2
Host: www.reddit.com
User-Agent: Benson/0.1 (Kellie Assistant; +https://github.com/anthonyonazure/social-agent)
Accept: application/json
```

### Response headers (representative)

```http
HTTP/2 403
retry-after: 0
content-type: text/html
cache-control: private, no-store
date: Sun, 31 May 2026 06:04:48 GMT
via: 1.1 varnish
server: snooserv
strict-transport-security: max-age=31536000; includeSubdomains
x-content-type-options: nosniff
x-frame-options: SAMEORIGIN
x-xss-protection: 1; mode=block
set-cookie: csv=2; Max-Age=63072000; Domain=.reddit.com; …
set-cookie: edgebucket=…; Domain=reddit.com; …
content-length: 189908
```

**Notable absences:** No `X-Ratelimit-*` headers (request never reaches authenticated rate-limit tier). No `WWW-Authenticate` on JSON endpoints (unlike the token endpoint’s clean `401`).

### Response body

- Not JSON — full HTML “network security” interstitial (~190 KB).
- Contains text: **“blocked by network security”** and **“file a ticket below and we'll look into it.”**
- Node reports `statusText: "Blocked"`.

This matches Reddit’s edge WAF behavior: JSON clients expecting `application/json` receive an HTML block page instead of a parseable API error.

---

## Browser Access

**Playwright headless Chromium** navigated to the JSON URL directly:

| URL | Browser status | Notes |
|---|---|---|
| `…/hot.json?limit=3&raw_json=1` | **403** | HTML block page rendered in browser |
| `…/r/kansascity/hot/` | **200** | Normal subreddit HTML shell |

**Conclusion:** Even a real browser session gets **403 on `.json` endpoints** from this host. Browser access to the **HTML** subreddit works; **anonymous JSON does not**.

---

## User-Agent Investigation

| User-Agent | JSON result |
|---|---|
| *(none / curl default)* | 403 |
| `Benson/0.1 (Kellie Assistant; +https://github.com/anthonyonazure/social-agent)` | 403 |
| `Mozilla/5.0 (X11; Linux x86_64) … Chrome/124.0.0.0 Safari/537.36` | 403 |
| Full browser header set (Accept, Sec-Fetch-*, etc.) | 403 |

**Does a custom User-Agent resolve the issue?** **No.**  
Reddit’s docs require a descriptive User-Agent for OAuth clients, but User-Agent alone does **not** grant access to unauthenticated JSON endpoints under current policy.

**Does browser User-Agent spoofing help?** **No** — and Reddit explicitly forbids misrepresenting User-Agent strings for API clients.

---

## old.reddit.com

```
https://old.reddit.com/r/kansascity/hot.json?limit=3&raw_json=1
```

| Status | Content-Type |
|---|---|
| **403** | `text/html` (same block page pattern) |

**Conclusion:** `old.reddit.com` does **not** bypass the block for JSON on this host.

---

## oauth.reddit.com Requirements

### Token endpoint (works without block)

```http
POST https://www.reddit.com/api/v1/access_token
Authorization: Basic base64(client_id:client_secret)
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
```

Without credentials → **401 JSON** `{"message":"Unauthorized","error":401}` (expected, not blocked).

### Authenticated listing endpoint

```http
GET https://oauth.reddit.com/r/kansascity/hot?limit=50&raw_json=1
Authorization: bearer ACCESS_TOKEN
User-Agent: <platform>:<app ID>:<version> (by /u/<reddit username>)
```

Without token → **403 HTML block page** (same as anonymous JSON).

### OAuth flows relevant to Benson

| Flow | App type | Use case | Complexity |
|---|---|---|---|
| **Script app + password grant** | `script` | Server-side bot reading public subs with a dedicated Reddit account | Medium — needs client id/secret + Reddit account credentials; tokens expire in 1 hour |
| **Application-only (`client_credentials`)** | `web` / `script` | Non-user-context reads | Medium — needs registered confidential app; scope may be limited |
| **Installed client grant** | `installed` | Logged-out user context | Higher — device_id management |

After obtaining a token, **all API reads must go to `oauth.reddit.com`**, not `www.reddit.com`.

Reference: [Reddit OAuth2 wiki (Application Only OAuth)](https://github.com/reddit-archive/reddit/wiki/OAuth2#application-only-oauth)

---

## Reddit Developer API Requirements (Current Policy)

Source: [Reddit Data API Wiki — Developer Platform Access](https://support.reddithelp.com/hc/en-us/articles/16160319875092-Developer-Platform-Access)

| Requirement | Detail |
|---|---|
| **Authentication** | OAuth or login credentials required; anonymous traffic blocked |
| **User-Agent** | Required format: `<platform>:<app ID>:<version> (by /u/<username>)` |
| **Rate limit (OAuth)** | 100 queries/minute per OAuth client id (10-minute averaging window) |
| **Rate limit (anonymous)** | Default limit **does not apply** — traffic is blocked instead |
| **Token lifetime** | Access tokens expire after ~1 hour; refresh or re-auth needed |
| **App registration** | Create app at https://www.reddit.com/prefs/apps |
| **Data retention** | Must delete stored user/content when removed from Reddit (48h recommended) |
| **Commercial use** | May require separate Data API terms / approval depending on scale |

Legacy `.json` suffix endpoints on `www.reddit.com` predate the current OAuth-mandatory policy and are **not documented as supported for unauthenticated production use**.

---

## Is Anonymous JSON Access Still Supported?

**No — not for production server-side clients.**

Evidence:

1. **Official policy** explicitly blocks non-OAuth traffic.
2. **This host** gets 403 on all tested `.json` variants (www, old, alternate paths).
3. **Real browser** gets 403 on `.json` URLs.
4. **User-Agent changes** do not restore JSON access.
5. **OAuth infrastructure** remains reachable (401 on token endpoint without creds).
6. **RSS feeds** still return **200** with live post data — Reddit appears to treat Atom/RSS as a separate, still-permitted anonymous surface (for now).

Phase 2A’s `DEMO_MODE` mock fallback masked this failure during development.

---

## Root Cause (for Benson)

The 403 is **not a bug in Benson’s scanner**. It is Reddit enforcing **authenticated API access** at the CDN/WAF layer. Requests to `.json` endpoints without a valid OAuth bearer token (or session cookies tied to a logged-in user) are replaced with an HTML “blocked by network security” page.

Contributing factors ruled out on this host:

| Hypothesis | Ruled out? | Evidence |
|---|---|---|
| Missing User-Agent | Yes | Custom + browser UA tested — still 403 |
| Datacenter IP block | Partially | Host is residential Google Fiber KC; block persists |
| Wrong URL format | Yes | Multiple canonical JSON paths all 403 |
| old.reddit.com bypass | Yes | Same 403 |
| Rate limit (429) | Yes | No rate-limit headers; hard 403 instead |

---

## What Works From This Host Today

### RSS (anonymous, live data verified)

```
GET https://www.reddit.com/r/kansascity/hot.rss?limit=50
→ 200 application/atom+xml
```

Sample live entries captured during testing:

- “What's Happening This Week of May 25, 2026” — `/u/AutoModerator`
- “Red Lobster permanently closes 2 Kansas City area locations” — `/u/normankrasnerkc`
- “Another impressive wedding reception tonight on the north lawn of Liberty Memorial.” — `/u/heycameraman`

Fields available via RSS: title, author, link, published/updated, HTML content snippet, post id (`t3_*`).  
Fields **missing** vs JSON: score, comment count, link flair, stickied flag, direct `selftext`.

### OAuth (not tested with real credentials — requires app registration)

Expected working path once credentials are configured:

1. Register **script** app at reddit.com/prefs/apps
2. `POST /api/v1/access_token` → bearer token
3. `GET https://oauth.reddit.com/r/kansascity/hot?limit=50&raw_json=1` with `Authorization: bearer …`

---

## Production Recommendations (Lowest Complexity First)

### Option 1 — RSS ingest (lowest complexity) ⭐

**Effort:** Low  
**Reliability:** Verified working from this host  
**Tradeoffs:** No score/comments/flair; HTML content needs parsing; RSS availability could change

```
https://www.reddit.com/r/kansascity/hot.rss
https://www.reddit.com/r/kansascity/new.rss
```

Best when: Benson needs **title, author, URL, timestamp, body snippet** and can defer score-based filtering to a later phase.

---

### Option 2 — OAuth script app (lowest complexity *for full JSON metadata*) ⭐

**Effort:** Medium (one-time Reddit app setup + env secrets + hourly token refresh)  
**Reliability:** Reddit-supported path; should work from any IP with valid credentials  
**Tradeoffs:** Requires dedicated Reddit account; token management; must comply with Data API terms

**Minimum env vars:**

```
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_USERNAME=          # script app only
REDDIT_PASSWORD=          # script app only — use app password if 2FA
REDDIT_USER_AGENT=android:com.benson.kc:v0.1 (by /u/yourreddituser)
```

**Request pattern:**

1. Token: `POST https://www.reddit.com/api/v1/access_token` (Basic auth)
2. Listing: `GET https://oauth.reddit.com/r/kansascity/hot?limit=50&raw_json=1` (Bearer auth)

Best when: Phase 2A fields (**score, flair, num_comments**) remain requirements and Benson wants a policy-compliant JSON integration.

---

### Option 3 — Do not pursue

| Approach | Why not |
|---|---|
| User-Agent spoofing alone | Tested — does not work; violates Reddit rules |
| old.reddit.com JSON | Same 403 on this host |
| Scraping HTML + parsing | Fragile, heavy, higher ToS risk vs RSS/OAuth |
| Residential proxy pools | Adds cost/complexity; may still violate unauthenticated API policy |
| DEMO_MODE mocks in production | Not real ingest |

---

## Recommended Path for Benson

**Short term (ship reliable ingest):** Adopt **Option 1 (RSS)** as the anonymous production source for r/kansascity. It works today from this host with zero Reddit developer setup.

**Medium term (restore JSON fields):** Add **Option 2 (OAuth script app)** when score/flair filtering matter for scoring (Phase 2B+). Keep RSS as fallback if token fetch fails.

This two-step approach minimizes immediate complexity while aligning with Reddit’s stated API policy.

---

## Appendix — Commands Used

```bash
# Primary failing request
curl -sS -D - -A 'Benson/0.1 (Kellie Assistant; +https://github.com/anthonyonazure/social-agent)' \
  -H 'Accept: application/json' \
  'https://www.reddit.com/r/kansascity/hot.json?limit=3&raw_json=1'

# RSS (works)
curl -sS -A 'Benson/0.1' 'https://www.reddit.com/r/kansascity/hot.rss?limit=3'

# OAuth token probe (no creds)
curl -sS -X POST 'https://www.reddit.com/api/v1/access_token' \
  -A 'Benson/0.1' -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'grant_type=client_credentials'

# Host IP
curl -s https://ipinfo.io/json
```

---

**Investigation complete. No code changes made.**
