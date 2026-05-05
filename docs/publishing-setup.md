# Publishing Setup

Direct API integration to Instagram and TikTok. No third-party publishing layer (per design choice).

## Instagram (Graph API)

**Prerequisites:**
- Instagram account converted to **Business** or **Creator** (not Personal)
- Instagram account linked to a **Facebook Page**
- Facebook **App** in developer.facebook.com with Instagram Graph API + `instagram_content_publish` permission

**Setup steps:**

1. Create FB app at <https://developers.facebook.com/apps/>
2. Add product: **Instagram Graph API**
3. Generate a **long-lived page access token** (60-day) via the Graph API Explorer:
   - Permissions: `pages_show_list`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`
4. Save token + IG business account ID to `.env` (`IG_PAGE_ACCESS_TOKEN`, `IG_BUSINESS_ACCOUNT_ID`)
5. App must pass **App Review** for `instagram_content_publish` to work outside test users — submit when ready to ship

**Reels publishing flow** (used by `publisher` worker):

```
POST /{ig-user-id}/media          ← upload container with media_type=REELS
                                    body: { video_url, caption, share_to_feed }
                                    → returns container_id

GET /{container-id}?fields=status_code  ← poll until status = FINISHED

POST /{ig-user-id}/media_publish  ← body: { creation_id: container_id }
                                    → returns published media id
```

`video_url` must be publicly accessible HTTPS. Use S3+CloudFront or signed URL with long expiry.

**Limits:**
- 50 published Reels / 24h per IG account
- Video: MP4/MOV, max 1GB, 3-90s, 9:16 ratio

## TikTok (Content Posting API)

**This is the trickier one.**

**App tiers:**
- **Sandbox** — for development. Posts go to drafts only.
- **Production / unaudited** — `inbox` posting only (user must finalize publishing in app).
- **Production / audited** — full **Direct Post** capability (true autonomous publishing).

**Path to audited Direct Post:**
1. Register at <https://developers.tiktok.com/>
2. Create app, request **Content Posting API** product
3. Submit app for audit. Required:
   - Privacy policy + ToS URLs
   - Demo video showing the integration
   - Production-ready domain (no localhost)
4. Audit timeline: typically **2–4 weeks**

**Recommended interim workflow:**
- Build for `inbox` posting first (works without audit). The publisher worker uploads the video; operator finalizes in TikTok app on phone.
- Submit audit in parallel.
- When audit clears, flip a config flag to use Direct Post.

**Inbox posting flow:**

```
POST /v2/post/publish/inbox/video/init/    ← returns publish_id + upload_url
PUT  {upload_url}                          ← upload MP4 in chunks
GET  /v2/post/publish/status/fetch/        ← poll publish_id status
```

**Direct Post flow** (post-audit):

```
POST /v2/post/publish/video/init/
   body: { post_info: { title, privacy_level, ... }, source_info: { source: 'PULL_FROM_URL', video_url } }
   → returns publish_id

GET  /v2/post/publish/status/fetch/        ← poll until status = PUBLISH_COMPLETE
```

**Limits:**
- 6 inbox uploads / 24h (unaudited)
- Direct Post limits depend on app's posting tier

## Token rotation

Both platforms issue access tokens that expire:
- Instagram: 60-day page tokens, refresh via the long-lived token endpoint before expiry
- TikTok: 24h access tokens with 365-day refresh tokens

Phase 5 will include a small token-refresh service that runs daily and updates `.env` / secret store.

## Risks specifically called out

- **TikTok rejection of MP4 specs**: TikTok is picky about codec (H.264), audio (AAC), framerate (≤60fps), and duration (≥3s). Post-production worker normalizes to safe defaults.
- **Instagram "video processing failed"**: usually means audio missing or non-standard frame rate. Same normalization.
- **Public URL requirement**: both platforms pull the MP4 from a URL. We need either S3+public bucket, S3+CloudFront, or Supabase storage with signed long-expiry URLs.
