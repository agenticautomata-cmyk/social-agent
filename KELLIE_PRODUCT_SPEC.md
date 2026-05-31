# Kellie Assistant — Product Specification

**Version:** 1.0 (MVP)  
**Audience:** Product, design, engineering  
**Primary user:** Kellie — a Kansas City content strategist  
**Assistant (user-facing):** **Benson**  
**Status:** Finished-product specification (target state)  
**Vision:** [BENSON_VISION.md](./BENSON_VISION.md)

---

## Naming: Benson vs Kellie Assistant

| Context | Name | Example |
|---|---|---|
| **User-facing UI, notifications, assistant voice** | **Benson** | "Good morning, Kellie. Benson found 12 new opportunities." |
| **Human operator** | **Kellie** | Settings, sign-in, account menu |
| **App shell, internal docs, engineering** | Kellie Assistant | Repo name, package names, API routes during development |

Benson is the **assistant persona** Kellie interacts with. Kellie Assistant is the **product name** for the dashboard and backend during development.

---

## Product Summary

Kellie Assistant is a web dashboard powered by **Benson**, an AI assistant that watches Kansas City — Reddit, event feeds, venue openings, and local news — and surfaces **content opportunities** worth covering. Kellie logs in each morning, reads what Benson found overnight, reviews scored opportunities in an inbox, and approves the ones worth pursuing.

The product does **not** write full posts or publish to social media in v1. Benson answers one question for Kellie: *"What should we pay attention to in KC right now?"*

---

## Primary User

**Kellie** runs content for one or more local brands (restaurants, venues, neighborhood associations, or her own media property). She is not a developer. She wants:

- A single place to see what's happening in KC
- Enough context to decide in under 30 seconds per item
- Confidence that she isn't approving duplicates or irrelevant noise
- A clear record of what she already said yes or no to

---

## First Login

### Sign-in screen

Kellie opens `app.kellie.local` (or the deployed URL) and sees a minimal sign-in page:

- **Logo and title:** "Kellie Assistant"
- **Subtitle:** "Kansas City content opportunities · powered by Benson"
- **Email** field
- **Password** field
- **[ Sign in ]** button
- Link: "Forgot password?"

On first login, Kellie is the sole admin for her workspace. No client configuration is required before she can use the product — a default client **"Kellie KC"** is already seeded with Kansas City categories and two active sources.

After successful sign-in, Kellie lands on the **Overview** page.

### First-run banner (one time only)

At the top of Overview, a dismissible banner appears:

> **Welcome, Kellie.** Benson is set up with two sources: r/kansascity (Reddit) and Visit KC Events (RSS). Click **Scan now** to pull your first opportunities, or wait for Benson's daily scan at 6:00 AM CST.

**[ Got it ]** dismisses the banner permanently for that user.

---

## Benson in the UI

Benson appears throughout the product as **assistant-attributed copy**, not a separate chat window (MVP). Kellie always knows when Benson did the work.

### Where Benson appears (MVP)

| Location | Benson copy example |
|---|---|
| **Overview — greeting card** | "Good morning, Kellie. Benson found 12 new opportunities." |
| **Overview — Benson's pick** | "Benson's top pick today: First Fridays (87%)" |
| **Scan completion toast** | "Benson found 6 new opportunities." |
| **Approvals — empty state** | "Benson has nothing pending — last scan at 6:02 AM." |
| **Approval card — summary** | Labeled **Benson's summary** (not generic "Summary") |
| **Approval card — angle** | **Benson suggests:** "Your guide to First Fridays…" |
| **Approval card — scores** | **Why Benson scored it this way** (bullet list) |
| **Approval card — action** | **[ Ask Benson why ]** — expands plain-language explanation |
| **Footer** | `Benson · last scan 2h ago` |
| **Slack digest** | "**Benson** · 3 opportunities pending review" |

### Benson visual treatment (MVP)

- Small **Benson** label or monogram on greeting cards and approval card headers
- Score explanation blocks use assistant attribution ("Benson found…", "Benson archived…")
- No avatar required in MVP; optional subtle icon beside Benson-attributed text
- Full chat UI deferred to Phase 2 — see [BENSON_VISION.md](./BENSON_VISION.md)

