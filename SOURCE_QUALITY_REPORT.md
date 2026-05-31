# Source Quality Report

**Date:** 2026-05-31  
**Scope:** Analysis of all ingested opportunities currently in the database  
**Method:** Live API snapshot (`GET /api/content?ingested=true&limit=200`) + human usefulness assessment  
**No code changes** — report only

---

## Executive Summary

The database currently holds **71 ingested opportunities**: **51 from Reddit** and **20 from Visit KC**. Visit KC is dramatically higher signal for Benson-style local content (avg usefulness **84/100**); Reddit is dominated by low-value discussion threads (avg usefulness **29/100**, **61%** classified as `discussion`).

| Metric | Reddit | Visit KC | Combined |
|---|---|---|---|
| Total opportunities | 51 | 20 | 71 |
| Avg usefulness score | 29 | 84 | 42 |
| High value (70+) | 4 (8%) | 16 (80%) | 20 (28%) |
| Medium (40–69) | 11 (22%) | 4 (20%) | 15 (21%) |
| Low (<40) | 36 (71%) | 0 (0%) | 36 (51%) |

**Bottom line:** Visit KC should be treated as the **primary** feed. Reddit adds volume but ~71% of its rows are poor fits for tourism/local-discovery video content without aggressive filtering.

---

## 1. Totals

| Source | Count | Share |
|---|---|---|
| **Reddit** (r/kansascity RSS) | **51** | 72% |
| **Visit KC** (news.visitkc.com RSS) | **20** | 28% |
| **Total** | **71** | 100% |

---

## 2. Reddit Analysis (51 opportunities)

### Top categories

| Rank | Category | Count | % of Reddit |
|---|---|---|---|
| 1 | discussion | 31 | 61% |
| 2 | event | 6 | 12% |
| 3 | deal | 6 | 12% |
| 4 | attraction | 4 | 8% |
| 5 | restaurant_opening | 3 | 6% |
| 6 | festival | 1 | 2% |

**Observation:** The category classifier over-labels generic Q&A as `event`, `deal`, and `attraction`. Only **4 rows (8%)** are in genuinely actionable categories (`restaurant_opening` + `festival`), and even those include weak matches (e.g. "Mexican sit-down restaurants" is a recommendation request, not an opening).

### Most common locations

| Location | Count | Notes |
|---|---|---|
| *(none / unknown)* | 33 | 65% of Reddit rows lack a neighborhood clue |
| kansas city | 8 | Generic metro reference only |
| westport | 2 | |
| brookside | 1 | |
| waldo | 1 | |
| midtown | 1 | |
| plaza | 1 | |
| crossroads | 1 | |
| river market | 1 | |
| west bottoms | 1 | |
| independence | 1 | |
| northland | 1 | |
| liberty | 1 | |
| 107 w lexington ave | 1 | Address parsed from body |
| *(garbled)* | 1 | RSS artifact in location field |

**Observation:** Location extraction works when users name neighborhoods in titles, but most hot-post threads are city-agnostic help requests.

### Most common keywords (title + body, HTML stripped)

| Keyword | Count | Signal |
|---|---|---|
| looking | 18 | Help-seeking |
| anyone | 16 | Q&A pattern |
| need | 10 | Help-seeking |
| help | 8 | Help-seeking |
| find | 8 | Recommendation request |
| place | 13 | Generic |
| good | 14 | Opinion/review |
| city / kansas | 16 / 13 | Generic geo |
| week / going | 6 | Mixed |
| contractor-adjacent | — | flatwork, powder coating, skylight |

**Dominant themes:** recommendation threads, contractor/service requests, personal questions, minor local news, and noise (memes, wildlife photos, utility billing).

### Estimated usefulness score (human analysis)

| Band | Count | Assessment |
|---|---|---|
| **High (70+)** | 4 | Actionable local happenings — museum opening, weekly roundup, live music, Liberty Memorial event |
| **Medium (40–69)** | 11 | Borderline — some local news (Costco, Red Lobster closure), niche events (Beyblade tournament), misc |
| **Low (<40)** | 36 | Not suitable for Benson content — help threads, contractors, dating, crime, trivia |

