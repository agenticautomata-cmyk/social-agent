# Benson REVOLVE Affiliate Program — Live Verification Test — 2026-08-11

**Date:** 2026-08-12 (UTC)  
**Scope:** Live test of Affiliate & Creator Programs save + verify behavior using REVOLVE  
**Official URL:** https://app.revolve.com/affiliate

---

## Benson input used

```
Save the REVOLVE Affiliate Program to Affiliate & Creator Programs and verify the missing information.
```

**Message sent to Benson (with official URL appended for intake):**

```
Save the REVOLVE Affiliate Program to Affiliate & Creator Programs and verify the missing information. https://app.revolve.com/affiliate
```

**Execution notes:**
- Ask Benson program-library intake handled the **save** portion.
- Intake does **not** automatically run verification from the “verify the missing information” phrase; verification was executed immediately afterward via the same `verifyProgramMissingInfo()` path used by the **Verify missing info** button / `POST /api/program-library/:id/verify` (operator-authorized for this live test).

---

## Expected facts (operator / official page)

| Field | Expected |
|-------|----------|
| Commission | 5% |
| Cookie/tracking window | 7 days |
| Network/application path | Commission Junction |
| Evidence authority | official brand (`app.revolve.com`) |
| Mode | Saved (not Activated) |
| Surfaces | No pitch, Home, Discover, or Action Center work |

---

## Stored record summary

| Field | Actual |
|-------|--------|
| **Record ID** | `ccf55274-5ea8-47c3-984b-38d59d2b6c01` |
| **Stored program name** | REVOLVE |
| **Brand name** | REVOLVE |
| **Commission** | **5%** |
| **Cookie window** | **— (not stored)** |
| **Network/platform** | **— (not stored)** |
| **Application URL** | **— (not found)** |
| **Official program URL (display)** | `https://app.revolve.com/affiliate?utm_source=openai` |
| **Verification status (UI label)** | **Conflicting information** |
| **Evidence authority (commission field)** | **official brand** |
| **Evidence URL (commission provenance)** | `https://app.revolve.com/affiliate?utm_source=openai` |
| **Saved/activated state** | **Saved** (`mode=saved`) |
| **Last verified** | 2026-08-12T01:45:03Z |
| **Web search calls (verify run)** | 1 |

---

## Field-level provenance

| Field | Value | Authority | Verification state | Source URL |
|-------|-------|-----------|-------------------|------------|
| commission/benefit | 5% | official brand | verified official | `https://app.revolve.com/affiliate?utm_source=openai` |
| official program URL | `https://app.revolve.com/affiliate?utm_source=openai` | official brand | conflicting information | `https://app.revolve.com/affiliate?utm_source=openai` |
| cookie window | — | — | — | — |
| affiliate network | — | — | — | — |
| application URL | — | — | — | — |

**Evidence URLs stored:**
- `https://app.revolve.com/affiliate`
- `https://app.revolve.com/affiliate?utm_source=openai`

**Evidence hostnames:** `app.revolve.com` (official REVOLVE domain — not a secondary aggregator)

---

## Duplicate check

| Check | Result |
|-------|--------|
| REVOLVE records in library | **1** |
| Repeat save same message | **Reused** same record ID (`created=false`) |
| Canonical identity | Single row for REVOLVE |

---

## Quiet-surface checks

| Surface | Expected | Actual |
|---------|----------|--------|
| Program mode | Saved | **Saved** ✓ |
| Active partnerships pipeline | Absent | **Not listed** ✓ |
| Content item `programLibraryQuiet` | true | **true** ✓ |
| Content item `quietLibraryOnly` | true | **true** ✓ |
| Content item `homeEligible` | false | **false** ✓ |
| Home eligibility gate | Ineligible | **Ineligible** (`quiet_library_only`, etc.) ✓ |
| Discover exclusion | Excluded | **Excluded** ✓ |
| Pitch created | None | **None observed** ✓ |
| Action Center item | None | **None observed** ✓ |
| Activation | None | **Not activated** ✓ |

Content item: `d722b3a1-2b39-449d-a6e6-b657850cab8e` — topic **REVOLVE — Creator program**, state **planned**, ingest **program_library**.

---

## UI display check

**List card:** `REVOLVE · Saved · KC Local · Creator · 5% · Conflicting information`

**Detail page:**
- Commission / benefit: **5%**
- Official program URL: citation URL with `utm_source=openai`
- Discrepancies panel: operator URL `https://app.revolve.com/affiliate` vs researched URL `https://app.revolve.com/affiliate?utm_source=openai`
- Cookie window, network, application URL: **not shown** (null in API)

---

## Mismatch analysis

| Expected | Actual | Severity |
|----------|--------|----------|
| Commission 5% | 5% stored | **Pass** |
| Cookie 7 days | Not extracted | **Fail** |
| Commission Junction | Not captured | **Fail** |
| Verification **Verified official** (program-level) | **Conflicting information** | **Fail** |
| Official URL saved | Saved (with search `utm_source` suffix) | **Partial** |
| Evidence authority official brand | Commission field uses **official brand** on `app.revolve.com` | **Pass** |
| No secondary source promoted to official | All claim hostnames are `app.revolve.com` | **Pass** |
| Single canonical record | One REVOLVE row | **Pass** |
| Remains Saved / quiet | Saved; quiet metadata confirmed | **Pass** |
| Verify from Benson message alone | Save only via intake; verify requires separate action | **Gap** |

**Root cause of Conflicting information:** Web-search citation appended `?utm_source=openai` to the official URL. Operator-supplied URL (`https://app.revolve.com/affiliate`) and researched URL differ only by query string, triggering an **official program URL** discrepancy even though both resolve to the same REVOLVE program page.

**Root cause of missing cookie/network:** Current `verifyProgramMissingInfo()` enrichment extracts commission via summary regex and official URL from citation URL only. It does **not** parse cookie window or affiliate network fields from the search summary/page content.

---

## Verdict

REVOLVE verification partially succeeded: commission and official-domain evidence are correct, the record is canonical and quiet, and duplicate save reuses the same row. The test **does not pass** overall because cookie window and Commission Junction were not captured, program-level verification shows **Conflicting information** instead of an appropriate official verified state, and Ask Benson does not verify from the message alone.

REVOLVE AFFILIATE VERIFICATION TEST FAILED — cookie window and Commission Junction not extracted; program-level verification is Conflicting information due to URL query-string discrepancy; verify step not chained from Ask Benson save intent
