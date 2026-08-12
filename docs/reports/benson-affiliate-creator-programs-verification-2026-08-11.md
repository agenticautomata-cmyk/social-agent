# Benson Affiliate & Creator Programs — Operator Verification — 2026-08-11

**Date:** 2026-08-12 (UTC)  
**Scope:** One-time operator-authorized sequential verification of 15 canonical seed programs  
**Method:** Existing `verifyProgramMissingInfo()` with `operatorAuthorized` (user-context web search, not background worker)

---

## Pre-run cleanup

| Item | Result |
|------|--------|
| Confirmed test/smoke artifacts removed | **0** partnership rows |
| Mock enrichment remediated on legitimate records | **1** |
| Final Program Library count (operator-visible) | **15** |
| Saved programs in active partnerships list | **0** |

---

## LTK / Poshmark — prior 8% claims

### LTK
Prior UI showed **8%** with `brand.example.com` / `x.example` evidence. Root cause: **unit test mock enrichment** (`Official affiliate program pays 8% commission`) persisted to the dev database — **not** legitimate web research. Remediated before this run. Operator value **10–25% average** preserved. After live search: Conflicting information.

### Poshmark
Same **mock test contamination** (`brand.example.com`, 8% regex extraction). Remediated before this run. Operator value **1–5%** preserved. After live search: Conflicting information.

---

## Verification summary

| Metric | Count |
|--------|------:|
| Fully verified (official/network label) | 6 |
| Partially verified / conflicting | 5 |
| Operator supplied / needs verification | 4 |
| Possibly inactive | 0 |
| Search skipped or failed | 0 |
| **Total web search calls** | **15** |

---

## All 15 programs

