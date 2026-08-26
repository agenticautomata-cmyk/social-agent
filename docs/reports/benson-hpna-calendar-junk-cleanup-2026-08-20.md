# HPNA Calendar junk cleanup — listing parents, HERE chrome, Vendor CTA

Date: 2026-08-20  
Source: Hyde Park Neighborhood Association  
`sourceId`: `ffeaac23-4ef0-4715-be34-9b716b840b65`  
Listing title identity: `Events — Hyde Park Neighborhood Association Kansas City MO`

**No code changes. No Calendar projection. No HPNA re-ingest. No `content_items` deletes. No dismissal fingerprints. No other sources touched. Legitimate named HPNA children left unchanged. allDay/startTime defects left untouched (out of scope).**

Authority: existing `updateCalendarItem({ planningStatus: 'cancelled' })` (writes `planning_status`/`status` only; fingerprint path runs only for `dismissed`).

Related: [HPNA quality audit](./benson-hpna-calendar-quality-audit-2026-08-20.md).

---

## Source identity

| Field | Value |
| --- | --- |
| Name | Hyde Park Neighborhood Association |
| `sourceId` | `ffeaac23-4ef0-4715-be34-9b716b840b65` |
| Explicitly not touched | Farmers Market source `887d03f4-…` and all non-HPNA sources |

---

## Pre-mutation counts (HPNA Calendar)

| Metric | Count |
| --- | ---: |
| Active HPNA Calendar rows (`planning_status` not cancelled/dismissed/expired) | **27** |
| Active parent listing-title rows | **11** |
| Active `HERE !` chrome rows | **1** |
| Active Vendor Application CTA rows | **1** |
| HPNA `content_items` | **59** |
| `calendar_dismissal_feedback` (global) | **33** |
| `creator_calendar_items` (global) | **925** |

---

## Targeted Calendar ids (13)

### A. Parent / listing-title wrappers (11)

All title = `Events — Hyde Park Neighborhood Association Kansas City MO`.

| # | Calendar id |
| ---: | --- |
| 1 | `07d9daa5-eea5-4b00-9035-bbd913c99393` |
| 2 | `b750ea67-6196-4674-8656-3e1c27030ab5` |
| 3 | `8a7f0cec-0ffb-4bcf-89a4-cfe98d31bace` |
| 4 | `88661eef-1bb1-408c-aa2e-2b08e63381a5` |
| 5 | `964f9e82-e4fb-4a31-be74-a41151ab18cd` |
| 6 | `fad07f53-680d-4daf-9008-21acad534daf` |
| 7 | `b08a96c6-f793-4617-bf3a-d0dceaf002a5` |
| 8 | `2f709577-88ef-4de9-8715-94ae52079f06` |
| 9 | `afa51190-34c6-40fd-8144-263ec317fb40` |
| 10 | `98057151-d895-4ee5-8c7a-6a0187fb3082` |
| 11 | `e05003fc-0503-4956-8b5b-7f54067b4256` |

### B. Chrome title (1)

| Calendar id | Title |
| --- | --- |
| `7fd35545-c824-4058-823d-00c45bca4f1b` | `HERE ! Aug 19 HPNA Beautification Monthly Meeting` |

### C. Vendor Application CTA (1)

| Calendar id | Title |
| --- | --- |
| `1ed5c3a9-3322-4a6c-bd6e-a456943261cc` | `Vendor Application for 2026 Hyde Park Farmers Market` |

---

## Status / ownership safety checks

All 13 rows verified before mutation:

| Check | Result |
| --- | --- |
| `planning_status` | all `suggested` |
| `user_edited_at` | all `null` |
| `created_by` | `benson` or `benson_inventory` only |
| `verification_state` | all `unverified` |
| `source_id` via `source_record_id` | all `ffeaac23-4ef0-4715-be34-9b716b840b65` |
| confirmed / published / operator-owned | **none** |

**Rows skipped:** none.

---

## Mutation

For each of the 13 rows:

```ts
updateCalendarItem(id, { planningStatus: 'cancelled' })
```

| Result | Count |
| --- | ---: |
| Cancelled | **13** |
| Skipped | **0** |

Post-cancel on all 13: `planning_status = cancelled`, `status = cancelled`, `dismissed_at = null`.

---

## Post-cleanup verification

| Metric | Before | After |
| --- | ---: | ---: |
| Active HPNA Calendar rows | 27 | **14** |
| Active parent listing-title rows | 11 | **0** |
| Active `HERE !` chrome rows | 1 | **0** |
| Active Vendor Application CTA rows | 1 | **0** |
| HPNA `content_items` | 59 | **59** (unchanged) |
| `calendar_dismissal_feedback` (global) | 33 | **33** (unchanged) |
| Dismissal feedback rows for the 13 targets | — | **0** |
| `creator_calendar_items` (global) | 925 | **925** (no creates) |
| Other sources with Calendar `updated_at` in last 5 minutes | — | **none** |

