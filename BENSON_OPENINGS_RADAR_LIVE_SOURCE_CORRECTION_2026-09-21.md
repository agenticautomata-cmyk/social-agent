# Benson Openings Radar — Live-Source Correction — 2026-09-21

**Branch:** `release/scout-expansion-2026-07-25`  
**Public:** https://benson.kckellie.com/openings · **API:** https://api.kckellie.com/api/openings-radar  
**Host:** mappy (memory-conscious)

**Prior flawed MATCH:** `6fced54ecd0fa8d7` (fixture + `force:true` masquerading as live Substack)

---

## Verdict

BIG LIST is **Facebook-only** (JoyceKC / KCinsiders.joyceinkc, 2026-09-20). Joyce’s Facebook post states she will keep a **running list on KCinsiders Substack** — that article is **not published** (archive + RSS + API miss). Prior acceptance incorrectly attributed a fixture to a fake Substack slug.

Correction: migrated all 10 valid Radar records to honest **Facebook social** provenance, reverted unsupported status/date updates, revoked non-public Calendar events, wired ordinary Watchlist checks for Substack feed + Facebook evidence (no fixture / no `force:true`), and proved second-run zero creates.

---

## 1–2. Configured source inventory

### Watchlist (`source_watchers`) — openings editorial

| Field | KCinsiders Substack feed | KCinsiders Substack home | JoyceKC Facebook |
|---|---|---|---|
| **Watchlist ID** | `f202d3ee-e8b3-4cf8-87e7-9b35fe952d05` | `54ed4c66-eaf5-447a-964b-d11957efed86` | `c5ce8904-b6a6-497e-b0e4-9cf8bf2ece48` |
| **URL** | https://kcinsiders.substack.com/feed | https://kcinsiders.substack.com/ | https://www.facebook.com/JoyceKC/ |
| **Role** | `substack_feed` | `substack_home` | `facebook_evidence` |
| **Platform / adapter** | rss / rss_feed | web / html_watch | web / html_watch |
| **Enabled** | true | true | true |
| **Health** | healthy | pending | healthy |
| **Last successful check** | after correction | — | after correction |
| **Openings path** | RSS → post JSON → roundup ingest | publisher page | public Facebook embed plugin → roundup ingest |

### Already present in `sources` (scrape, not Watchlist)

| ID | Name | listingUrl |
|---|---|---|
| `39665a47-c167-4e06-b57c-a20a93b759e6` | `[Benson] https://substack.com/@joyceinkc` | https://substack.com/@joyceinkc |
| `317a9a00-8c84-4465-a1ce-4c82f8a8a12e` | `[Benson] 19 Restaurant and Drink Openings` | https://open.substack.com/pub/kcinsiders/p/19-restaurant-and-drink-openings… |

### Email

Monitored sender `kcinsiders@substack.com` / Joyce Smith — present in `discovery_email_messages`. No BIG LIST email. Newsletter path already calls `processOpeningsFromEditorialEmail` (no force).

**Canonical Substack URL Benson already had:** `https://kcinsiders.substack.com` (+ feed `/feed`, profile `https://substack.com/@joyceinkc`).

---

## 3–5. Where BIG LIST actually lives

| Surface | Result |
|---|---|
| Substack homepage / archive / RSS / API | **No BIG LIST post** (22 archive items; tease only) |
| Taco Trade-Off (Aug 30) | Teases “my Big List … openings/closings/coming soon” |
| Email archive | No BIG LIST subject/body |
| Notes | Not found via public Notes API |
| **Facebook JoyceKC** | **FOUND** — full 10-business list |
| Instagram | Unrelated / login wall |

**Exact Facebook URL:**  
https://www.facebook.com/JoyceKC/posts/the-big-list-whos-opening-where-when-reporter-note-im-building-my-list-of-restau/1411296867799347/

Public fetch method: Facebook `plugins/post.php` embed (no login/CAPTCHA bypass). Post timestamp: **2026-09-20 16:39 UTC**.

Reporter note on the post: *“I will keep a running list on my KCinsiders Substack.”* → Substack running page is **future**, not live.

---

## 6. Why watcher didn’t produce Openings Radar records before

1. **Wrong assumed URL** — fixture claimed `…/p/the-big-list-whos-opening-where-and-when` (never published).
2. **BIG LIST never on Substack** — social-only Facebook post.
3. **Substack was only a scrape `sources` row**, not a Watchlist openings watcher until this correction.
4. **Acceptance used fixture + `force:true`** — bypassed roundup recognition and live fetch.
5. **No Facebook evidence watcher** — ordinary path never saw the caption.
6. Email path healthy but no BIG LIST mail to backfill.

---

## 7–8. Ingest decision

| Path | Action |
|---|---|
| Substack | Keep monitoring feed/home for future running list / roundups; merge into existing Opening identities when published |
| Facebook | Evidence surface + Watchlist source; live ingest via public embed |
| Fixture | Tests only; production backfill/`accept-big-list` fixture paths removed/disabled |

---

## 9. Provenance table (10 preserved location IDs)