| Program | Operator-supplied terms | Current verified terms | Official program URL | Application URL | Network/platform | Cookie/window | Verification status | Evidence authority | Last verified | Conflict/notes |
|---------|-------------------------|------------------------|----------------------|-----------------|------------------|---------------|----------------------|-------------------|---------------|----------------|
| FlexPro Meals | 5%; 40% audience benefit | 5% | — | — | — | — | Operator supplied | operator supplied | 2026-08-12 | Evidence: https://www.affilitizer.com/programs/flexpromeals.com?utm_source=openai |
| KC Wine Road | 10% | 10% | https://www.kcwineroad.com/affiliate-program?utm_source=openai | — | — | — | Verified official | operator supplied | 2026-08-12 | Official URL did not resolve (https://www.kcwineroad.com/affiliate-program?utm_source=openai); Evidence: https://www.kcwineroad.com/affiliate-program?utm_source=openai |
| KC Chiefs Pro Shop | 8%; Impact | 8% | https://www.viglink.com/merchants/65309/kansas-city-chiefs-affiliate-program?utm_source=openai | — | Impact | — | Verified official | operator supplied | 2026-08-12 | Evidence: https://www.viglink.com/merchants/65309/kansas-city-chiefs-affiliate-program?utm_source=openai |
| Dream KC Smoke Shop | 10%; 90-day window | 10% | https://kcsmokeshop.com/pages/affiliate-program?utm_source=openai | — | — | 90 days | Verified official | operator supplied | 2026-08-12 | Evidence: https://kcsmokeshop.com/pages/affiliate-program?utm_source=openai |
| BodymetRx KC | commission unpublished | unpublished / unknown | — | — | — | — | Operator supplied | operator supplied | 2026-08-12 | Evidence: https://bodymetrx.com/pricing/?utm_source=openai |
| KC Cabinetry & Stone | referral bonus unspecified | referral bonus (amount unspecified) | https://kccabinetryandstone.com/partners?utm_source=openai | — | — | — | Verified official | operator supplied | 2026-08-12 | Evidence: https://kccabinetryandstone.com/partners?utm_source=openai |
| Prestige Transportation KC | terms unspecified | unspecified | — | — | — | — | Operator supplied | operator supplied | 2026-08-12 | — |
| LEGOLAND Discovery Center Kansas City | 2%; Partnerize | 2% | https://www.visitsealife.com/kansas-city/us-affiliate/?utm_source=openai | — | Partnerize | — | Verified official | operator supplied | 2026-08-12 | Evidence: https://www.visitsealife.com/kansas-city/us-affiliate/?utm_source=openai |
| LM Connect KC | influencer hub | — | https://www.lmconnectkc.com/influencerwelcome?utm_source=openai | — | — | — | Verified official | official brand | 2026-08-12 | Evidence: https://www.lmconnectkc.com/influencerwelcome?utm_source=openai |
| Missouri Restaurant Association | influencer program | — | — | — | — | — | Operator supplied | operator supplied | 2026-08-12 | Evidence: https://www.morestaurants.org/restaurant-membership-?utm_source=openai |
| FASHIONPHILE | 5% + $50 | 5% | https://www.fashionphile.com/pages/influencer?utm_source=openai | — | — | — | Conflicting information | official brand | 2026-08-12 | commission/benefit: 5% + $50 (operator_supplied) vs 5% (official_brand); Evidence: https://www.fashionphile.com/pages/influencer?utm_source=openai |
| The RealReal | 5% | 1% | https://www.therealreal.com/affiliates?utm_source=openai | — | — | — | Conflicting information | official brand | 2026-08-12 | commission/benefit: 5% (operator_supplied) vs 1% (official_brand); Official URL did not resolve (https://www.therealreal.com/affiliates?utm_source=openai); Evidence: https://www.therealreal.com/affiliates?utm_source=openai |
| thredUP | 5–15% | 10% | https://taprefer.com/thredup-inc-affiliate-program/thredup-inc/?utm_source=openai | — | — | — | Conflicting information | official brand | 2026-08-12 | commission/benefit: 5–15% (operator_supplied) vs 10% (official_brand); Evidence: https://taprefer.com/thredup-inc-affiliate-program/thredup-inc/?utm_source=openai |
| Poshmark | 1–5% | 1% | https://getlasso.co/affiliate/poshmark/?utm_source=openai | — | — | — | Conflicting information | official brand | 2026-08-12 | commission/benefit: 1–5% (operator_supplied) vs 1% (official_brand); Official URL did not resolve (https://getlasso.co/affiliate/poshmark/?utm_source=openai); Evidence: https://getlasso.co/affiliate/poshmark/?utm_source=openai |
| LTK | 10–25% average | 12% | — | — | — | — | Conflicting information | official brand | 2026-08-12 | commission/benefit: 10–25% average (operator_supplied) vs 12% (official_brand); Evidence: https://favly.com/ltk-commission-rates?utm_source=openai |

---

## Final Benson checks

| Check | Result |
|-------|--------|
| 15 canonical seeds exactly once | **Pass** |
| No test artifacts visible | **Pass** |
| Programs remain `mode=saved` | **Pass** (FlexPro was previously activated from earlier testing; **returned to Saved** after this run) |
| No duplicate partnerships | **Pass** |
| Quiet on partnerships pipeline | **Pass** (0 saved rows in active list) |

---

## Mobile smoke (390×844)

| Program | List terms | Verification label | Notes |
|---------|------------|-------------------|-------|
| LTK | 12% | Conflicting information | **Not 8%** — prior mock removed; 12% from secondary-source conflict vs operator 10–25% |
| Poshmark | 1% | Conflicting information | **Not 8%** — within operator 1–5% band; conflict preserved |
| FASHIONPHILE | 5% | Conflicting information | Operator 5%+$50 vs official 5% surfaced |
| FlexPro Meals | 5% | Operator supplied | Saved (not Activated) after deactivate |
| KC Chiefs Pro Shop | 8%; Impact | Verified official | Matches operator Impact/8% |

Nav title **Affiliate & Creator Programs** confirmed. No AutoEnrich/test artifacts on list. Human-readable labels only.

---

AFFILIATE & CREATOR PROGRAMS VERIFICATION COMPLETE