**Reddit usefulness estimate: 29/100 overall**

Reddit hot feed reflects *community conversation*, not *discoverable opportunities*. Roughly **1 in 13** Reddit rows is high-value without filtering.

---

## 3. Visit KC Analysis (20 opportunities)

### Top categories

| Rank | Category (`opportunityCategory`) | Count | % of Visit KC |
|---|---|---|---|
| 1 | releases | 12 | 60% |
| 2 | news | 8 | 40% |

All 20 items map to RSS `<contentType>` values `releases` or `news`. No events calendar entries in this feed snapshot.

### Most common locations

| Location | Count | Notes |
|---|---|---|
| kansas city | 20 | 100% — all rows tagged |
| mission | 12 | Over-counted: "Mission" appears in PR boilerplate ("mission to…"), not the city of Mission, KS |
| crown center | 1 | |
| downtown | 1 | |
| power & light | 1 | |
| 18th and vine | 1 | |
| *(garbled long strings)* | 2 | HTML/boilerplate misparsed as location clues |

**Observation:** Visit KC location signal is reliable at metro level but neighborhood extraction needs refinement (false "mission" hits, boilerplate fragments).

### Most common keywords (title + body, HTML stripped)

| Keyword | Count | Theme |
|---|---|---|
| kansas / city | 105 / 117 | Core geo |
| visit | 50 | Tourism org |
| restaurant | 32 | Dining |
| rugby / world / league / premier | 34 / 35 / 26 / 25 | Major sports tourism |
| week | 21 | Restaurant Week, recurring events |
| local | 25 | Community |
| tourism / visitors / events | 15 each | DMO focus |
| museum / bbq / barbecue | 13 / — | Attractions |
| black | 16 | Black History Month programming |
| host | 16 | Major events coming to KC |

**Dominant themes:** Restaurant Week, Rugby World Cup / Premier League / WNBA, BBQ tourism, national media coverage of KC, Visit KC program launches.

### Link destinations

| Domain | Count |
|---|---|
| news.visitkc.com | 12 |
| bbc.com | 1 |
| midwestliving.com | 1 |
| smithsonianmag.com | 1 |
| lonelyplanet.com | 1 |
| afar.com | 1 |
| adventure.com | 1 |
| the-independent.com | 1 |
| matadornetwork.com | 1 |

60% link to Visit KC's own newsroom; 40% are earned media roundups (still on-brand for tourism content).

### Estimated usefulness score (human analysis)

| Band | Count | Assessment |
|---|---|---|
| **High (70+)** | 16 | Timely, promotable KC stories — Restaurant Week, sports hosting, awards, new programs |
| **Medium (40–69)** | 4 | Good context but less urgent — Black History Month recap, brewery profile, Mindtrip launch |
| **Low (<40)** | 0 | None |

**Visit KC usefulness estimate: 84/100 overall**

Nearly every Visit KC row is usable for Benson as-is. The main gap is *specific venue/date/time* metadata for event-style releases.

---

## 4. Best 25 Opportunities (currently in database)

Ranked by human usefulness score (100 = ideal Benson opportunity).