### Example UI strings

```
Good morning, Kellie. Benson found 12 new opportunities.

Ask Benson why this event scored highly.

Benson recommends covering this before Saturday — the event is Friday evening.

Benson archived 6 items below your relevance threshold.
```

---

## Global Chrome (Every Page)

Once logged in, every page shares the same shell.

### Header

| Element | Behavior |
|---|---|
| **Kellie Assistant** (wordmark, left) | Click → Overview (`/`) |
| **Version badge** | e.g. `v1.0` — informational |
| **Navigation links** | `[overview]` `[clients]` `[opportunities]` `[approvals]` `[runs]` |
| **Approvals badge** | Red count on `[approvals]` when Benson has items pending review (e.g. `[approvals · 3]`) |
| **User menu** (right) | Shows Kellie's email; dropdown: Settings, Sign out |

### Footer

- Left: `Benson · last scan 2h ago · connected`
- Right: link to documentation

### Autonomy mode indicator

When viewing a client in **auto** mode, a small amber pill appears in the header: `auto-approve on`. This reminds Kellie that new high-scoring items will skip her inbox.

---

## Pages

### 1. Overview — `/`

**Purpose:** Morning dashboard. Kellie opens this first to see pipeline health and Benson's overnight findings.

#### What Kellie sees

**Section: Benson greeting** — top of page, dismissible after first read each day:

```
┌─────────────────────────────────────────────────────────────────┐
│  Benson                                                           │
│  Good morning, Kellie. Benson found 12 new opportunities         │
│  overnight — 4 are pending your review.                          │
│                                                                   │
│  Benson's pick today: First Fridays · Crossroads (87%)           │
│                                          [ Review now → ]        │
└─────────────────────────────────────────────────────────────────┘
```

**Section: Today's snapshot** — five stat tiles in a row:

| Tile | Example | Subtext |
|---|---|---|
| **discovered** | `04` | awaiting scoring |
| **pending review** | `07` | in your inbox |
| **approved today** | `03` | ready to use |
| **rejected today** | `01` | passed |
| **failed** | `00` | needs attention |

**Section: Clients** — table of all clients:

| Column | Example |
|---|---|
| Name (link) | Kellie KC |
| Mode | `hitl` / `auto` / `manual` |
| Sources | `2 active` |
| Last scan | `Today, 6:02 AM` |
| Pending | `7` |
| Approved (7d) | `12` |

Link at bottom: **manage clients →** goes to `/clients`.

**Section: Pipeline by state** — horizontal bar chart showing count per state (`discovered`, `scored`, `pending_review`, `approved`, `rejected`, `archived`, `failed`).

**Section: Top categories this week** — ranked list:

```
Events          ████████████  8 approved
Food & Drink    ████████      5 approved
Neighborhoods   ████          2 approved
```

**Section: Recent activity** — last 5 audit entries (worker name, transition, timestamp). Link: **view all runs →** goes to `/runs`.

#### Buttons on Overview

| Button | Location | Action |
|---|---|---|
| **manage clients →** | Clients section | Navigate to `/clients` |
| **view all runs →** | Recent activity | Navigate to `/runs` |
| Client name link | Clients table | Navigate to `/clients/[id]` |

Overview is read-only except navigation. Kellie does not approve from here.

---

### 2. Clients — `/clients`

**Purpose:** List every brand or property Kellie monitors.

#### What Kellie sees

Page title: **clients**  
Subtitle: *Kansas City brands and properties you monitor for content opportunities*

Table:

| Name | Mode | Sources | Categories | Pending | Status |
|---|---|---|---|---|---|
| Kellie KC | hitl | 2 | 7 | 7 | active |
| Crossroads BID | hitl | 3 | 4 | 2 | active |

Empty state (no clients):  
`[empty] No clients yet.` with **[ + New client ]** button.

#### Buttons

| Button | Action |
|---|---|
| **Client name link** | Open client detail |
| **[ + New client ]** | Opens modal: name, description, brand voice, category checkboxes → creates client |

---

### 3. Client Detail — `/clients/[id]`

**Purpose:** Configure one client, trigger scans, inspect source health.

Example: `/clients/kellie-kc`

