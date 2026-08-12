# Ask Benson URL ingestion integrity — OSC regression (2026-08-12)

## Problem

Pasting `https://www.theosc.co/events?...` into Ask Benson created a durable entity titled like “Los Angeles Welcomes Workers… — Kansas City” while diagnostics showed `theosc.co: HTTP 200, 0 chars`. Quarantined extractions still yielded `ENTITY_ACCEPTED_CLAIMS_QUARANTINED` and positive CTAs (Open opportunity / Interested).

Root cause: empty fetch triggered automatic web-search fallback; unrelated citation titles were treated as page title/text; `inferBusinessName` + `qualifyEntityFromUrl` accepted an entity from host alone without usable on-page evidence.

## Fix (scoped)

1. **Zero-content gate** — HTTP 200 / 0 usable chars does not authorize entity/opportunity mutation; no auto web-search invent unless operator explicitly asks to research/verify.
2. **Host/title/content consistency** — `entityConsistentWithUrlEvidence` + tightened `inferBusinessName` reject news-headline entities unrelated to the registrable domain (OSC vs LA workers).
3. **Outcome** — unsupported entity → `NO_SUPPORTED_ENTITY` (not `ENTITY_ACCEPTED_CLAIMS_QUARANTINED`).
4. **CTA authority** — Open opportunity / Interested / Plan visit only when a supported durable entity/opportunity exists; otherwise Retry / Keep as source / Dismiss.
5. **Operator copy** — “I could open the page, but I couldn’t extract enough usable information…”

## Tests

Focused OSC regressions in `url-entity-opportunity.test.ts` (+ failure-answer coverage).

## Non-goals

No Ask Benson redesign, affiliate routing, Home/Today/Discover, or paid research by default.