| # | Score | Source | Category | Title |
|---|---|---|---|---|
| 1 | 100 | Visit KC | releases | Visit KC Celebrates 2024 Achievements During Annual Tourism Outlook |
| 2 | 100 | Visit KC | releases | KC Restaurant Week 2025 Generates $129K Donation to Local Charity |
| 3 | 100 | Visit KC | releases | Kansas City to host Premier League and NBC Sports' 11th "Premier League Mornings Live" Fan Fest |
| 4 | 100 | Visit KC | releases | 17th Annual Kansas City Restaurant Week Returns January 2026 |
| 5 | 95 | Visit KC | releases | Kansas City Celebrates Past, Present and Future during Black History Month |
| 6 | 92 | Visit KC | news | BBC: Kansas City Named Among 25 Best Places to Travel in 2025 |
| 7 | 88 | Visit KC | releases | Kansas City Enters Men's Rugby World Cup 2031 Host City Applicant Phase |
| 8 | 82 | Visit KC | releases | Minnesota Lynx set to take on Nigeria as WNBA returns to Kansas City |
| 9 | 80 | Reddit | event | Playing raytown records tomorrow evening… |
| 10 | 78 | Reddit | restaurant_opening | New Media Tech Museum opening this Monday at 1600 Baltimore in the Crossroads |
| 11 | 77 | Visit KC | news | AFAR: Best Places in the U.S. for Summer Travel |
| 12 | 70 | Visit KC | releases | Visit KC launches revamped BBQ Experience program |
| 13 | 70 | Visit KC | releases | Enjoy Exclusive Savings at Local Distilleries, Wineries and Cocktail Bars with New Visit KC Program |
| 14 | 70 | Visit KC | releases | Kansas City to Host Women's Rugby Double-Header at CPKC Stadium |
| 15 | 69 | Visit KC | releases | Visit KC taps Mindtrip to help visitors discover the Heart of America |
| 16 | 65 | Visit KC | news | Midwest Living: Kansas City Attractions Earn Best of the Midwest Awards |
| 17 | 65 | Visit KC | news | Smithsonian Magazine: The World's First Barbecue Museum Is a Feast for the Senses |
| 18 | 65 | Visit KC | news | Lonely Planet: KC Among Best Weekend Getaways Across the USA |
| 19 | 65 | Visit KC | news | The Independent: Inside America's budget-friendly, BBQ-obsessed World Cup city |
| 20 | 65 | Visit KC | news | Matador: Where to Eat, Play, and Stay for Kansas City's 2026 World Cup Matches |
| 21 | 60 | Visit KC | releases | Everything to Know About KC Restaurant Week, Returning Jan. 9–18 |
| 22 | 60 | Reddit | event | Another impressive wedding reception tonight on the north lawn of Liberty Memorial. |
| 23 | 57 | Reddit | event | Kansas City Beyblade Infinity Tournament |
| 24 | 55 | Visit KC | news | Adventure: Could Missouri's first Black-owned brewery regenerate this KC neighborhood? |
| 25 | 50 | Reddit | restaurant_opening | What's Happening This Week of May 25, 2026 |

**Pattern:** 21 of 25 best rows are Visit KC. The only Reddit standouts are a **museum opening with address**, a **weekly happenings roundup**, and **niche live events**.

---

## 5. Worst 25 Opportunities (currently in database)

