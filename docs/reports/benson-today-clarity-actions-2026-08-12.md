# Benson Today Clarity + Actions — 2026-08-12

**Scope:** Today (`/editor`) workbench only. No Home redesign, Discover redesign, Telegram, research budgets, workers, or scrape behavior changes. No migration.

**Fingerprint:** `ebba70f48791cb59` (MATCH)

---

## Root causes

1. **Today reused Discover-ish ranking** — `isHomeEligible` + weak section filters let SEO listings, ordinary concerts, and generic shopping hypotheses into “Weekend Content.”
2. **No source/entity consistency gate** — title, businessName, sourceName, and why-copy could describe different entities (Legends Live SEO + Nordstrom Rack + gift-card angle).
3. **Lane authority existed but was unused on Today** — Home showroom lanes (`things_to_do_weekly` / `film_this` / `source_intelligence_only`) were not applied to command-center sections.
4. **Operator UI exposed internals** — five score bars, Coverage format “Unassigned”, and a full planner toolbar (save / plan today / plan this week / mark covered / skip / add note) forced Elliott to operate Benson’s workflow manually.
5. **Framing-template why-copy** leaked as operator explanation (“deal haul, store opening, or gift-card sponsorship angle”).

---

## Today eligibility contract

An item may enter Today only if:

- Home-eligible + executable CTA target
- Audience-fresh + current lifecycle
- Concrete entity (business / venue / durable title)
- Source/entity consistency passes
- Not generic sponsor placeholder
- Not source-intelligence-only / local news without creator fit
- Has a resolvable Today lane with a concrete next step

Discover can stay “interesting.” Today must be “worth doing + here is what to do.” Empty lanes are preferred over filler.

---

## Lane separation (reused)

Reuses `home-showroom-lanes.ts`:

| Lane | Today behavior |
|------|----------------|
| Things To Do Weekly | Ordinary concerts/events with dates may qualify here (Week / things-to-do intent) |
| Film This / Weekend Content | Requires filmable + Kellie fit; **ordinary concerts never auto-qualify** |
| Sponsor / Partnership | Named business + sponsor signal |
| Source Intelligence Only | **Not a Today task** |

Weekend Content additionally requires Fri–Sun relevance (or filmable opening/shopping with weekend window) and rejects SEO/generic shopping leads.

---

## Source / entity consistency

`evaluateSourceEntityConsistency` + `canonicalTodayTitle` in `today-clarity.ts`:

- Rejects SEO titles mismatched to retail business/source (Legends Live ↔ Nordstrom Rack)
- Rejects generic shopping/gift-card why on concert/SEO titles
- Prefers business/venue over SEO “tickets, info, reviews…” titles
- `viewSourceUrl` only when `http(s)` valid

---

## Weekend Content rules

- Current + filmable/postable + weekend-relevant
- Concrete subject/entity
- Source supports recommendation
- Ordinary concert → **not** Weekend Content
- Generic shopping without entity/angle → excluded

Card shape: Title · Why · When · Where · Source · one primary action (`Plan for weekend`)

---

## Primary-action contract

| Lane | Primary CTA |
|------|-------------|
| Weekend Content | Plan for weekend |
| Film This | Add to filming |
| Things To Do Weekly | Add to Things To Do |
| Sponsor | Review pitch |
| Follow-up | Follow up |

Secondary: View source · Details · Later · Dismiss (creator-skip + snooze).  
**No Save** on durable inventory. **Mark covered** only for film/weekend coverage workflow. Notes under More overflow.

---

## Dismiss / Later

Reuses existing `DiscoverySkipButton` / creator-skip authority (`sourceScreen: 'today'`). Later = snooze presets. No parallel state system.

---

## Score / UI simplification

- Score dashboard hidden on Today (`hideScoreDashboard`)
- Coverage format panel removed from Today cards; optional “Suggested format” label only when known (never “Unassigned”)
- Human “Why Benson picked this” synthesizes templates away from framing leftovers
- `highestConfidence` metadata section emptied / removed from Today order

---

## Legends / Nordstrom regression

**Input:** SEO title “legends live… tickets, info, reviews…” + business “Nordstrom Rack Legends” + generic shopping why.

**Result:** consistency fails → excluded from all Today sections (unit + live smoke). Expected outcome **B**.

---

## Tests / counts

`today-clarity.test.ts` + updated `command-center` / `home-eligibility` checks:

- **37 pass / 0 fail** (today-clarity + command-center + home-eligibility suites)

Covers: mismatch gate, SEO title, ordinary concert lanes, news exclusion, generic shopping exclusion, weekend rules, one primary action, no Save, Mark covered gating, no Unassigned, View source, stale exclude, dedupe, highestConfidence empty.

---

## Mobile smoke (390×844)

`/editor` loaded after deploy: compact cards with lane label, why, primary CTA, View source / Details / Later / Dismiss — no five-score bars, no Unassigned coverage control, no full planner toolbar.

---

## Files changed

- `services/core/src/inventory/today-clarity.ts` (new)
- `services/core/src/inventory/today-clarity.test.ts` (new)
- `services/core/src/inventory/command-center.ts`
- `services/core/src/inventory/home-eligibility.test.ts`
- `dashboard/lib/command-center-types.ts`
- `dashboard/app/editor/command-center-panel.tsx`
- `dashboard/components/opportunity-action-bar.tsx`
- `dashboard/components/planner-quick-actions.tsx`
- `dashboard/components/discovery-skip-button.tsx` (optional `dismissLabel`)

**Migration:** no

---

## Health

- API `/health` 200
- Dashboard 200
- Workers running
- Fingerprints MATCH (`ebba70f48791cb59`)
- Lightweight `GET /api/editor?limit=6` 200
- No discovery refresh / paid research triggered

---

TODAY CLARITY + ACTIONS VERIFIED  
BENSON LEFT HEALTHY FOR OPERATOR USE
