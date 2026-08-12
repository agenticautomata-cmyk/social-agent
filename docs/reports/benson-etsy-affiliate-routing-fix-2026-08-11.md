# Benson Etsy Affiliate Routing Fix — 2026-08-11

**Date:** 2026-08-12 (UTC)  
**Scope:** Ask Benson Affiliate & Creator Programs URL routing regression (Etsy Help article)  
**Regression input:**

```
Store affiliate info
https://help.etsy.com/hc/en-us/articles/360000335987-The-Etsy-Affiliates-Program-and-Creator-Collective
```

---

## Root cause

1. **Intent miss:** `isProgramLibrarySaveIntent()` only recognized `save`, not `store`.  
   `"Store affiliate info <URL>"` returned `handled: false` from `tryProgramLibraryIntake()`.
2. **Fall-through:** Ask Benson then entered generic evidence orchestration.
3. **Bad entity extract:** Host brand used the first hostname label → `help.etsy.com` → **Help**.
4. **Ambiguous chooser:** Evidence matching queried `business_name:Help` and returned  
   `Did not mutate — entity match is ambiguous`.
5. **Stale context:** Prior SCHEELS conversation entity context remained a soft hint in evidence orch, but was only reached because Affiliate & Creator Programs intake failed to claim the message.

---

## Routing order before / after

| Stage | Before | After |
|-------|--------|-------|
| 1. `tryProgramLibraryIntake()` | Missed (`store` not a persist verb) | **Claims** on `store/save/add/persist` + affiliate/creator/influencer/referral/ambassador (+ URL) |
| 2. Evidence orchestration | Ran → Help entity chooser | **Not reached** for this input |
| Brand from URL | `help` → Help | Registrable domain → **Etsy** |
| Paid search on plain Store | N/A (never saved) | **0** |
| Mode | N/A | **saved** (quiet) |

Affiliate & Creator Programs intake already ran **before** evidence orchestration in `ask.ts`; the fix makes that gate actually claim affiliate-store messages.

---

## Entity extraction fix

- Added `extractBrandFromProgramUrl()` — uses registrable/root brand domain.
- Generic host labels never become brands: `help`, `support`, `www`, `shop`, `blog`, `affiliate`, `partners`, `partner`, `creator`, `influencer`, `account`, `app`, …
- `help.etsy.com` → **Etsy** (never Help)
- Path slug → program name **Etsy Creator Collective** when Creator Collective is present
- Evidence classifier (`extractBusinessNameCandidates`) uses the same brand helper so Help is not offered even if orchestration were reached

---

## Stale-context behavior

- Prior conversation SCHEELS URL is only a soft hint inside evidence orchestration.
- A clear affiliate-program Store + new brand URL is claimed at message level by Affiliate & Creator Programs intake **before** soft context applies.
- Live retest answer does **not** mention SCHEELS; Etsy is not attached to SCHEELS.

---

## Save vs verify

| Wording | Behavior |
|---------|----------|
| `Store affiliate info <URL>` | Save/reuse only — **no** paid verify |
| `Store affiliate info and verify it <URL>` | Save/reuse + explicit `verifyProgramMissingInfo()` chain |

---

## Tests

`services/core/src/program-library/etsy-routing.test.ts`:

- Store + Etsy Help URL → Affiliate & Creator Programs
- Store recognized as persist intent
- `help.etsy.com` → brand Etsy, never Help
- Classifier does not emit Help
- Canonical reuse on repeat; quiet/Home/Discover gates
- Plain Store → 0 search calls; Store + verify → verify chained

---

## Exact live retest

**Input (exact):**

```
Store affiliate info
https://help.etsy.com/hc/en-us/articles/360000335987-The-Etsy-Affiliates-Program-and-Creator-Collective
```

**Ask Benson answer:**

```
WHAT I DID
Reused **Etsy Creator Collective** in Affiliate & Creator Programs.

STILL NEEDED
Missing fields require verification (commission, cookie window, network/platform).

NEXT
Verify missing info
```

| Check | Result |
|-------|--------|
| Durable Etsy record ID | `83dcbf6f-9250-46c7-b8fc-2dff056ace47` |
| Brand / program | Etsy / Etsy Creator Collective |
| Official URL | Etsy Help affiliates/creator collective article |
| Mode | saved |
| Paid search count | **0** |
| Etsy record count | **1** (canonical reuse) |
| Ambiguous entity chooser | **None** |
| business_name:Help | **None** |
| SCHEELS association | **None** |
| Active partnerships list | **Not listed** |
| Quiet metadata | `programLibraryQuiet=true`, `homeEligible=false` |

---

## Verdict

ETSY AFFILIATE ROUTING VERIFIED
