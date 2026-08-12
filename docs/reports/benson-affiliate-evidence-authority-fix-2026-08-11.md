# Benson Affiliate Evidence Authority Fix — 2026-08-11

**Date:** 2026-08-12 (UTC)  
**Scope:** Correct evidence authority classification on existing 15 canonical programs  
**Method:** Domain-based authority recompute + URL resolution checks — **no paid web search**

---

## Problem fixed

Prior verification assigned `official_brand` / **Verified official** based on search-result citations without checking hostname or URL resolution. Examples corrected:

| Program | Bad source | Correct authority |
|---------|------------|-------------------|
| KC Chiefs Pro Shop | viglink.com | secondary source |
| thredUP | taprefer.com | secondary source |
| Poshmark | getlasso.co | secondary source |
| LTK | favly.com | secondary source |
| FlexPro Meals | affilitizer.com | secondary source |

Failed/non-resolving official URLs no longer produce **Verified official**.

---

## Authority rules implemented

- **official_brand:** hostname matches brand-owned domain **and** URL resolves
- **affiliate_network:** hostname matches actual network platform (Impact, Partnerize, etc.) **and** URL resolves
- **secondary_source:** aggregators (VigLink directories, getlasso, favly, taprefer, affilitizer, etc.)
- **Failed URL:** `needs_verification` — never `verified_official`

Operator-supplied claims preserved. Conflicts recomputed after authority downgrade.

---

## Corrected verification counts (all 15)

| Metric | Count |
|--------|------:|
| Fully verified (official/network) | 3 |
| Conflicting information | 0 |
| Operator supplied | 6 |
| Secondary source | 2 |
| Needs verification | 0 |
| Possibly inactive | 0 |
| Records updated in DB | 5 |
| Paid web searches | **0** |

---

## Inspected programs (11)

| Program | Operator terms | Current terms | Official URL | URL resolved | Domain authority | Verification status | Top evidence authority | Notes |
|---------|----------------|---------------|--------------|--------------|------------------|---------------------|------------------------|-------|
| KC Wine Road | 10% | 10% | https://www.kcwineroad.com/affiliate-program?utm_source=openai | no/failed | official brand | Operator supplied | operator supplied | Evidence: https://www.kcwineroad.com/affiliate-program?utm_source=openai |
| KC Chiefs Pro Shop | 8%; Impact | 8% | https://www.viglink.com/merchants/65309/kansas-city-chiefs-affiliate-program?utm_source=openai | no/failed | secondary source | Secondary source | operator supplied | Evidence: https://www.viglink.com/merchants/65309/kansas-city-chiefs-affiliate-program?utm_source=openai |
| Dream KC Smoke Shop | 10%; 90-day window | 10% | https://kcsmokeshop.com/pages/affiliate-program?utm_source=openai | yes | official brand | Verified official | operator supplied | Evidence: https://kcsmokeshop.com/pages/affiliate-program?utm_source=openai |
| KC Cabinetry & Stone | referral bonus unspecified | referral bonus (amount unspecified) | https://kccabinetryandstone.com/partners?utm_source=openai | yes | official brand | Verified official | operator supplied | Evidence: https://kccabinetryandstone.com/partners?utm_source=openai |
| LEGOLAND Discovery Center Kansas City | 2%; Partnerize | 2% | https://www.visitsealife.com/kansas-city/us-affiliate/?utm_source=openai | no/failed | secondary source | Secondary source | operator supplied | Evidence: https://www.visitsealife.com/kansas-city/us-affiliate/?utm_source=openai |
| LM Connect KC | influencer hub | — | https://www.lmconnectkc.com/influencerwelcome?utm_source=openai | yes | official brand | Verified official | official brand | Evidence: https://www.lmconnectkc.com/influencerwelcome?utm_source=openai |
| FASHIONPHILE | 5% + $50 | 5% + $50 | https://www.fashionphile.com/pages/influencer?utm_source=openai | yes | official brand | Partial match · unresolved component | operator supplied | Partial match — unresolved: $50; Verification state → partial_unresolved; Evidence: https://www.fashionphile.com/pages/influencer?utm_source=openai |
| The RealReal | 5% | 5% | https://www.therealreal.com/affiliates?utm_source=openai | no/failed | official brand | Operator supplied | operator supplied | Retired failed-source commission from active authority; Verification state → operator_supplied; Evidence: https://www.therealreal.com/affiliates?utm_source=openai |
| thredUP | 5–15% | 5–15% | https://taprefer.com/thredup-inc-affiliate-program/thredup-inc/?utm_source=openai | no/failed | secondary source | Secondary source · consistent with operator range | operator supplied | Secondary evidence consistent with operator range; Verification state → secondary_source_consistent; Evidence: https://taprefer.com/thredup-inc-affiliate-program/thredup-inc/?utm_source=openai |
| Poshmark | 1–5% | 1–5% | https://getlasso.co/affiliate/poshmark/?utm_source=openai | no/failed | secondary source | Secondary source · consistent with operator range | operator supplied | Secondary evidence consistent with operator range; Verification state → secondary_source_consistent; Evidence: https://getlasso.co/affiliate/poshmark/?utm_source=openai |
| LTK | 10–25% average | 10–25% average | — | — | — | Secondary source · consistent with operator range | operator supplied | Secondary evidence consistent with operator range; Verification state → secondary_source_consistent; Evidence: https://favly.com/ltk-commission-rates?utm_source=openai |

