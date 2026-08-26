# TikTok → Instagram crosspost media feasibility audit

**Date:** 2026-08-14 (executed 2026-08-15)  
**Scope:** Read-only. Can Benson obtain a stable playable video asset from a TikTok it already knows about, suitable to hand to Instagram Reel publishing later?  
**DB:** local Benson host `localhost:5433` (`DEMO_MODE=false`).  
**Constraints honored:** no product changes, no deploy, no Instagram post, no token refresh/re-auth, no bulk media download, no third-party downloaders, no yt-dlp added, no new scraper, no new media store, TikTok detection/analytics/Meta auth unchanged.

A watermarked TikTok export is acceptable. A clean original is not required.

---

## Executive summary

**Verdict: D — missing both media retrieval and Meta publishing.**

Detection already works. The official TikTok Display API path Benson uses does **not** return a playable video file. Instagram Reel publish code exists as a stub, but it needs a public HTTPS `video_url`, and live Meta publishing auth is not present.

| Question | Answer |
|---|---|
| 1. Can Benson **detect** a new TikTok? | **Yes.** Live OAuth + Display API `video.list` / `video.query`, persisted to `creator_videos`. Account `@kckellie`, 362 stored TikToks, last successful sync 2026-08-15 04:38 UTC. |
| 2. Can Benson **get** the posted video media? | **No.** Stored fields are metadata + share page + signed cover **image**. Official API extra-field probe on one recent post returned duration/size/embed HTML — **no download/play URL**. |
| 3. Can Benson **hand** media to Meta? | **Only if a public video URL already exists.** `InstagramProvider.publish()` takes `PublishInput.videoUrl`. No TikTok-derived MP4 is available to put there. |
| 4. Is Meta publishing auth already available? | **No.** Connected Meta OAuth is analytics-only and currently **disconnected**. `IG_PAGE_ACCESS_TOKEN` / `IG_BUSINESS_ACCOUNT_ID` are unset, so the live selector returns `MockInstagram`. |

**Playable-asset classification for one recent known Kellie TikTok (`7674018673203383565`):** **G — no usable media path currently.**

What Benson *does* have for that post is **C** (TikTok webpage / `share_url`) plus an unstored official **D** (embed/player HTML page). Those are not video assets. Cover URLs are signed JPEGs, not MP4s, and HEAD from this host returned **404**.

This is not “nearly ready.” Extending the current sync fields will not produce an MP4. Crossposting needs a **new media source** plus **separate Instagram publish auth**.

---

## Existing TikTok pipeline map

```
Kellie publishes in the TikTok app
        │
        ▼
Workers (read-only analytics, not media download)
  milestone-watch          every 15 min (default) → runCreatorAnalyticsSync({ providers: ['tiktok'] })
  benson-pulse             every 4 h (default)    → same TikTok sync + progress brief
  creator-analytics-sync   nightly                → TikTok + Meta analytics
        │
        ▼
syncTikTokAnalytics()
  services/core/src/creator-analytics-sync/tiktok.ts
        │
        ├─ Account / token
        │    getActiveTikTokConnectionRow()
        │    getDecryptedAccessToken()
        │    resolveActiveTikTokCreatorAccountId()
        │    refreshTikTokConnection()          ← not called by this audit
        │    services/core/src/tiktok-oauth/connections.ts
        │    services/core/src/tiktok-oauth/oauth.ts
        │
        ├─ Identity
        │    GET open.tiktokapis.com/v2/user/info
        │      fields: open_id, username, display_name, follower_count
        │    usernameFromShareUrl(share_url)
        │    fallback usernames: connection.platformUsername, then 'kelliekc'
        │    getOrCreateAccount('tiktok', resolvedUsername)
        │    alignTikTokConnectionToAccount()
        │
        ├─ New-post detection / polling
        │    POST /v2/video/list/   fields: id,title,video_description,create_time,share_url,cover_image_url
        │    paginate max_count=20, hard cap 200 videos
        │    loadExistingTikTokVideoIds() → upsert via importVideoRows()
        │    “new” = video_id not already on creator_videos for that account
        │
        ├─ Analytics
        │    POST /v2/video/query/  fields: id,view_count,like_count,comment_count,share_count
        │    importVideoRows(..., source: 'api_display')
        │    snapshots → creator_metrics_snapshots
        │
        └─ Side effects (not media)
             classifyTikTokVideos()
             refreshPostingTimeAnalytics()
             matchPublishedVideosToDrafts()   caption match only
             updateConnectorMetrics('tiktok')
             milestone checks
```