| # | Score | Source | Category | Title | Why it's low value |
|---|---|---|---|---|---|
| 1 | 0 | Reddit | discussion | Realistic heart anatomy tattoo | Service request, not local discovery |
| 2 | 0 | Reddit | discussion | Passenger killed in high-speed crash involving McLaren in Kansas City, Kansas | Tragedy/crime — wrong tone for tourism content |
| 3 | 0 | Reddit | discussion | KC young adults: What are you doing on a Friday night? | Social Q&A |
| 4 | 0 | Reddit | discussion | Animal Shelter Volunteering | Volunteer inquiry |
| 5 | 0 | Reddit | discussion | Mythos hot sauce, is it coming back or is it gone for good | Product availability question |
| 6 | 0 | Reddit | discussion | Flatwork / concrete Contractors | Contractor lead gen |
| 7 | 0 | Reddit | event | Dog activities this weekend? | Pet recommendation request |
| 8 | 0 | Reddit | discussion | Place to see axolotl | Niche recommendation |
| 9 | 0 | Reddit | discussion | I have no where to go | Personal crisis / off-brand |
| 10 | 0 | Reddit | discussion | Need help with a few things | Generic help request |
| 11 | 0 | Reddit | discussion | Sunroom skylight replacement | Home repair contractor |
| 12 | 5 | Reddit | attraction | Looking for information on a long demolished project. | Obscure history question |
| 13 | 5 | Reddit | deal | Local Board Game night | Niche social, low production value |
| 14 | 10 | Reddit | discussion | Is the KC Heart Logo trademarked? | Trivia / legal question |
| 15 | 10 | Reddit | discussion | Where can I get authentic ceremonial grade matcha? | Product hunt |
| 16 | 10 | Reddit | deal | Any local poker night groups to join? | Social group search |
| 17 | 10 | Reddit | discussion | Hakes Brothers - Good or Bad? | Business review thread |
| 18 | 10 | Reddit | discussion | *actually affordable* thrifting in the area? | Shopping recommendation |
| 19 | 10 | Reddit | discussion | older stone foundations around waldo, how scary are they? | Homebuyer anxiety |
| 20 | 10 | Reddit | discussion | Stupid question, any pedestrian bridges for crossing the river? | Infrastructure trivia |
| 21 | 10 | Reddit | discussion | Anyone here work for Panasonic? | Employment networking |
| 22 | 10 | Reddit | discussion | Dating Chats/Discords? | Social/dating |
| 23 | 15 | Reddit | event | Missouri governor says income tax elimination plan will be on August ballot | Political advocacy |
| 24 | 19 | Reddit | attraction | Temperature Check on KC Apprenticeships/Trades | Workforce discussion |
| 25 | 20 | Reddit | discussion | Red Lobster permanently closes 2 Kansas City area locations | Closure news — mildly useful but dated/low energy |

**Pattern:** All 25 worst rows are Reddit. **100% are discussion/help/personal threads** miscategorized as event/deal/attraction. Zero Visit KC rows appear in the bottom quartile.

---

## 6. Recommendations

### What should be filtered (Reddit)

Apply title/body blocklists or pre-ingest gates to drop rows matching these patterns:

| Filter target | Examples from current data | Rationale |
|---|---|---|
| **Help / recommendation requests** | "looking for", "anyone know", "where can I get", "need help" | 18+ rows; zero video hook |
| **Contractor / home services** | skylight, flatwork, concrete, powder coating | Lead-gen, not content |
| **Personal / social** | dating, discord, "what are you doing Friday" | Off-brand for Benson |
| **Crime / tragedy** | crash, killed, shooting | Wrong tone |
| **Politics / advocacy** | governor, ballot, tax plan | Polarizing, ephemeral |
| **Pure Q&A / trivia** | trademarked?, pedestrian bridges, axolotl | No local story |
| **Meme / noise** | "Sir, That's a Butthole", good morning posts | No production value |
| **Misclassified `event`** | Dog activities, dating, tax ballot | Keyword false positives |

**Target:** Reduce Reddit ingest from ~51 rows/scan to **~5–10 high-signal rows** by filtering before insert or at display time.

**Do not filter Visit KC** — current feed quality is uniformly good.

### What should be boosted

| Signal | Source | Action |
|---|---|---|
| **Restaurant Week / dining programs** | Visit KC | Highest recurring content pillar; boost score + pin during Jan/Feb |
| **Major sports hosting** | Visit KC | Rugby, Premier League, WNBA — timely, visual, shareable |
| **New openings with address + date** | Reddit | "New Media Tech Museum opening… 1600 Baltimore" — gold standard for Reddit |
| **Weekly happenings roundups** | Reddit | "What's Happening This Week" threads — aggregate source |
| **National media KC features** | Visit KC | BBC, Smithsonian, Lonely Planet — credibility + travel intent |
| **BBQ / tourism programs** | Visit KC | On-brand for Benson KC positioning |
| **Neighborhood-specific + date** | Both | crossroads, river market, power & light + "this Monday/weekend" |
| **Visit KC `releases` over `news`** | Visit KC | Releases are first-party, more actionable |

**Source weighting suggestion (for future scoring phase):**

