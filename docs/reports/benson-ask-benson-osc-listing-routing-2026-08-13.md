# Ask Benson multi-event listing routing (2026-08-13)

## Problem

`https://www.theosc.co/events` fetched successfully (~19.5k chars) and correctly skipped a page-level entity, then stopped at `NO_SUPPORTED_ENTITY`.

## Cause

1. Listing pages set `skipEntityLayer`, so `entityAccepted=false`.
2. `resolveIntakeOutcome` treated that as `NO_SUPPORTED_ENTITY` even when individual events qualified.
3. Per-event `missing_entity_match` compared event titles (Fusion Fest) to the host token (`Theosc`) and quarantined the whole listing.
4. Dated rows without a per-event venue failed `weak_location`.

## Fix (scoped)

- Listing pages → `LISTING_EVENTS_ACCEPTED` when any individual events persist.
- Skip host-token entity match for listing rows; fill venue/location from listing provenance.
- Stable title+date(+event URL) ids so repeat paste reuses instead of duplicating.
- Quarantine unsupported rows without failing the listing.
- Operator copy: found/saved/quarantined + New/Reused/Quarantined; actions View discoveries, Add to Things To Do, Keep as source.
- No page-named “The OSC Events” opportunity. Integrity gate and no auto web-search unchanged.