**Live identity (this host):**

| Item | Value |
|---|---|
| TikTok connection | `connected` |
| Username | `kckellie` |
| Granted scopes | `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.list` |
| Token expired? | no (not refreshed in this audit) |
| `TIKTOK_OAUTH_SCOPES` env | unset (granted scopes come from the live connection) |
| Connector | enabled, last success 2026-08-15 04:38 UTC, `post_count=200` (API page cap) |
| Stored TikTok rows | **362** |
| `creator_accounts` | `kckellie` = `oauth_connected`; leftover `kelliekc` = `import_only` |

OAuth start/callback: `services/api/src/routes/creator-analytics.ts` (`/tiktok/oauth/start`, `/tiktok/oauth/callback`).  
Default requested scopes if reconnecting without env override: `user.info.basic` only (`tiktok-oauth/scopes.ts`). Live connection already has Display `video.list`.

**There is no TikTok browser/session watcher.** Instagram session capture (`curator-watchlist/instagram-session.ts`, `instagram-media-capture.ts`) is for **other people’s Instagram** intake, not Kellie TikTok retrieval and not IG publishing.

**There is no yt-dlp / third-party downloader in the repo.**

**Outbound TikTok publish** (`providers/tiktok.ts` `TikTokProvider.publish`) is the opposite direction: Content Posting API `PULL_FROM_URL` requiring `input.videoUrl`. It does not fetch Kellie’s already-posted file.

**Share-to-Benson draft intake** (`intake/video-pipeline.ts` `processShareIntakeMedia`) accepts a video **file Kellie already sent**. That is not the posted TikTok watermarked asset. One draft is linked to a published video; `temp_file_path` is **null** (file gone). That path is not a published-media cache.

---

## Stored TikTok fields

Schema: `creator_videos` + `creator_metrics_snapshots` (`services/core/src/schema.ts`).  
Import mapper: `importVideoRows()` / `upsertVideoWithMetrics()` in `creator-analytics/import.ts`.

### What the live sync requests and persists

| Concept | Official API field | Stored column | In current sync? |
|---|---|---|---|
| TikTok video ID | `id` | `creator_videos.video_id` | yes |
| Title | `title` | `title` | yes |
| Caption | `video_description` | `caption` | yes |
| Created time | `create_time` | `published_at` | yes |
| Share / post URL | `share_url` | `post_url` | yes — **webpage**, not MP4 |
| Cover image | `cover_image_url` | `thumbnail_url` | yes — **signed JPEG/WebP**, not video |
| Author / account | user.info + share URL | `creator_accounts.username` (`kckellie`) | yes |
| Analytics | `view/like/comment/share_count` | `creator_metrics_snapshots` | yes (`source=api_display`) |
| Duration | `duration` | none | **API can return it; sync does not request or store it** |
| Embed link | `embed_link` | none | **not requested / not stored** |
| Embed HTML | `embed_html` | none | **not requested / not stored** |
| Width / height | `width`, `height` | none | **not requested / not stored** |
| Direct media / MP4 URL | — | — | **Display API has no such field** |
| Signed playback URL | — | — | **not present** |
| Local cached file | — | — | **not present** for published posts |

`creator_videos.metadata` is editorial classification (`hashtags`, `classifiedAt`, rules) — not media.

Snapshot `raw` is the import row (`video_id`, `title`, `caption`, `post_url`, `thumbnail_url`, counts). No `video_url` / `download_url` / `embed_link`.

### Sample of recent known Kellie posts (8 most recent)

All eight share the same shape:

- `post_url` = `https://www.tiktok.com/@kckellie/video/{id}?utm_campaign=tt4d_open_api&…` (HTML share page)
- `thumbnail_url` = `*.tiktokcdn-us.com` JPEG/WebP with `x-expires` + `x-signature`
- analytics present from `api_display`
- no playable media URL, no embed URL stored, no local file