#### What Kellie sees

**Header block:**

- Back link: `← back to clients`
- Client name: **Kellie KC**
- Description: *Internal workspace for monitoring Kansas City content signals.*
- Status pill: `active`

**Control row (right-aligned):**

| Control | Description |
|---|---|
| **Autonomy toggle** | Three-segment button: `[manual]` `[hitl]` `[auto]` — one active |
| **[ Scan now ]** | Triggers immediate source scan for this client |

After clicking **Scan now**, the button shows `[ scanning… ]` for 5–30 seconds, then `[ ok · +6 ]` indicating 6 new opportunities were discovered. The page refreshes automatically.

**Section: Sources**

| Source | Type | Last scan | Found | Status |
|---|---|---|---|---|
| r/kansascity hot | Reddit | Today 6:02 AM | 4 new | ✓ |
| Visit KC Events | RSS | Today 6:02 AM | 2 new | ✓ |

Each source row links to the source URL config (read-only in MVP). Error state shows red `⚠ last scan failed` with error tooltip.

**Section: Categories**

Tags with weights: `Food & Drink · Events · Neighborhoods · Sports · Arts & Culture · Business · Community`

**Section: Pipeline breakdown**

State counts for this client only — same visual as Overview bars.

**Section: Brand voice**

Read-only text block showing the voice prompt used by the scorer:

> *Friendly, locally rooted, never condescending. We celebrate KC without being touristy.*

(MVP: edited via API/admin only; UI editor post-MVP.)

#### Buttons

| Button | Action |
|---|---|
| **← back to clients** | Navigate to `/clients` |
| **[manual] [hitl] [auto]** | Sets autonomy mode immediately |
| **[ Scan now ]** | `POST /api/scanner/run?clientId=` |
| **Source name** | Opens source detail (read-only in MVP) |
| **view opportunities →** | Navigate to `/opportunities?clientId=` filtered |

---

### 4. Opportunities — `/opportunities`

**Purpose:** Full queue of every opportunity across all states. Kellie's working list when she wants to browse, filter, or check status — not where she approves (that's `/approvals`).

#### What Kellie sees

Page title: **opportunities**  
Subtitle: *Every opportunity, every state*

**Filter bar:**

```
filter: [all] [discovered] [pending review] [approved] [rejected] [failed] [archived]
```

Additional dropdowns (MVP):

- **Client:** All · Kellie KC · Crossroads BID
- **Type:** All · event · news · reddit_post · venue · trend · community · seasonal
- **Category:** All · Food & Drink · Events · …

**Table columns:**

| # | State | Score | Title | Type | Category | Source | Event date | Location | Discovered |
|---|---|---|---|---|---|---|---|---|---|
| 01 | pending_review | 0.87 | First Fridays returns to the Crossroads | event | Arts & Culture | Visit KC | Jun 6 | Crossroads | 2h ago |
| 02 | pending_review | 0.82 | New coffee shop opening on Main St | reddit_post | Food & Drink | r/kansascity | — | Main St | 2h ago |
| 03 | approved | 0.91 | Royals homestand this weekend | event | Sports | Visit KC | Jun 7 | Kauffman | 1d ago |

- **State** renders as a colored pill (see State pills below)
- **Score** shows `relevance` as a percentage (e.g. `87%`) with urgency dot if ≥ 0.7
- **Title** links to opportunity detail (post-MVP; MVP title is plain text)
- **Source** links externally to Reddit post or event page

Empty state:  
`[empty] No opportunities yet — run a scan from your client page.`

#### Buttons

| Button | Action |
|---|---|
| Filter pills | Reload table with `?state=` query |
| Client / type / category dropdowns | Combined filter |
| Title (post-MVP) | Open `/opportunities/[id]` detail drawer |
| Source link | Opens original URL in new tab |

---

### 5. Approvals — `/approvals`

**Purpose:** Kellie's primary workspace. This is where decisions happen.

#### What Kellie sees

Page title: **approvals**  
Subtitle:

> *Opportunities Benson scored and is waiting for you to review. Approve to add them to your approved list. Reject to pass — Benson won't surface this item again.*

If inbox is empty:

