# Benson Home Creator Showroom — 2026-08-11

**Scope:** Home only (showroom IA + gating). No Telegram feature work, no Affiliate Programs work, no research-budget/worker changes, no memory-fix changes beyond preserving existing singleflight metrics, no Today/Discover/Pitches redesign.

## Old Home problems

- Home read like Benson’s chore list (Top/Second/Third move, filming/freebie/verify-date slots, Do Now, bulk pitch counts).
- Ordinary KC events / concerts / Pitch news could dominate “moves.”
- Unread and informational emails (e.g. ShopMy “You’re in!”) could look like Reply work.
- Bulk housekeeping (“62 pitches need approval”) competed with real decisions.
- Internal statuses (`ready_to_contact`) leaked into operator copy.
- Confidence / “interesting in KC” was treated as Home-worthy content opportunity.

## New Home information architecture

Ordered sections:

1. **Hero / Benson worked for you** — durable screened / advanced / filtered stats  
2. **Best Move** — exactly one strongest action, or “nothing urgent”  
3. **Money on the Table** — real monetization paths with operational states (Pitch ready, In pipeline, etc.)  
4. **What Benson Handled** — automatic work completed or prevented  
5. **Creator Momentum** — compact growth / deal signals  
6. **Needs You** — max 3 true operator decisions  

Workbench links (Today / Discover / Pitches / Shoot) sit below the showroom.

## Best Move authority

- Prefer promoted sponsor candidates with live inventory + showroom gate.
- Else highest-priority showroom-eligible cards with creator/business value.
- Excludes verify-date, ordinary concerts/author events, Fire-Rescue-style expos, weak/unverified signals, generic placeholders, invalid CTAs.
- Max **1**. If none: “Benson has nothing urgent.”

## Money on the Table logic

- Showroom-gated sponsor paths with valid durable targets.
- Pitch-ready studio pulse path when present.
- Open pipeline summary when deals exist.
- No invented dollar revenue; uses truthful states (Pitch ready / In pipeline).

## What Benson Handled logic

- Screened opportunities from refresh metrics.
- Expired / filtered low-value inventory counts.
- Sponsor-candidate tracking / research advanced.
- Operator-facing prose only (no job names / telemetry).

## Needs You rules

- Max **3**.
- Excludes bulk pitch-approval housekeeping, unread-only inbox counts, informational / ShopMy non-reply mail.
- Email-shaped items require `reply_required` actionability.
- Genuine follow-ups (e.g. 21c Museum Hotels) may qualify with human copy.

## Content-lane separation

Implemented in `home-showroom-lanes.ts`:

| Lane | Rule |
|------|------|
| Things To Do Weekly | Ordinary public events / free / date-night with current dates |
| Film This | Independent: current, filmable, Kellie-fit, not ordinary-event-only |
| Home Best Move / Money | Stricter showroom gate (eligibility + lane + CTA + value) |
| Source intelligence only | Local news/Pitch without creator fit |

Ordinary concert ≠ Film This ≠ Home Best Move.

## Concert regression

Owen Pirch / ordinary music events: may qualify Things To Do Weekly; **not** Film This / Home.

## Pitch/news regression

Politics / civic / surveillance / general Pitch Weekly without Kellie fit: **not** Home.

## ShopMy regression

“You’re in!” / acceptance classified as `platform_creator` → `waiting_followup` (not `reply_required`). Excluded from Needs You; may contribute to handled/progress narrative.

## Dismiss / Later behavior

- UI uses existing `DiscoverySkipButton` / `skipDiscoveryItem` creator-skip authority (`sourceScreen=home_showroom`).
- Skipped inventory is filtered at load; showroom requires live inventory ids so dismissed items do not reappear under another Home section.
- No parallel skip system.

## Excluded clutter

- Bulk “62 pitches need approval”
- Generic unread-email counts / informational mail
- Verify-date / weak discoveries / ordinary concerts
- Generic shopping/retail sponsor placeholders
- Malformed / invalid CTA targets
- Raw enums (`ready_to_contact`) and API error payloads
- Stale/expired opportunities

## Tests / counts

- `src/pre-alpha/home-showroom.test.ts`: **15/15 pass**
- `src/gmail-inbox/inbound-actionability.test.ts`: ShopMy You’re in! case added; suite green
- `src/pre-alpha/home-memory-stabilization.test.ts`: green; asserts `showroom` present, Needs You ≤ 3, Best Move 0|1
- No paid web research in tests

## Mobile smoke result (390×844)

- Hero immediately communicates Benson-created value (screened / sponsor paths advanced)
- Exactly one Best Move (Raphael Hotel — Pitch ready)
- Money on the Table, What Benson Handled, Creator Momentum, Needs You (2 ≤ 3) present
- Skip / Later / Details on actionable cards
- No giant chore list; no Top/Second/Third; no bulk-62 clutter; no Fire-Rescue / Owen Pirch / verify-date domination
- First viewport answers: Benson saves time / surfaces money

## Production files changed

- `services/core/src/pre-alpha/home-showroom-lanes.ts` (new)
- `services/core/src/pre-alpha/home-showroom.ts` (new)
- `services/core/src/pre-alpha/home-showroom.test.ts` (new)
- `services/core/src/pre-alpha/home.ts` (wire `showroom`)
- `services/core/src/pre-alpha/home-memory-stabilization.test.ts` (contract assert)
- `services/core/src/creator-partnership/email-intent.ts` (ShopMy acceptance patterns)
- `services/core/src/gmail-inbox/inbound-actionability.test.ts`
- `dashboard/lib/pre-alpha-types.ts`
- `dashboard/components/home-morning-briefing.tsx` (showroom UI)
- `dashboard/app/home-dashboard-panel.tsx` (declutter Home shell)

## Migration

**No**

## Deployment fingerprint

`cf845654e105757d` — MATCH across source / api / dashboard / workers

## Post-deploy Home latency / RSS

- Home API: ~4.9–9.3s cold/warm on this host; latest finished `elapsedMs=4359`
- `inventoryLoadCount=1`, `sponsorIntelComputeCount=1` (no duplicate Home computation)
- API RSS ~285–357 MB around Home compute (no thrashing; usable)
- Worker RSS ~248 MB; host available ~1.5 GiB; swap present but system responsive

## API / dashboard / workers health

- API `/health` = **200**
- Dashboard `/` = **200**
- Workers = running
- Fingerprints = **MATCH**
- Database healthy (Home `systemOk=true`)

## Confirmation Benson was left usable

Home showroom loads on mobile and desktop; Best Move + Money + Handled + Momentum + Needs You render with durable CTAs; Today/Discover/Pitches remain available as workbenches. Voicebox/n8n left as previously configured (not started).

HOME SHOWROOM VERIFIED
BENSON LEFT HEALTHY FOR OPERATOR USE