| video_id | published_at (UTC) | caption (short) | views | likes |
|---|---|---|---|---|
| `7674018673203383565` | 2026-08-14 22:32 | `#creatorsearchinsights #newinfluencers` | 151 | 11 |
| `7674015776122195214` | 2026-08-14 22:21 | Red Racks closing / thrift | 5032 | 228 |
| `7674015511973268749` | 2026-08-14 22:19 | `#creatorsearchinsights #ijustwanttobenoticed` | 287 | 17 |
| `7673610177261653261` | 2026-08-13 20:07 | 816 Day weekend guide | 1285 | 64 |
| `7673609649723149581` | 2026-08-13 20:05 | Nothing Bundt Cakes Biscoff | 1837 | 85 |
| `7673609542445436173` | 2026-08-13 20:04 | Loose Park | 305 | 33 |

(Two additional recent rows in the same window had the same field shape: share page + signed cover + analytics only.)

---

## One-post media feasibility test

**Post:** TikTok `7674018673203383565` (`@kckellie`), published 2026-08-14 22:32 UTC.  
**Method:** existing stored fields + one authorized Display API `video.query` with extra documented fields. No token refresh. No webpage scrape for playback sources. No third-party downloader. No large file persisted.

### Official API extra fields (authorized, not stored by sync)

`POST https://open.tiktokapis.com/v2/video/query/`  
fields: `id,title,video_description,create_time,share_url,cover_image_url,duration,height,width,embed_html,embed_link,like_count,comment_count,share_count,view_count`

HTTP 200, `error.code=ok`. Returned keys were exactly those fields. **`hasDownloadLikeField=false`.**

| Field | Result |
|---|---|
| `duration` | `20` seconds |
| `width` × `height` | `1080` × `1920` (9:16) |
| `share_url` | TikTok **webpage** |
| `embed_link` | `https://www.tiktok.com/player/v1/{id}…` — **HTML player page** |
| `embed_html` | iframe/blockquote HTML, not a file |
| `cover_image_url` | signed CDN **image** URL (`x-expires` ≈ 2026-08-16 04:00 UTC) |
| download / play / `video_url` | **absent** |

### Fetch tests (not a video asset)

| URL kind | HTTP | Content-Type | Size | Notes |
|---|---|---|---|---|
| Stored `share_url` | 200 | `text/html; charset=utf-8` | n/a (HEAD) | Webpage. Sets TikTok cookies. **Not an MP4.** |
| Live `embed_link` / player | 200 | `text/html; charset=UTF-8` | n/a (HEAD) | Player page. **Not an MP4.** |
| Stored `cover_image_url` | **404** | `text/html` | 278 bytes | Signed image URL already unusable from this host |
| Fresh API `cover_image_url` | **404** | `text/html` | 280 bytes | Same. Cover is still an image contract, not video |

No Range-GET of an MP4 was possible: **no video URL existed to test.**

| Check | Result |
|---|---|
| Stable direct MP4? | no |
| Temporary/signed **video** URL? | no |
| Redirects/cookies required for a video file? | n/a — no video file URL |
| Container / codec? | not inspectable (no file) |
| TikTok watermark on file? | unknown — no file. Kellie accepts watermarked posts. |
| Suitable for Instagram Reel upload? | **dimensions/duration would fit** (20s, 1080×1920) **if** an MP4 existed. Instagram still needs a public HTTPS file URL. Current URLs are HTML pages. |

Temp probe scripts and URL files were deleted. No media was stored.

---

## Actual media path classification (A–G)

For the posted watermarked video Benson would need to hand to Instagram:

| Code | Meaning | This post |
|---|---|---|
| A | Stable direct MP4/video URL | no |
| B | Temporary/signed video URL | no |
| C | TikTok webpage only | **yes — `share_url` is stored and is HTML** |
| D | TikTok embed only | embed exists on Display API (`embed_link` / `embed_html`) but is **not stored**; still HTML, not a file |
| E | Browser-visible playback source during page load | **not tested / not part of current architecture.** No TikTok browser session exists. Not built. |
| F | Existing local media file | **no** for the published post. Linked draft temp file is gone. |
| G | No usable media path currently | **yes — this is the playable-asset answer** |

**Classification: G** (no usable playable video path), with **C** as the only durable URL Benson already stores.

Do not call `share_url` or `embed_link` a video asset.

---

## Existing Meta / Instagram publishing capability

Inspected only. Tokens were **not** refreshed or re-authorized.

### Professional-account auth