```
Visit KC releases  → 1.0
Visit KC news      → 0.85
Reddit opening/event with location + date → 0.7
Reddit local news  → 0.5
Reddit everything else → 0.1 (or filter out)
```

### Additional metadata to extract

| Field | Source | Why |
|---|---|---|
| **Event start / end datetime** | Visit KC body, Reddit titles | "opening this Monday", Restaurant Week Jan 9–18 |
| **Venue name** | Both | CPKC Stadium, Liberty Memorial, 1600 Baltimore |
| **Street address** | Reddit titles, Visit KC HTML | Already appears in 1–2 rows; should be structured |
| **Neighborhood (normalized)** | Both | Fix false "mission" hits; map to KC neighborhood taxonomy |
| **External vs first-party URL** | Visit KC | `isEarnedMedia: true` for BBC, AFAR, etc. |
| **Media outlet name** | Visit KC news items | "BBC", "Smithsonian" — useful for hook generation |
| **Question vs statement** | Reddit titles | `isQuestion: title.endsWith('?')` — strong negative signal |
| **Help-seeking intent** | Reddit | Regex flag for filter pipeline |
| **Image / media present** | Reddit RSS | Thumbnail availability for video prep |
| **Recency decay** | Both | Visit KC Restaurant Week 2025 vs 2026 — prefer upcoming |
| **Duplicate story detection** | Both | Red Lobster closure + Visit KC restaurant coverage may overlap later |
| **Boilerplate stripping** | Visit KC HTML | Prevent "000 community partners" location artifacts |
| **Primary entity** | Both | Restaurant name, team name, festival name for dedup/search |

---

## 7. Source Comparison

```
                    USEFULNESS DISTRIBUTION (71 rows)

Visit KC  ████████████████████ 80% high  │ 20% medium  │  0% low
Reddit    ██ 8% high               │ 22% medium  │ 71% low
```

| Dimension | Reddit | Visit KC | Winner |
|---|---|---|---|
| Volume | 51 | 20 | Reddit |
| Signal quality | Low | High | **Visit KC** |
| Actionable categories | 8% | 100% | **Visit KC** |
| Location precision | 35% | 100% (metro) | **Visit KC** |
| Timeliness | Mixed hot posts | Curated releases | **Visit KC** |
| Unique local discoveries | Rare | Common | **Visit KC** |
| Community authenticity | High | Low (PR tone) | Reddit (when filtered) |

**Recommended ingest strategy:** Keep Visit KC as primary feed at full volume. Treat Reddit as **supplemental** with aggressive question/contractor/help filters, prefer `new` or keyword-filtered subsets over raw `hot`.

---

## 8. Data Quality Issues Observed (metadata only — no code changes)

1. **Reddit category overreach** — 31 `discussion` rows plus mislabeled `event`/`deal`/`attraction` rows.
2. **Reddit location gaps** — 65% unknown neighborhood.
3. **Visit KC location false positives** — "mission" counted 12× from PR copy, not Mission, KS.
4. **Visit KC HTML in body** — Keywords polluted by `rsquo`, `paraeid`, `strong` before strip (stored raw in `script`).
5. **No event datetime** — Restaurant Week dates exist in text but not structured fields.
6. **Reddit RSS body noise** — HTML table markup inflates stored payload size.

---

## Appendix: Scoring Rubric (human analysis)

Scores 0–100 based on fit for Benson local discovery / tourism video content:

| Factor | Weight |
|---|---|
| Specific venue or address | +15–20 |
| Date/time urgency (this week, opening Monday) | +10–15 |
| Major event / program (Restaurant Week, sports) | +15–20 |
| National media validation | +10 |
| Visit KC first-party release | +10 |
| Question-format title | −10 |
| Help/contractor/recommendation intent | −25–30 |
| Crime/tragedy/politics | −20–25 |
| Generic discussion / meme | −25–30 |
| Reddit `discussion` category | −15 |

---

**Report complete.** Snapshot reflects database state as of 2026-05-31 after Phase 2B Visit KC ingest. No application code, migrations, or APIs were modified.