```
┌─────────────────────────────────────────────┐
│           // inbox empty                    │
│     Benson has nothing pending for you.     │
│                                             │
│   Benson · last scan: Today, 6:02 AM        │
└─────────────────────────────────────────────┘
```

If items exist, Kellie sees a **vertical stack of approval cards** — one per opportunity, ordered newest first.

#### Buttons (page level)

None beyond navigation. All actions live on each card.

---

### 6. Runs — `/runs`

**Purpose:** Audit log for transparency and debugging. Kellie checks here if something looks stuck.

#### What Kellie sees

Page title: **runs**  
Subtitle: *Audit log · every scan, score, and state transition*

Table:

| Time | Worker | Transition | Status | Duration |
|---|---|---|---|---|
| 6:02:14 AM | scanner | — → discovered | success | 4.2s |
| 6:02:18 AM | scorer | discovered → pending_review | success | 1.8s |
| 6:02:19 AM | scorer | discovered → archived | success | 1.1s |

Failed rows show red status with expandable error message.

Filter (MVP): **Opportunity ID** search box.

---

## Opportunity Cards

There are two card contexts: **Approval card** (full, interactive) and **Opportunity row** (compact, in the queue table). The approval card is the canonical design.

### Approval card — full layout

Each card is a bordered block with numbered index (`01.`, `02.`, …).