| Surface | Status |
|---|---|
| Meta OAuth module | `services/core/src/meta-oauth/` (`oauth.ts`, `connections.ts`, `scopes.ts`) |
| Requested scopes | **`META_OAUTH_READ_SCOPES` only:** `pages_show_list`, `pages_read_engagement`, `instagram_basic`, `instagram_manage_insights` |
| Publish scopes | **`instagram_content_publish` is intentionally excluded** (see `PHASE_E_RESULTS.md`) |
| `creator_platform_connections` Instagram/Facebook rows | **none** |
| `analytics_connectors` instagram / facebook | `connected=false`, `enabled=false` |
| `creator_accounts` instagram `kelliekc` | `connection_status=import_only` |
| Env `IG_PAGE_ACCESS_TOKEN` | **unset** |
| Env `IG_BUSINESS_ACCOUNT_ID` | **unset** |

Instagram professional OAuth for **analytics** exists as code but is not connected on this host. That OAuth would still be **read-only** even if connected.

### Existing publish code

`services/core/src/providers/instagram.ts`

- `InstagramProvider.publish(input)` — real Graph `v21.0/{igUserId}/media` with `media_type=REELS`, then poll `status_code`, then `/{igUserId}/media_publish`
- **Required input:** `PublishInput.videoUrl` — a **publicly fetchable HTTPS video URL**. Also `caption`, `hashtags`.
- **Not supported:** local file upload / resumable binary upload
- Selector `createInstagramProvider()`: mock unless `DEMO_MODE` is false **and** both IG env vars are set → **currently `MockInstagram`**
- Caller: `services/workers/src/workflows/publisher.ts` — publishes `content_items.final_video_url` (HeyGen / post-production path), not TikTok inbound media

`docs/publishing-setup.md` states `video_url` must be publicly accessible HTTPS (S3+CloudFront or long-lived signed URL). Reels limits documented there: MP4/MOV, max 1GB, 3–90s, 9:16.

A TikTok-derived watermarked MP4 **could theoretically satisfy** `video_url` **after Benson hosts it at a public HTTPS URL**. The official TikTok share/embed pages **cannot**. Meta will not pull `tiktok.com/@…/video/…` as a Reel file.

Instagram watchlist download helpers (`downloadInstagramVideoWithSession`) are unrelated: they pull **Instagram** media for intake, using a browser profile, and are not a publish path.

---

## Exact missing pieces

1. **Playable TikTok media.** Display API + current storage cannot supply an MP4. This is not an omitted field in `VIDEO_LIST_FIELDS`; the product does not expose a download URL under granted scopes (`video.list` + user.info.*).
2. **A host Meta can fetch.** Even with an MP4 in hand, Graph Reels need a public `video_url`. Benson has no TikTok-media bucket / CDN path. `final_video_url` is the HeyGen outbound pipeline.
3. **Instagram publish auth.** Need `instagram_content_publish` (and a usable Page token + IG professional account id). Current Meta OAuth is analytics-only and disconnected. Env publish credentials are empty.
4. **A worker that joins 1–3.** No crosspost job exists. Do not build it in this audit.
5. **Optional but unused API metadata:** duration / size / embed could be stored later for eligibility checks. They do not unlock media.

---

## Smallest recommended implementation path

Do **not** start by changing TikTok detection or adding fields to `video.list`. That path is exhausted for media.

Smallest honest sequence:

1. **Choose a media source that is not Display API list/query.** Practical options that stay inside Benson’s current architecture:
   - Kellie shares the **already-posted** watermarked file to Benson (Share-to-Benson / draft intake already accepts video files). Keep that file long enough to host it. This matches how she already posts watermarked TikToks to Instagram.
   - Later, only if TikTok ships an official download/export product and grants it to this app, use that. It is not available now.
2. **Host one MP4 at a public HTTPS URL** Meta can GET (existing publishing docs: S3/CloudFront or long-lived signed URL). Do not point Graph at `tiktok.com` pages.
3. **Add Instagram publish auth separately** from analytics OAuth: `instagram_content_publish` + Page token + IG business/creator account id. App Review will be required outside test users.
4. **Call existing** `InstagramProvider.publish({ videoUrl, caption, hashtags })` with the TikTok caption Benson already stores. Wire a crosspost worker only after 1–3 work on a single post.

Do **not** add yt-dlp, do **not** scrape `playAddr` from the TikTok webpage, and do **not** reuse the Instagram watchlist session downloader for TikTok. Those would be a new brittle retrieval system, not a small extension of the current pipeline.

If Kellie will not supply the posted file, crossposting is **blocked on TikTok’s API**, not on a missing Benson mapper.