### Active HPNA rows remaining (14)

| Calendar id | Title | `start_at` (UTC) |
| --- | --- | --- |
| `70da8511-5d64-4fe4-9eba-fbb6962809e1` | HPNA General Meeting | 2026-08-19 00:00:00+00 |
| `e01e155d-f46e-4e16-8e09-de431f8eb147` | HPNA Board Meeting | 2026-09-01 23:30:00+00 |
| `f40b3f47-72bd-4ae5-ba1a-e376acd157fc` | HPNA Monthly Crime Meeting | 2026-09-09 15:00:00+00 |
| `fcf8765f-ceb6-46e4-87e8-36ee45422962` | HPNA General Meeting | 2026-09-16 00:00:00+00 |
| `dd67b59c-43e2-47ca-a680-e723ed09932d` | HPNA Beautification Monthly Meeting | 2026-09-16 23:00:00+00 |
| `704b71cf-5c6f-4ce4-8136-e2c8f1d15c16` | 2026 Hyde Park Homes Tour | 2026-10-03 15:00:00+00 |
| `569b4081-e1a9-4408-a3e2-062aae74a242` | HPNA Board Meeting | 2026-10-06 23:30:00+00 |
| `2090651e-477a-429e-8005-3c35bcbfcae9` | Hyde Park Farmers Market | 2026-10-11 13:30:00+00 |
| `0230aba3-acfb-44fd-bfc4-734197946c8b` | HPNA Monthly Crime Meeting | 2026-10-14 15:00:00+00 |
| `b5ea6150-9f2c-4ecb-a29d-242cf0a59af1` | HPNA Beautification Monthly Meeting | 2026-10-21 23:00:00+00 |
| `75dba3db-4992-4286-8953-e0a9b90b6b85` | HPNA Board Meeting | 2026-11-04 00:30:00+00 |
| `7f3b8eb6-4026-466e-a4c9-c30b87004b63` | HPNA Monthly Crime Meeting | 2026-11-11 16:00:00+00 |
| `e5517791-b070-4e62-a917-70f73eb2ff69` | HPNA General Meeting | 2026-11-18 01:00:00+00 |
| `b4fc3e43-5df1-4d1a-97b0-a0e073dd953a` | HPNA Beautification Monthly Meeting | 2026-11-19 00:00:00+00 |

### Legitimate named children unchanged

Compared before vs after on id / title / `planning_status` / `source_record_id` / `start_at` (targets excluded from the named set):

| Claim | Proof |
| --- | --- |
| Diffs on named legitimate rows | **none** (`legitDiffs = []`) |
| HPNA Board Meeting Sep 1 | still active (`e01e155d-…`, `2026-09-01 23:30:00+00`) |
| HPNA General Meeting Sep 15 | still active (`fcf8765f-…`, `2026-09-16 00:00:00+00` UTC stamp retained; day/startTime defects out of scope) |
| Hyde Park Homes Tour | still active (`704b71cf-…`) |
| Hyde Park Farmers Market (real event) | still active (`2090651e-…`) |
| HPNA Monthly Crime Meeting rows | all three still active |
| HPNA Beautification named rows | all three still active (`HPNA Beautification%`; chrome `HERE !` cancelled separately) |

---

## Confirmations

| Requirement | Result |
| --- | --- |
| No `content_items` deleted | **yes** (HPNA count 59 → 59) |
| No dismissal fingerprints written | **yes** (global 33 → 33; target feedback count 0; `dismissed_at` null on all cancelled) |
| No Calendar rows created | **yes** (global 925 → 925) |
| Code changed | **no** |
| Projection / re-ingest run | **not run** |
| Other source changed | **no** |
| Confirmed / operator / user-edited rows changed | **no** (none in target set) |
| Farmers Market source `887d03f4-…` touched | **no** |

---

## Out of scope (remaining HPNA defects — do not fix here)

1. **Timed `T00Z` rows stamped `allDay=true`** — separate code / projection task.
2. **Missing `startTime` / wrong-day Aug General Meeting** (`70da8511-5d64-4fe4-9eba-fbb6962809e1`) — separate code task; row left active as-is.

---

## Summary

Cancelled **13** suggested HPNA junk Calendar rows (11 listing parents, 1 `HERE !` chrome, 1 Vendor Application CTA) via safe `planningStatus: 'cancelled'`. **14** legitimate named HPNA children remain active and byte-stable on identity fields. No content deletes, no fingerprints, no creates, no code, no projection, no other sources.