| Business | Location ID | Provenance | Status (corrected) |
|---|---|---|---|
| Alice Scooper's Ice Cream Co. | `63e98b65-e754-4b98-ae9d-e70cdc0f464b` | **facebook** (was fixture_force) | opening_soon |
| Angry Chickz | `7bb1676e-6464-44df-bbe3-c515253e2fbe` | **facebook** | opening_soon · November 2026 |
| The Bad Cat | `efce1c3f-71cc-45b6-b954-bfbc36a905fd` | **facebook** | site_identified · Sept 25 (Radar only) |
| Bam Bird Social | `d1f5a7bb-58a7-440b-a5c9-57629d186da6` | **facebook** | grand_opening_scheduled · Oct 3 |
| Blurred Bar | `06da7e6c-409a-4769-9f77-6b2b63aeb881` | **facebook** | opening_soon · Halloween weekend 2026 |
| Bojangles | `ed4ed657-5edd-452f-b5c6-773af9795231` | **facebook** | site_identified · Nov 10 |
| Boutique Collective | `1c1eb9c4-9aa7-4563-a584-5be3a1b3343d` | **facebook** | opening_soon |
| Charlie D's Seafood and Chicken | `69403034-d704-4263-a69f-d94ada349213` | **facebook** | site_identified · mid-October |
| Donutology | `f504357b-e928-4a31-985d-dd1d708e22da` | **facebook** | grand_opening_scheduled · mid-October (no exact day) |
| Fleet Feet | `6e00adbe-ce06-4aa5-87fb-24a90bc33d3b` | **facebook** | site_identified · early November |

Records were **not deleted**. Fake Substack URL replaced with Facebook URL on `source_url` + `social_post_url`.

**Veronica Beard** opportunity `1315fdc4-0d60-44bb-a9a0-3e3fb5f74902` — intact (`state: planned`).

---

## 10. Ordinary watcher runs (no force / no fixture)

| Run | Watcher | Result |
|---|---|---|
| Facebook #1 (after provenance migrate) | `c5ce8904-…` | parsed **10**, created 0*, updated 10 |
| Facebook #2 | same | parsed **10**, created **0**, updated **10**, opps **0**, events **0** |
| Substack feed #1/#2 | `f202d3ee-…` | feed fetched (20 items); 0 qualifying ≥3-establishment roundups after noise filter (expected — BIG LIST not on Substack yet) |

\*Brief duplicate Bad Cat / Fleet Feet from address-key variance during first live Facebook pass were **merged** back into the canonical IDs; soft address match added to persist. Junk Substack prose parses (photo captions / “It” / “August”) **dismissed**, not treated as authentic discoveries.

---

## 11. Unsupported update corrections (audit)

| Target | Flawed update | Correction | Evidence |
|---|---|---|---|
| Alice | soft_open | → opening_soon | Facebook: “opening soon” |
| Angry Chickz | delayed / December | → opening_soon / November 2026 | Facebook: “November opening” |
| Blurred | delayed / mid-November | → opening_soon / Halloween weekend 2026 | Facebook: “Halloween weekend opening” |
| Donutology | exact Oct 15 + Event | → mid-October approximate; Event cancelled | Facebook: “Mid-October grand opening” (no day) |

Transitions recorded with `source: provenance_correction` + Facebook URL.

---

## 12. Event reassessment

| Business | Decision |
|---|---|
| Bam Bird Social | **Keep** Event `e1562cac-…` — Facebook: “grand opening is Oct. 3” |
| The Bad Cat | **Revoked** Event `e1079eae-…` — projected “plans to open on Sept. 25” ≠ public grand opening |
| Donutology | **Revoked** Event `01cb2222-…` — approximate mid-October only |
| Bojangles | Radar date only (unchanged) |

Promotion heuristic `dated_venue_opening_occasion` removed so projected venue opens no longer mint Calendar events.

---

## 13. Chain opportunity scoring

Chain is no longer an auto-exclude. Creator-value signals (local address, category, exact/approximate window, distinctive concept) decide.

After re-score on live Facebook ingest:

| Chain | Opportunity |
|---|---|
| Angry Chickz | created `6ac6cbab-d62c-4a69-b7f0-afb1d90aa059` (score 5) |
| Bojangles | created `7d5db04b-54be-45b5-8175-09ac95e8ba3a` (score 6) |

---

## 14. Future automation proof

- Watchlist Check now / scheduled path routes openings editorial watchers through `runOpeningsRadarWatcherCheck` (no force).
- Substack RSS + post JSON fetch ready; when Joyce publishes a numbered multi-business running list, ordinary check will ingest and **merge** into existing Opening records by business/address identity.
- Email path unchanged for `kcinsiders@substack.com` roundups.
- Production API refuses `force:true`; fixture backfill disabled.
- Regression tests: Facebook-style inline numbered caption → 10 businesses; Bad Cat projected open → no Event; thin undated chain → no Opportunity; dated chain with creator signals → Opportunity.

---

## Deploy / MATCH

See commit + deploy fingerprint recorded at bottom after `benson:deploy-local`.

**Report path:** `BENSON_OPENINGS_RADAR_LIVE_SOURCE_CORRECTION_2026-09-21.md`