---

## Risks / brittleness

- Official Display API is analytics/metadata only. Treating `share_url` or `embed_link` as upload input will fail at Meta.
- Cover CDN URLs are signed and already 404 from this host minutes after sync. Any future scraped playback CDN URL would be at least as fragile (classification B, cookie/referer-bound).
- Sync lists at most **200** videos per run. Detection of brand-new posts is fine; this is not a media archive.
- Draft↔published matching is caption similarity only (`matchPublishedVideosToDrafts`). It does not recover the posted file. Draft temp files are deleted.
- `createInstagramProvider()` silently mocks when env credentials are missing — easy to think publish “works” in demo.
- Meta analytics OAuth must not be confused with publish auth. Connecting Instagram insights does not grant Reels publish.
- Watermarked MP4s are acceptable to Kellie; Instagram may still reject length, size, or audio. The sample’s 20s / 9:16 looks eligible **only if the file exists**.
- Browser playback extraction (classification E) would fight TikTok page protections and is outside current architecture.

---

## Files / functions involved

**TikTok detect / sync / analytics**

- `services/core/src/creator-analytics-sync/tiktok.ts` — `syncTikTokAnalytics`, `fetchTikTokUserProfile`, `usernameFromShareUrl`, `VIDEO_LIST_FIELDS`
- `services/core/src/creator-analytics-sync/index.ts` — `runCreatorAnalyticsSync`
- `services/core/src/creator-analytics/import.ts` — `getOrCreateAccount`, `importVideoRows`, `upsertVideoWithMetrics`
- `services/core/src/tiktok-oauth/connections.ts` — `getActiveTikTokConnectionRow`, `getDecryptedAccessToken`, `resolveActiveTikTokCreatorAccountId`, `alignTikTokConnectionToAccount`
- `services/core/src/tiktok-oauth/oauth.ts` — `refreshTikTokConnection` (not used in this audit)
- `services/core/src/tiktok-oauth/scopes.ts` — `requestedScopesString`, `TIKTOK_OAUTH_DEFAULT_SCOPES`
- `services/workers/src/workflows/creator-analytics-sync.ts`
- `services/workers/src/workflows/milestone-watch.ts`
- `services/core/src/benson-pulse/index.ts` — interval TikTok sync + brief
- `services/api/src/routes/creator-analytics.ts` — TikTok OAuth routes
- `services/core/src/draft-intelligence/tiktok-match.ts` — `matchPublishedVideosToDrafts`

**Stored data**

- `services/core/src/schema.ts` — `creatorVideos`, `creatorMetricsSnapshots`, `creatorAccounts`, `creatorPlatformConnections`, `creatorDraftAssets`

**Existing media helpers (not a published-TikTok path)**

- `services/core/src/intake/video-pipeline.ts` — `processShareIntakeMedia` (operator-shared files)
- `services/core/src/intake/media-storage.ts`, `ffmpeg-utils.ts`
- `services/core/src/curator-watchlist/instagram-media-capture.ts` — Instagram session download (unrelated)
- `services/core/src/providers/tiktok.ts` — outbound TikTok publish (`PULL_FROM_URL`)

**Instagram / Meta publish**

- `services/core/src/providers/instagram.ts` — `InstagramProvider.publish`, `createInstagramProvider`, `MockInstagram`
- `services/core/src/providers/types.ts` — `PublishInput.videoUrl`
- `services/workers/src/workflows/publisher.ts`
- `services/core/src/meta-oauth/scopes.ts` — `META_OAUTH_READ_SCOPES`
- `services/core/src/meta-oauth/oauth.ts`, `connections.ts`
- `services/core/src/creator-analytics-sync/meta.ts` — Instagram **read** media list (permalink/caption/insights), not publish
- `docs/publishing-setup.md`

---

## Crosspost readiness

| Grade | Meaning |
|---|---|
| A | nearly ready |
| B | missing only media retrieval |
| C | missing only Meta publishing |
| D | **missing both ← current** |
| E | blocked by current architecture |

**D**, with a hard constraint on the media half: the **current official TikTok pipeline cannot be extended into retrieval**. That half is blocked unless a new source (Kellie-supplied posted file, or a future official download API) is added. Meta publish code exists but auth and a public `video_url` do not.

TIKTOK CROSSPOST MEDIA AUDIT COMPLETE
NO PRODUCT CHANGES MADE