```
┌──────────────────────────────────────────────────────────────────────────┐
│  01.  First Fridays returns to the Crossroads          Jun 5, 6:02 AM   │
│                                                                          │
│  type=event · category=Arts & Culture · source=Visit KC Events           │
│  client=Kellie KC · urgency=high · relevance=87%                         │
│                                                                          │
│  ┌─ SCORES ──────────────────────────────────────────────────────────┐   │
│  │  Relevance   ████████████████████░░░░  87%   Strong KC fit       │   │
│  │  Urgency     ████████████████████████  92%   Event in 2 days     │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  BENSON'S SUMMARY                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Crossroads First Fridays returns this Friday with 40+ galleries   │  │
│  │  open late, live music, and food trucks along 19th Street. Strong  │  │
│  │  tie-in for local culture and weekend planning content.            │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  BENSON SUGGESTS                                                         │
│  "Your guide to First Fridays this month — 3 stops in the Crossroads"   │
│                                                                          │
│  DETAILS                                                                 │
│  Event     Fri, Jun 6 · 6:00 PM – 10:00 PM                               │
│  Location  Crossroads Arts District, Kansas City, MO                     │
│  Source    visitkc.com/events/first-fridays →  [ open source ↗ ]        │
│  Map       39.0912, -94.5823  →  [ view on map ↗ ]                      │
│                                                                          │
│  WHY BENSON SCORED IT THIS WAY                                           │
│  ✓ Matches your Arts & Culture focus                                     │
│  ✓ Event within 7 days — Benson boosted urgency                            │
│  ✓ Benson found no similar approval in the last 90 days                  │
│                                                                          │
│  [ Ask Benson why ]   [ Approve ]   [ Reject ]                           │
│                                                                          │
│  ┌─ Ask Benson (expanded) ──────────────────────────────────────────┐   │
│  │  Benson weighted this highly because the event is time-bound and  │   │
│  │  locally specific. r/kansascity discussed it this week.           │   │
│  └───────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

### Fields displayed on every approval card

| Field | Always shown? | Description |
|---|---|---|
| **Index + title** | Yes | Headline from source or LLM-normalized |
| **Discovered timestamp** | Yes | When the scan created this row |
| **Type** | Yes | event, reddit_post, news, venue, trend, community, seasonal |
| **Category** | Yes | Assigned by scorer (Food & Drink, Events, etc.) |
| **Source name** | Yes | e.g. "r/kansascity hot" |
| **Client** | Yes | Which client this belongs to |
| **Relevance score** | Yes | 0–100% bar + one-line rationale |
| **Urgency score** | If computed | 0–100% bar; hidden if not applicable |
| **Benson's summary** | Yes | 2–4 sentence assistant summary for quick context |
| **Benson suggests** | Yes | One-line content hook idea |
| **Event date/time** | If type=event | Start and end |
| **Location** | If available | Venue or neighborhood name |
| **Source link** | Yes | Opens original Reddit post, event page, etc. |
| **Map link** | If lat/lng present | Google Maps deep link |
| **Why Benson scored it this way** | Yes | 2–4 bullet checklist in Benson's voice |
| **Ask Benson why** | Yes | Expandable plain-language explanation |
| **Duplicate warning** | If near-duplicate | Amber banner: "Benson found a near-duplicate of an item you approved on May 12" |

### Reddit-specific card additions

For `type=reddit_post`:

| Field | Example |
|---|---|
| Subreddit | r/kansascity |
| Reddit score | 142 upvotes |
| Comments | 38 comments |
| Flair | `[Event]` |

### Compact row (Opportunities table)

The table row shows a subset: state pill, relevance %, title, type, category, source, event date, location, discovered time. No summary or angle — Kellie opens `/approvals` to decide.

---

## State Pills

Visual badges used everywhere state appears:

| State | Color | Label | Meaning for Kellie |
|---|---|---|---|
| `discovered` | Gray | discovered | Just found; scorer hasn't run yet |
| `scored` | Blue | scored | Scored but not yet in inbox (transient) |
| `pending_review` | Amber | pending review | **Needs your decision** |
| `approved` | Green | approved | You said yes |
| `rejected` | Red | rejected | You said no |
| `archived` | Gray | archived | System archived (duplicate, expired, low score) |
| `failed` | Red | failed | Something broke — check Runs |

---

## How Approvals Work

### Default mode: HITL

New clients start in **hitl** (human-in-the-loop) mode. Kellie must explicitly approve or reject every opportunity that clears scoring.

### Approval flow (step by step)

1. **Scan runs** (automatic at 6:00 AM CST, or when Kellie clicks **Scan now**).
2. Scanner creates opportunities in `discovered`.
3. Scorer runs within seconds, assigns scores and summary, moves item to `pending_review`.
4. Kellie's **Approvals badge** increments (e.g. `[approvals · 3]`).
5. Kellie opens `/approvals`, reads each card (~30 seconds each).
6. She clicks **[ Approve ]** or **[ Reject ]**.

**On Approve:**

- Card animates out of inbox
- State → `approved`
- `reviewed_at` and `reviewed_by` recorded
- Item appears in `/opportunities?state=approved`
- Toast: `Approved · First Fridays returns to the Crossroads`
- Approved items are available for export / content brief (post-MVP)

**On Reject:**

- **[ Reject ]** expands an inline text area: "Why reject?"
- Kellie must enter at least 2 characters (e.g. "Too generic" or "Already covered this event")
- She clicks **[ Confirm reject ]** or **cancel**
- State → `rejected`
- Rejection reason stored for future scorer tuning (post-MVP)
- Toast: `Rejected · item archived from inbox`

Rejected items do **not** re-enter the inbox unless the same source posts a genuinely new item (different external ID).

### Autonomy modes

Kellie switches mode on the client detail page:

| Mode | Behavior |
|---|---|
| **manual** | Reserved for future use — all transitions require explicit action |
| **hitl** (default) | Scored items land in `/approvals`; Kellie must approve |
| **auto** | Scorer-approved items with relevance ≥ 0.75 skip inbox and go directly to `approved` |

When **auto** is active:

- Header shows amber `auto-approve on`
- `/approvals` inbox stays empty unless an item scores below the auto threshold
- Kellie reviews results in `/opportunities?state=approved` instead

### Slack notifications (optional)

If configured, Kellie receives a Slack message every 30 minutes when pending items exist:

> **Benson · 3 opportunities pending review**  
> 1. First Fridays returns to the Crossroads (87%)  
> 2. New coffee shop opening on Main St (82%)  
> 3. Streetcar extension community meeting (71%)  
> → [ Open approvals ]

Slack is notification-only in MVP — approve/reject still happens in the dashboard.

---

## How Opportunity Scoring Works

**Benson** scores every opportunity automatically. Kellie never clicks a "score" button. Benson **shows its work** on every approval card in the "Why Benson scored it this way" section, with optional **[ Ask Benson why ]** for a longer explanation.

### When scoring happens

Scoring runs automatically after discovery, typically within 2–5 seconds per item. Kellie never clicks a "score" button.

### What the scorer evaluates

For each discovered opportunity, Benson evaluates the raw source data along with:

- Client name and **brand voice**
- Client's active **categories** and their weights
- Kansas City **geo boundary** (50 km radius from downtown by default)
- Recent approved and rejected opportunities (last 90 days) for dedup context

The scorer returns:

| Output | Range | Shown to Kellie as |
|---|---|---|
| **Relevance score** | 0.0 – 1.0 | Percentage bar + label (e.g. "Strong KC fit") |
| **Urgency score** | 0.0 – 1.0 | Percentage bar + label (e.g. "Event in 2 days") |
| **Category** | One of 7 KC categories | Tag on card |
| **Type** | event, reddit_post, etc. | Tag on card |
| **Summary** | 2–4 sentences | Summary block |
| **Suggested angle** | One sentence | Angle block |

### Relevance score — what it means

Relevance answers: *"Is this worth covering for this client in Kansas City?"*

| Score | Label | Typical meaning |
|---|---|---|
| 0.85 – 1.00 | Excellent | Strong local tie, clear audience interest, matches category |
| 0.70 – 0.84 | Good | Relevant but may need a sharper angle |
| 0.50 – 0.69 | Fair | Tangentially KC-related; shown in inbox but flagged |
| Below 0.50 | Low | Auto-archived — Kellie never sees it |

Factors that **raise** relevance:

- Explicit KC location or neighborhood mention
- Matches a client category with high weight
- High engagement on source (Reddit upvotes, comments)
- Event within the client's metro radius
- Timely news or trend with local hook

Factors that **lower** relevance:

- Generic national topic with weak KC angle
- Wrong subreddit flair (e.g. housing listing, for-sale post)
- Outside geo radius
- Low engagement on source post

### Urgency score — what it means

Urgency answers: *"How time-sensitive is this?"*

| Score | Label | Typical meaning |
|---|---|---|
| 0.80 – 1.00 | High | Event within 3 days, breaking news, limited window |
| 0.50 – 0.79 | Medium | Event within 2 weeks, trending this week |
| Below 0.50 | Low | Evergreen or no date attached |

Events always get an urgency score. Reddit posts and venue openings get urgency if the scorer detects time language ("this weekend", "opening Friday").

### Duplicate detection

Benson prevents the same story from filling the inbox twice:

1. **Exact dedup:** Same source + same external ID (Reddit post ID, event ID) → silently skipped on re-scan.
2. **Semantic dedup:** Embedding similarity > 85% vs any opportunity in the last 90 days for the same client → item is **archived** with note "Near-duplicate of [title]". Kellie does not see it unless she filters `/opportunities?state=archived`.

If a near-duplicate is close but kept (edge case), the approval card shows an amber banner:

> ⚠ Similar to an opportunity you approved on May 12: *"Crossroads gallery walk this Friday"*

### What Kellie does not see

| Internal step | Kellie-visible? |
|---|---|
| Raw API response | No (available in Runs / post-MVP detail view) |
| Embedding vector | No |
| LLM prompt | No |
| Retry attempts | Only if state = `failed` |
| Items below 0.50 relevance | No — auto-archived |
| Exact duplicates on re-scan | No — silently skipped |

### Scoring in auto mode

When client is in **auto** mode:

- Relevance ≥ **0.75** → auto-approved, skips inbox
- Relevance 0.50 – 0.74 → lands in inbox for Kellie's review
- Relevance < 0.50 → archived

Kellie can change the auto-approve threshold in client settings (post-MVP). MVP uses fixed 0.75.

---

## Typical Day for Kellie

### 7:30 AM — Morning review (5–10 minutes)

1. Log in → **Overview** shows `7 pending review` from overnight scan
2. Click **Approvals badge** → `/approvals`
3. Review 7 cards top to bottom:
   - Approve: First Fridays event, new restaurant opening, Royals homestand
   - Reject: "Moving to KC — advice?" (too generic), duplicate food thread, national news repost
4. Inbox empty — badge clears

### 10:00 AM — Client check

1. Open **Clients** → **Crossroads BID**
2. Click **[ Scan now ]** after seeing a tip about a street fair
3. Wait 15 seconds → `+2` new opportunities
4. Go to **Approvals** → 2 new cards appear
5. Approve one, reject one

### 2:00 PM — Status check

1. Open **Opportunities** → filter `approved`
2. See 5 approved items from this week — copy titles and angles into her content calendar (external tool; post-MVP export button)

### Friday — Audit

1. Open **Runs** → confirm all scans succeeded this week
2. One failed row: Reddit rate limit — self-resolved on next scan

---

## Empty and Error States

| Situation | What Kellie sees | Action available |
|---|---|---|
| No opportunities ever | Empty queue + prompt to scan | **Scan now** on client page |
| Inbox empty | "inbox empty" message with last scan time | **Scan now** link |
| Source scan failed | Red ⚠ on source row in client detail | Retry via **Scan now**; error in tooltip |
| API unreachable | Red error banner on Overview | "Benson can't reach the server — check that Kellie Assistant is running" |
| Item failed scoring | Row in `/opportunities?state=failed` | View error in Runs; re-scan does not auto-retry |

---

## Buttons Reference (Complete)

| Button | Page | Effect |
|---|---|---|
| **Sign in** | Login | Authenticate |
| **Sign out** | User menu | End session |
| **Got it** | Overview banner | Dismiss welcome banner |
| **[overview] [clients] …** | Header nav | Navigate |
| **+ New client** | Clients | Create client modal |
| **← back to clients** | Client detail | Navigate |
| **[manual] [hitl] [auto]** | Client detail | Set autonomy mode |
| **[ Scan now ]** | Client detail | Trigger source scan |
| **view opportunities →** | Client detail | Filtered opportunity queue |
| **Filter pills** | Opportunities | Filter by state |
| **Client / type / category** | Opportunities | Combined filter |
| **open source ↗** | Approval card | External link to origin |
| **view on map ↗** | Approval card | Google Maps link |
| **[ Approve ]** | Approval card | Approve opportunity |
| **[ Reject ]** | Approval card | Expand rejection form |
| **[ Confirm reject ]** | Approval card | Submit rejection |
| **[ Ask Benson why ]** | Approval card | Expand Benson's score explanation |
| **cancel** | Approval card | Collapse rejection form |
| **manage clients →** | Overview | Navigate |
| **view all runs →** | Overview | Navigate |

---

## Out of Scope for v1 (Set Expectations)

Kellie Assistant v1 does **not**:

- Write full social posts or captions
- Publish to Instagram, TikTok, or any platform
- Send email digests (Slack notification only, optional)
- Edit source configurations in the UI (read-only list)
- Show a map view of all opportunities (link per card only)
- Support multiple user roles (single admin in MVP)
- Export approved list (Kellie copies manually)

These are planned for v1.1+.

---

## Success Metrics

Kellie knows the product is working when:

- She spends **under 10 minutes/day** in the approvals inbox
- **80%+** of inbox items feel relevant (measured by approve rate)
- She discovers at least **3 approve-worthy opportunities per week** she would have missed manually
- Zero duplicate approvals of the same event or Reddit thread

---

## Glossary

| Term | Definition |
|---|---|
| **Benson** | The user-facing AI assistant — discovers, scores, explains, and (in later phases) recommends KC opportunities |
| **Kellie** | The human operator — content strategist who approves or rejects Benson's findings |
| **Kellie Assistant** | Product and engineering name for the dashboard and backend (internal / app shell) |
| **Opportunity** | A single piece of local content signal Benson surfaced for Kellie's review |
| **Client** | A brand or property Kellie monitors (may have multiple; see [MVP_SIMPLIFICATION.md](./MVP_SIMPLIFICATION.md)) |
| **Source** | A configured feed (Reddit, RSS, events, Maps) that Benson scans |
| **Scan** | One pass over all active sources — initiated by Kellie or Benson's schedule |
| **Relevance** | Benson's 0–100% judgment of KC content fit |
| **Urgency** | Benson's 0–100% judgment of time-sensitivity |
| **Approval** | Kellie's yes/no decision on a Benson-scored opportunity |
| **HITL** | Human-in-the-loop — Kellie approves before an opportunity is marked ready |

---

*End of product specification.*
