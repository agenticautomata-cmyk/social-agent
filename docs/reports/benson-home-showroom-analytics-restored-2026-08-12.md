# Benson Home — Analytics + Business Summary Restored

**Date:** 2026-08-12  
**Scope:** Home UI/data-shaping only — restore creator analytics + business summary on top of the intact showroom redesign.  
**Not changed:** Best Move / Money on the Table / What Benson Handled / Needs You rules; Telegram; Discover; Today; Pitches; research; workers; memory architecture.

## What was restored

### Business summary (upper Home)
Outcome bullets answering “what changed since I last looked?” (max 5):
- Strongest path advanced
- Sponsor paths moved forward
- Filtered stale/weak opportunities
- Follower progress toward 10K
- Active deals / research advanced when present

Not Needs You. Not unread inbox. Not a task list.

### Creator analytics
Structured `creatorAnalytics` from durable studio pulse + pipeline + metrics:
- Followers `6,229 / 10,000` with `% there · remaining`
- Progress bar when pct known
- Active deals
- Sponsor pipeline active paths
- Real revenue only when `wonThisMonth.value > 0` (none invented; trend omitted unless trustworthy delta exists)

`creatorMomentum` tiles remain as a compatibility projection of the same analytics tiles.

## Information architecture (preserved showroom)

1. Hero / Benson worked for you  
2. Business summary  
3. Best Move (max 1)  
4. Money on the Table  
5. Creator analytics  
6. What Benson Handled  
7. Needs You (max 3)  
8. Workbench links  

## Regression confirmation

| Check | Result |
|-------|--------|
| Top/Second/Third Move | Absent |
| 62-pitch bulk card | Absent |
| Unread-email clutter | Absent from summary/analytics |
| Ordinary concerts/news as Best Move | Unchanged showroom gates |
| Best Move max 1 | Intact |
| Needs You max 3 | Intact |
| Analytics real data | Followers 6,229 / 62% / 3,771 to go; 4 deals; 8 pipeline paths |
| Home singleflight | `inventoryLoadCount=1`, `sponsorIntelComputeCount=1` |
| Mobile 390×844 | Hero + Business summary + Best Move visible; polished |

## Tests

- `home-showroom.test.ts`: **16/16 pass** (includes analytics/revenue non-invention asserts)

## Files

- `services/core/src/pre-alpha/home-showroom.ts` — `businessSummary` + `creatorAnalytics`
- `services/core/src/pre-alpha/home.ts` — pass known `revenueUsd` from won-this-month only
- `services/core/src/pre-alpha/home-showroom.test.ts`
- `services/core/src/pre-alpha/home-memory-stabilization.test.ts`
- `dashboard/lib/pre-alpha-types.ts`
- `dashboard/components/home-morning-briefing.tsx`

## Migration

**No**

## Deploy

- Fingerprint: `02b3220dab8d5176` — **MATCH**
- API `/health` 200 · Dashboard 200 · Workers running
- Home ~8.3s; RSS before/after ~129→206 MB on compute; host healthy
- Dashboard briefly needed a restart after rebuild (left up and healthy)

## Confirmation

Showroom redesign remains intact. Analytics + business summary restored. Benson left usable.

HOME ANALYTICS RESTORED  
BENSON LEFT HEALTHY FOR OPERATOR USE