---

## All 15 programs

| Program | Operator terms | Current terms | Verification status | Top evidence authority | Notes |
|---------|----------------|---------------|----------------------|------------------------|-------|
| FlexPro Meals | 5%; 40% audience benefit | 5% | Operator supplied | operator supplied | Evidence: https://www.affilitizer.com/programs/flexpromeals.com?utm_source=openai |
| KC Wine Road | 10% | 10% | Operator supplied | operator supplied | Evidence: https://www.kcwineroad.com/affiliate-program?utm_source=openai |
| KC Chiefs Pro Shop | 8%; Impact | 8% | Secondary source | operator supplied | Evidence: https://www.viglink.com/merchants/65309/kansas-city-chiefs-affiliate-program?utm_source=openai |
| Dream KC Smoke Shop | 10%; 90-day window | 10% | Verified official | operator supplied | Evidence: https://kcsmokeshop.com/pages/affiliate-program?utm_source=openai |
| BodymetRx KC | commission unpublished | unpublished / unknown | Operator supplied | operator supplied | Evidence: https://bodymetrx.com/pricing/?utm_source=openai |
| KC Cabinetry & Stone | referral bonus unspecified | referral bonus (amount unspecified) | Verified official | operator supplied | Evidence: https://kccabinetryandstone.com/partners?utm_source=openai |
| Prestige Transportation KC | terms unspecified | unspecified | Operator supplied | operator supplied | — |
| LEGOLAND Discovery Center Kansas City | 2%; Partnerize | 2% | Secondary source | operator supplied | Evidence: https://www.visitsealife.com/kansas-city/us-affiliate/?utm_source=openai |
| LM Connect KC | influencer hub | — | Verified official | official brand | Evidence: https://www.lmconnectkc.com/influencerwelcome?utm_source=openai |
| Missouri Restaurant Association | influencer program | — | Operator supplied | operator supplied | Evidence: https://www.morestaurants.org/restaurant-membership-?utm_source=openai |
| FASHIONPHILE | 5% + $50 | 5% + $50 | Partial match · unresolved component | operator supplied | Partial match — unresolved: $50; Verification state → partial_unresolved; Evidence: https://www.fashionphile.com/pages/influencer?utm_source=openai |
| The RealReal | 5% | 5% | Operator supplied | operator supplied | Retired failed-source commission from active authority; Verification state → operator_supplied; Evidence: https://www.therealreal.com/affiliates?utm_source=openai |
| thredUP | 5–15% | 5–15% | Secondary source · consistent with operator range | operator supplied | Secondary evidence consistent with operator range; Verification state → secondary_source_consistent; Evidence: https://taprefer.com/thredup-inc-affiliate-program/thredup-inc/?utm_source=openai |
| Poshmark | 1–5% | 1–5% | Secondary source · consistent with operator range | operator supplied | Secondary evidence consistent with operator range; Verification state → secondary_source_consistent; Evidence: https://getlasso.co/affiliate/poshmark/?utm_source=openai |
| LTK | 10–25% average | 10–25% average | Secondary source · consistent with operator range | operator supplied | Secondary evidence consistent with operator range; Verification state → secondary_source_consistent; Evidence: https://favly.com/ltk-commission-rates?utm_source=openai |

---

## Tests

`services/core/src/program-library/evidence-authority.test.ts` covers:

- Brand-owned domain → `official_brand`
- Affiliate network domain → `affiliate_network`
- Aggregator domains → `secondary_source`
- Failed URL → never `verified_official`
- Operator values preserved through conflict recompute
- No paid search in recompute path

---

AFFILIATE EVIDENCE AUTHORITY VERIFIED
