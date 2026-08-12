# Benson Inventory Column-Projection Memory Fix — 2026-08-11

**Date:** 2026-08-11  
**Authoritative audit:** `docs/reports/benson-home-memory-split-audit-2026-08-11.md`  
**Scope:** `loadIngestedInventoryItems()` column projection only  
**Out of scope:** Home redesign, sponsor intelligence, workers, migrations, retention/window logic, branch-C investigation

---

## Contract audit (pre-implementation)

### Fields read by `normalizeInventoryItem()` and normalization helpers

| Column | Required | Used for |
|--------|----------|----------|
| `id` | Yes | Identity |
| `topic` | Yes | Title, textBlob, whyItMatters |
| `hook`, `script` | Yes | summary / summaryRaw |
| `metadata` | Yes | Category, flags, ingest, eligibility, freshness (`pitchDining`) |
| `state` | Yes | InventoryItem.state |
| `eventStartsAt`, `eventEndsAt` | Yes | Event dates, temporal sanitization, retention WHERE |
| `discoveredAt`, `createdAt`, `updatedAt` | Yes | Freshness, sorting, command center |
| `locationName` … `locationResolutionError` | Yes | Location fields on InventoryItem |
| `sourceUrl` | Yes | CTA, eligibility, sponsor scoring |
| `relevanceScore`, `urgencyScore` | Yes | Command center confidence |
| `coverageFormat`, `suggestedCoverageFormat` | Yes | InventoryItem fields |
| `firsthandVisited` | Yes | InventoryItem field |
| `creatorValueStatus`, `lifecycleStatus` | Yes | Creator-facing filter, home eligibility |

### Query-only columns (WHERE / ORDER BY, not normalized)

`sourceId`, `sourceExternalId`, `sourceUrl`, `eventStartsAt`, `eventEndsAt`, `discoveredAt`, `createdAt` — used in predicates and `contentItemsChronologicalOrder`; not required in SELECT result.

### Explicitly omitted (confirmed safe for `loadIngestedInventoryItems()`)

| Column | Omit? | Reason |
|--------|-------|--------|
| **`raw_payload`** | **Yes** | Never read by normalize or Home/Action Center/Studio Pulse/sponsor-intel on `InventoryItem` |
| **`location_candidates`** | **Yes** | Only used by `loadMapOpportunitySources()` (unchanged full-row load) |
| **Captions** (`caption_instagram`, `caption_tiktok`, hashtags) | **Yes** | Not consumed downstream of inventory load |
| **HeyGen/video URLs** | **Yes** | Not consumed |
| **`creator_relevance_explanation`** | **Yes** | Not consumed |
| **`topic_embedding`** | **Yes** | Not consumed |
| **`content_category`** | **Yes** | Category derived from `metadata.opportunityCategory` |
| Pipeline/video workflow columns | **Yes** | Not consumed on Home path |

`loadMapOpportunitySources()` intentionally **not changed** — still selects full row + `location_candidates`.

---

## Implementation

### Files changed

| File | Change |
|------|--------|
| `services/core/src/inventory/inventory-load-projection.ts` | **New** — explicit 31-column select + documented omitted list |
| `services/core/src/inventory/load-ingested.ts` | `loadIngestedInventoryItems()` uses spread projection instead of `item: contentItems` |
| `services/core/src/inventory/normalize.ts` | Accepts `InventoryNormalizeSource \| ContentItem` (output shape unchanged) |
| `services/core/src/inventory/load-ingested-projection.test.ts` | **New** — 7 regression tests |

### Selected columns (31)

`id`, `topic`, `hook`, `script`, `metadata`, `state`, `eventStartsAt`, `eventEndsAt`, `discoveredAt`, `createdAt`, `updatedAt`, `locationName`, `locationStatus`, `formattedAddress`, `locationLat`, `locationLng`, `googlePlaceId`, `googleMapsUrl`, `locationWebsiteUrl`, `locationConfidence`, `locationSource`, `locationVerifiedAt`, `locationResolutionError`, `sourceUrl`, `relevanceScore`, `urgencyScore`, `coverageFormat`, `suggestedCoverageFormat`, `firsthandVisited`, `creatorValueStatus`, `lifecycleStatus`

### Omitted columns (37 documented in `INVENTORY_LOAD_OMITTED_CONTENT_COLUMNS`)

Includes: `rawPayload`, `locationCandidates`, `topicEmbedding`, all caption/hashtag fields, HeyGen/video URLs, `creatorRelevanceExplanation`, workflow/approval columns, `campaignId`/`type`/`language`, etc.

---

## Tests

| Suite | Result |
|-------|--------|
| `load-ingested-projection.test.ts` | **7/7 pass** |
| `home-memory-stabilization.test.ts` | **10/10 pass** (includes Home response contract fields) |

Coverage includes: identical normalize output (projected vs full fixture), metadata eligibility, employment intent, temporal/freshness, script/hook summaries, source join fields, omitted-column assertions.

---

## Memory verification (workers OFF)

### TEST 1 — inventory only (`home-memory-split-audit.ts test1`)

| Metric | BEFORE (audit) | AFTER (projection fix) | Delta |
|--------|---------------:|-----------------------:|------:|
| Baseline RSS (KB) | 170,592 | 168,640 | — |
| DB rows (retention window) | 1,699 | 1,676 | — |
| Eligible items | 534 | 533 | — |
| Elapsed (ms) | 3,220 | 3,979 | — |
| **RSS delta immediate (KB)** | **+473,196** | **+470,232** | **−2,964 (~0.6%)** |
| heapUsed delta immediate (KB) | +22,039 | +23,703 | +1,664 |
| **RSS delta +30s (KB)** | **+376,508** | **+374,856** | **−1,652 (~0.4%)** |
| Retained item tracked bytes | ~1,007,804 | ~1,005,911 | ~same |

**Verdict:** Inventory-only RSS **did not materially improve**. The ~462–470 MB RSS spike persists despite omitting ~1.2 MB on-disk `raw_payload` + other columns per retention window. Dominant cost appears to be PostgreSQL driver / V8 object-graph / RSS-not-returned-to-OS overhead, not the omitted column payload alone.

### ONE full Home request (fresh API, stabilization code active)

| Metric | Value |
|--------|------:|
| API node baseline RSS (KB) | 199,456 |
| Post-Home RSS (KB) | 1,197,248 |
| **Post-Home RSS delta (KB)** | **+997,792 (~974 MB)** |
| Post-Home +30s RSS (KB) | 1,140,632 (+941,176 KB from baseline) |
| Wall time | 21.3 s |
| Response bytes | 26,403 |
| API telemetry | `rssBeforeKb: 198728 → rssAfterKb: 1196232` (+998,504 KB) |

Home remains large; branch-C investigation was **not** performed per instructions.

---

## Behavior verification

- `InventoryItem` output shape: **unchanged** (fixture deep-equal tests)
- Home response contract: **unchanged** (stabilization test #10)
- Query predicates and retention window: **unchanged**
- No migration required

---

## Conclusion

Column projection is **correct and tested** — it reduces DB payload and documents the inventory load contract — but it **does not materially reduce process RSS** for inventory-only or full Home loads. Further memory wins likely require a different strategy (e.g. streaming/chunked load, releasing intermediate arrays earlier, or branch-level work not addressed here).

**No additional optimization attempted** per stop instruction.

---

NOT READY — inventory-only RSS delta remained ~470 MB vs pre-fix benchmark ~473 MB (~0.6% change); success criterion of materially lower inventory RSS not met
