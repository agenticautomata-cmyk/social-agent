# Top Content Report

**Date:** 2026-05-31  
**Scope:** All 385 ingested opportunities  
**Method:** Read-only Postgres export + keyword/category classification  
**No code, data, scoring, or ranking changes** — analysis only

---

## Executive Summary

This report classifies every ingested row across 13 content labels and ranks the top 25 per objective. Rankings use heuristic scoring based on `opportunityCategory`, source type, metadata flags, timeliness (`event_starts_at`), and title/body keyword signals — independent of the application's `relevance_score` and `urgency_score` fields.

| Label | Rows Tagged | % of 385 |
|---|---|---|
| High Engagement | 213 | 55.3% |
| High Sponsor Value | 172 | 44.7% |
| High Audience Alignment | 228 | 59.2% |
| World Cup Opportunity | 327 | 84.9% |
| Luxury | 48 | 12.5% |
| Dining | 48 | 12.5% |
| Date Night | 43 | 11.2% |
| Family Activity | 17 | 4.4% |
| Free Event | 83 | 21.6% |
| Estate Sale | 40 | 10.4% |
| Business Opening | 44 | 11.4% |
| Consignment | 10 | 2.6% |
| Sports | 20 | 5.2% |

**Note:** Rows can carry multiple labels. Percentages sum above 100% because labels are multi-assign. World Cup tagging uses broad tourism/hospitality keywords; the top-25 list is score-ranked within tagged rows.

---

## Classification Methodology

1. **Authoritative category** — `metadata.opportunityCategory` when present
2. **Source type** — e.g. `kauffman_date_nights`, `estate_sales_net`, `kc_hotel_packages`
3. **Metadata flags** — `luxuryFlag`, `hotelFlag`, `spaFlag`, `dateNightFlag`, `rooftopFlag`
4. **Keyword heuristics** — title, topic, body, and nested metadata text
5. **Timeliness** — `event_starts_at` proximity to 2026-05-31 for "post this week" scoring

---

## 1. Top 25 Opportunities Kellie Should Post This Week

Composite of timeliness, audience alignment, engagement potential, and sponsor value. Excludes off-brand Reddit tragedy/politics content.

| Rank | Title | Source | Category | Why It Ranked Highly |
|---|---|---|---|---|
| 1 | BB Realty and Auctions Live Auction in Lees Summit | EstateSales.net Kansas City | estate_sale | Happening within the next week or freshly surfaced; Weekend estate sale with local treasure-hunt appeal; Matches Kellie pillars and sponsor potential |
| 2 | SUNDAY FUN DAY DIGGER ESTATE SALE | EstateSales.net Kansas City | estate_sale | Happening within the next week or freshly surfaced; Weekend estate sale with local treasure-hunt appeal; Matches Kellie pillars and sponsor potential |
| 3 | BB Realty and Auctions Live Auction in Lees Summit | EstateSales.org Kansas City | estate_sale | Happening within the next week or freshly surfaced; Weekend estate sale with local treasure-hunt appeal; Matches Kellie pillars and sponsor potential |
| 4 | $2M 5,400 sq. ft. Prairie Village Micro Sale | EstateSales.net Kansas City | estate_sale | Happening within the next week or freshly surfaced; Weekend estate sale with local treasure-hunt appeal; Matches Kellie pillars and sponsor potential |
| 5 | June 28th: Mables, Postcards, Artifacts & MORE !! #2 | EstateSales.net Kansas City | estate_sale | Happening within the next week or freshly surfaced; Weekend estate sale with local treasure-hunt appeal; Matches Kellie pillars and sponsor potential |
| 6 | Luxury $4.2M, 8,969 sq. ft. Mission Hills Micro Sale | EstateSales.net Kansas City | estate_sale | Happening within the next week or freshly surfaced; Weekend estate sale with local treasure-hunt appeal; Matches Kellie pillars and sponsor potential |
| 7 | Many Eclectic and New Country Primitive Items | EstateSales.net Kansas City | estate_sale | Happening within the next week or freshly surfaced; Weekend estate sale with local treasure-hunt appeal; Matches Kellie pillars and sponsor potential |
| 8 | Sweet in OP! | EstateSales.net Kansas City | estate_sale | Happening within the next week or freshly surfaced; Weekend estate sale with local treasure-hunt appeal; Matches Kellie pillars and sponsor potential |
| 9 | INDOOR ANTIQUE DEALER'S ESTATE AUCTION | EstateSales.net Kansas City | estate_sale | Happening within the next week or freshly surfaced; Weekend estate sale with local treasure-hunt appeal; Matches Kellie pillars and sponsor potential |
| 10 | INDOOR ANTIQUE DEALER'S ESTATE AUCTION | EstateSales.org Kansas City | estate_sale | Happening within the next week or freshly surfaced; Weekend estate sale with local treasure-hunt appeal; Matches Kellie pillars and sponsor potential |
| 11 | Massive Sports, Pokemon Card, Coin & Jewelry Auction – Tues 6/2 @ 6PM CST / Nationwide Shipping! | EstateSales.org Kansas City | estate_sale | Happening within the next week or freshly surfaced; Weekend estate sale with local treasure-hunt appeal; Matches Kellie pillars and sponsor potential |
| 12 | KC Sipps: New waterfront eateries and the return of patio dining opening | The Pitch KC Openings | coffee_opening | Timely business opening with named venue; Matches Kellie pillars and sponsor potential; Named local business: KC Sipps: New waterfront eateries and the return of patio dining |
| 13 | Do Good Co. — luxury consignment & designer resale | KC Consignment Shops | consignment_shop | Happening within the next week or freshly surfaced; Matches Kellie pillars and sponsor potential; Named local business: Do Good Co. |
| 14 | The Curated Closet — boutique consignment & vintage | KC Consignment Shops | consignment_shop | Happening within the next week or freshly surfaced; Matches Kellie pillars and sponsor potential; Named local business: The Curated Closet |
| 15 | My Best Friend's Closet — designer consignment Northland | KC Consignment Shops | consignment_shop | Happening within the next week or freshly surfaced; Matches Kellie pillars and sponsor potential; Named local business: My Best Friend's Closet — Barry Road |
| 16 | Style Encore — luxury resale & consignment Overland Park | KC Consignment Shops | consignment_shop | Happening within the next week or freshly surfaced; Matches Kellie pillars and sponsor potential; Named local business: Style Encore Overland Park |
| 17 | Clothes Mentor — upscale resale Overland Park | KC Consignment Shops | consignment_shop | Happening within the next week or freshly surfaced; Matches Kellie pillars and sponsor potential; Named local business: Clothes Mentor Overland Park |
| 18 | Luxury Buyer KC — designer handbag & jewelry resale | KC Consignment Shops | consignment_shop | Happening within the next week or freshly surfaced; Matches Kellie pillars and sponsor potential; Named local business: Luxury Buyer KC |
| 19 | Buffalo Exchange — vintage & designer resale Westport | KC Consignment Shops | consignment_shop | Happening within the next week or freshly surfaced; Matches Kellie pillars and sponsor potential; Named local business: Buffalo Exchange Kansas City |
| 20 | Annedore Fine Consignment — luxury home & fashion | KC Consignment Shops | consignment_shop | Happening within the next week or freshly surfaced; Matches Kellie pillars and sponsor potential; Named local business: Annedore Fine Consignment |
| 21 | Second Chance Resale — upscale thrift Brookside | KC Consignment Shops | consignment_shop | Happening within the next week or freshly surfaced; Matches Kellie pillars and sponsor potential; Named local business: Second Chance Resale |
| 22 | My Best Friend's Closet — designer consignment Shawnee | KC Consignment Shops | consignment_shop | Happening within the next week or freshly surfaced; Matches Kellie pillars and sponsor potential; Named local business: My Best Friend's Closet — Shawnee |
| 23 | 21c Museum Hotel — art-forward boutique packages & date-night stays | KC Hotel Packages | hotel_package | Happening within the next week or freshly surfaced; Matches Kellie pillars and sponsor potential; Named local business: 21c Museum Hotel Kansas City |
| 24 | Hotel Kansas City — Curio Collection weekend packages & rooftop dining | KC Hotel Packages | hotel_package | Happening within the next week or freshly surfaced; Matches Kellie pillars and sponsor potential; Named local business: Hotel Kansas City |
| 25 | Crossroads Hotel — boutique packages with Percheron Rooftop | KC Hotel Packages | hotel_package | Happening within the next week or freshly surfaced; Matches Kellie pillars and sponsor potential; Named local business: Crossroads Hotel |

---

## 2. Top 25 Opportunities Most Likely to Attract Sponsors

Named businesses, premium categories (hotel, spa, dining, estate sale, consignment), and bookable experiences.

| Rank | Title | Source | Category | Why It Ranked Highly |
|---|---|---|---|---|
| 1 | 21c Museum Hotel — art-forward boutique packages & date-night stays | KC Hotel Packages | hotel_package | Premium bookable category with direct hospitality sponsor fit; Named sponsor-ready business: 21c Museum Hotel Kansas City |
| 2 | Hotel Kansas City — Curio Collection weekend packages & rooftop dining | KC Hotel Packages | hotel_package | Premium bookable category with direct hospitality sponsor fit; Named sponsor-ready business: Hotel Kansas City |
| 3 | Crossroads Hotel — boutique packages with Percheron Rooftop | KC Hotel Packages | hotel_package | Premium bookable category with direct hospitality sponsor fit; Named sponsor-ready business: Crossroads Hotel |
| 4 | Loews Kansas City — luxury packages & Nine Zero One rooftop | KC Hotel Packages | hotel_package | Premium bookable category with direct hospitality sponsor fit; Named sponsor-ready business: Loews Kansas City Hotel |
| 5 | The Raphael Hotel — Country Club Plaza luxury stay packages | KC Hotel Packages | hotel_package | Premium bookable category with direct hospitality sponsor fit; Named sponsor-ready business: The Raphael Hotel |
| 6 | Sheraton Crown Center — family & couples getaway packages | KC Hotel Packages | hotel_package | Premium bookable category with direct hospitality sponsor fit; Named sponsor-ready business: Sheraton Kansas City Hotel at Crown Center |
| 7 | The Elms Hotel & Spa — luxury wellness packages & romantic getaways | KC Spa Packages | spa_package | Premium bookable category with direct hospitality sponsor fit; Named sponsor-ready business: The Elms Hotel & Spa |
| 8 | Spa on Penn — Plaza day spa packages & couples treatments | KC Spa Packages | spa_package | Premium bookable category with direct hospitality sponsor fit; Named sponsor-ready business: Spa on Penn |
| 9 | Amore Spa — luxury massage & wellness packages | KC Spa Packages | spa_package | Premium bookable category with direct hospitality sponsor fit; Named sponsor-ready business: Amore Spa |
| 10 | The Spa at Loews — hotel spa packages & couples treatments | KC Spa Packages | spa_package | Premium bookable category with direct hospitality sponsor fit; Named sponsor-ready business: The Spa at Loews Kansas City |
| 11 | The Spa at The Raphael — Plaza luxury spa packages | KC Spa Packages | spa_package | Premium bookable category with direct hospitality sponsor fit; Named sponsor-ready business: The Spa at The Raphael |
| 12 | Corvino — chef tasting menus & supper club date nights | Chef Tasting Menus | luxury_dining | Premium bookable category with direct hospitality sponsor fit; Named sponsor-ready business: Corvino Supper Club & Tasting Room |
| 13 | The Antler Room — seasonal chef tasting menus in Crossroads | Chef Tasting Menus | luxury_dining | Premium bookable category with direct hospitality sponsor fit; Named sponsor-ready business: The Antler Room |
| 14 | Bluestem — prix fixe tasting menus & wine pairings | Chef Tasting Menus | luxury_dining | Premium bookable category with direct hospitality sponsor fit; Named sponsor-ready business: Bluestem |
| 15 | Lazia — Italian fine dining & chef special menus | Chef Tasting Menus | luxury_dining | Premium bookable category with direct hospitality sponsor fit; Named sponsor-ready business: Lazia |
| 16 | The Rieger — historic fine dining & chef tasting experiences | Chef Tasting Menus | luxury_dining | Premium bookable category with direct hospitality sponsor fit; Named sponsor-ready business: The Rieger |
| 17 | The Savoy at 21c — chef-driven tasting menus & wine program | Chef Tasting Menus | luxury_dining | Premium bookable category with direct hospitality sponsor fit; Named sponsor-ready business: The Savoy at 21c |
| 18 | Ameristar — casino hotel packages & entertainment getaways | Casino Hotel Packages | hotel_package | Premium bookable category with direct hospitality sponsor fit; Named sponsor-ready business: Ameristar Casino Hotel Kansas City |
| 19 | Harrah's Kansas City — casino hotel packages & date-night entertainment | Casino Hotel Packages | hotel_package | Premium bookable category with direct hospitality sponsor fit; Named sponsor-ready business: Harrah's Kansas City |
| 20 | Bally's Kansas City — casino resort packages & nightlife | Casino Hotel Packages | hotel_package | Premium bookable category with direct hospitality sponsor fit; Named sponsor-ready business: Bally's Kansas City |
| 21 | Do Good Co. — luxury consignment & designer resale | KC Consignment Shops | consignment_shop | Luxury resale boutique with fashion/lifestyle sponsor adjacency; Named sponsor-ready business: Do Good Co. |
| 22 | The Curated Closet — boutique consignment & vintage | KC Consignment Shops | consignment_shop | Luxury resale boutique with fashion/lifestyle sponsor adjacency; Named sponsor-ready business: The Curated Closet |
| 23 | My Best Friend's Closet — designer consignment Northland | KC Consignment Shops | consignment_shop | Luxury resale boutique with fashion/lifestyle sponsor adjacency; Named sponsor-ready business: My Best Friend's Closet — Barry Road |
| 24 | Style Encore — luxury resale & consignment Overland Park | KC Consignment Shops | consignment_shop | Luxury resale boutique with fashion/lifestyle sponsor adjacency; Named sponsor-ready business: Style Encore Overland Park |
| 25 | Clothes Mentor — upscale resale Overland Park | KC Consignment Shops | consignment_shop | Luxury resale boutique with fashion/lifestyle sponsor adjacency; Named sponsor-ready business: Clothes Mentor Overland Park |

---

## 3. Top 25 Opportunities Most Likely to Generate Engagement

Openings, closings, estate sales, free events, sports matches, and high-discussion Reddit topics.

| Rank | Title | Source | Category | Why It Ranked Highly |
|---|---|---|---|---|
| 1 | Passenger killed in high-speed crash involving McLaren in Kansas City, Kansas | r/kansascity | discussion | Reddit discussion topic with high local comment potential; Topic contains high-engagement signal words |
| 2 | BB Realty and Auctions Live Auction in Lees Summit | EstateSales.net Kansas City | estate_sale | Estate sales generate strong local search and FOMO engagement |
| 3 | $2M 5,400 sq. ft. Prairie Village Micro Sale | EstateSales.net Kansas City | estate_sale | Estate sales generate strong local search and FOMO engagement |
| 4 | Luxury $4.2M, 8,969 sq. ft. Mission Hills Micro Sale | EstateSales.net Kansas City | estate_sale | Estate sales generate strong local search and FOMO engagement |
| 5 | June 28th: Mables, Postcards, Artifacts & MORE !! #2 | EstateSales.net Kansas City | estate_sale | Estate sales generate strong local search and FOMO engagement |
| 6 | SUNDAY FUN DAY DIGGER ESTATE SALE | EstateSales.net Kansas City | estate_sale | Estate sales generate strong local search and FOMO engagement; Topic contains high-engagement signal words |
| 7 | Many Eclectic and New Country Primitive Items | EstateSales.net Kansas City | estate_sale | Estate sales generate strong local search and FOMO engagement; Topic contains high-engagement signal words |
| 8 | Sweet in OP! | EstateSales.net Kansas City | estate_sale | Estate sales generate strong local search and FOMO engagement |
| 9 | INDOOR ANTIQUE DEALER'S ESTATE AUCTION | EstateSales.net Kansas City | estate_sale | Estate sales generate strong local search and FOMO engagement |
| 10 | BB Realty and Auctions Live Auction in Lees Summit | EstateSales.org Kansas City | estate_sale | Estate sales generate strong local search and FOMO engagement |
| 11 | INDOOR ANTIQUE DEALER'S ESTATE AUCTION | EstateSales.org Kansas City | estate_sale | Estate sales generate strong local search and FOMO engagement |
| 12 | Massive Sports, Pokemon Card, Coin & Jewelry Auction – Tues 6/2 @ 6PM CST / Nationwide Shipping! | EstateSales.org Kansas City | estate_sale | Estate sales generate strong local search and FOMO engagement |
| 13 | Rose Day | KC Parks Events | free | Free event content earns saves and forwards |
| 14 | Pop in at the Park: Gillham Park | KC Parks Events | free | Free event content earns saves and forwards |
| 15 | Pop in at the Park: Spring Valley Park | KC Parks Events | free | Free event content earns saves and forwards |
| 16 | Mobile Music Box Concert: Loose Park | KC Parks Events | free | Free event content earns saves and forwards |
| 17 | Pop in at the Park: Holmes Park | KC Parks Events | free | Free event content earns saves and forwards |
| 18 | NEW DATE! Book Beats | KC Parks Events | free | Free event content earns saves and forwards; Topic contains high-engagement signal words |
| 19 | Red Ball Tennis Experience and Country Club Plaza Walking Tour | KC Parks Events | free | Free event content earns saves and forwards |
| 20 | Duck Derby | KC Parks Events | free | Free event content earns saves and forwards |
| 21 | Pop in at the Park: Lykins Square Park | KC Parks Events | free | Free event content earns saves and forwards |
| 22 | Central Summer Reading Kickoff Party | KC Library Events | free | Free event content earns saves and forwards |
| 23 | Movie: 'Enter the Dragon' | KC Library Events | free | Free event content earns saves and forwards |
| 24 | Bookmobile at Paseo Baptist Learning Center | KC Library Events | free | Free event content earns saves and forwards |
| 25 | Bookmobile at Hogan Prep Middle School | KC Library Events | free | Free event content earns saves and forwards |

---

## 4. Top 25 Opportunities Most Aligned with the KC Content Audience

Luxury lifestyle, dining discovery, estate sales, date nights, openings, and local business content.

| Rank | Title | Source | Category | Why It Ranked Highly |
|---|---|---|---|---|
| 1 | PH Coffee opening | The Pitch KC Openings | coffee_opening | Local discovery content aligned with KC lifestyle audience; Visitor-friendly KC experience content |
| 2 | 17th Annual Kansas City Restaurant Week Returns January 2026 | Visit KC Openings | restaurant_opening | Local discovery content aligned with KC lifestyle audience; Visitor-friendly KC experience content |
| 3 | District Biskuits opening | The Pitch KC Openings | restaurant_opening | Local discovery content aligned with KC lifestyle audience; Visitor-friendly KC experience content |
| 4 | Moon Bar opening | The Pitch KC Openings | coffee_opening | Local discovery content aligned with KC lifestyle audience; Visitor-friendly KC experience content |
| 5 | Pho Solar opening | The Pitch KC Openings | restaurant_opening | Local discovery content aligned with KC lifestyle audience; Visitor-friendly KC experience content |
| 6 | Café Corazón opening | The Pitch KC Openings | coffee_opening | Local discovery content aligned with KC lifestyle audience; Visitor-friendly KC experience content |
| 7 | Origin Cội Nguồn opening | The Pitch KC Openings | coffee_opening | Local discovery content aligned with KC lifestyle audience; Visitor-friendly KC experience content |
| 8 | Flowstate Coffee opening | The Pitch KC Openings | coffee_opening | Local discovery content aligned with KC lifestyle audience; Visitor-friendly KC experience content |
| 9 | Third Street Social opening | The Pitch KC Openings | restaurant_opening | Local discovery content aligned with KC lifestyle audience; Visitor-friendly KC experience content |
| 10 | Whistle Stop Coffee opening | The Pitch KC Openings | coffee_opening | Local discovery content aligned with KC lifestyle audience; Visitor-friendly KC experience content |
| 11 | The Culinary Center of Kansas City opening | The Pitch KC Openings | restaurant_opening | Local discovery content aligned with KC lifestyle audience; Visitor-friendly KC experience content |
| 12 | Percheron opening | The Pitch KC Openings | coffee_opening | Local discovery content aligned with KC lifestyle audience; Visitor-friendly KC experience content |
| 13 | Bella Napoli opening | The Pitch KC Openings | restaurant_opening | Local discovery content aligned with KC lifestyle audience; Visitor-friendly KC experience content |
| 14 | KC Sipps: New waterfront eateries and the return of patio dining opening | The Pitch KC Openings | coffee_opening | Local discovery content aligned with KC lifestyle audience; Visitor-friendly KC experience content |
| 15 | Fluffy Fresh Donuts opening | The Pitch KC Openings | restaurant_opening | Local discovery content aligned with KC lifestyle audience; Visitor-friendly KC experience content |
| 16 | Ixtapa Fine Mexican Cuisine opening | The Pitch KC Openings | restaurant_opening | Local discovery content aligned with KC lifestyle audience |
| 17 | Toni’s Italian Restaurant opening | The Pitch KC Openings | restaurant_opening | Local discovery content aligned with KC lifestyle audience |
| 18 | AIDS WALK Open opening | The Pitch KC Openings | restaurant_opening | Local discovery content aligned with KC lifestyle audience |
| 19 | Muse opening | The Pitch KC Openings | coffee_opening | Local discovery content aligned with KC lifestyle audience |
| 20 | Dish & Drink KC: Strong starts in Midtown at Equal Minded and Dos Lokos | The Pitch KC Openings | coffee_opening | Local discovery content aligned with KC lifestyle audience |
| 21 | Drink This Now: Romero Paloma Phosphate at Elixir Soda Fountain | The Pitch KC Openings | coffee_opening | Local discovery content aligned with KC lifestyle audience; Visitor-friendly KC experience content |
| 22 | Bean Counter: Second Best Coffee serves grounds for inclusion | The Pitch KC Openings | coffee_opening | Local discovery content aligned with KC lifestyle audience |
| 23 | Overland Park non-profit ice cream parlor The Golden Scoop serves sweets and opportunities in equal measure | The Pitch KC Openings | coffee_opening | Local discovery content aligned with KC lifestyle audience |
| 24 | Do Good Co. — luxury consignment & designer resale | KC Consignment Shops | consignment_shop | Core Kellie luxury lifestyle pillar; Visitor-friendly KC experience content |
| 25 | The Curated Closet — boutique consignment & vintage | KC Consignment Shops | consignment_shop | Core Kellie luxury lifestyle pillar; Visitor-friendly KC experience content |

---

## 5. Top 25 Opportunities for World Cup Visitors

Hotels, rooftops, fine dining, tourism content, and visitor-friendly KC experiences ahead of 2026.

| Rank | Title | Source | Category | Why It Ranked Highly |
|---|---|---|---|---|
| 1 | 21c Museum Hotel — art-forward boutique packages & date-night stays | KC Hotel Packages | hotel_package | Hotel stay relevant for incoming 2026 World Cup visitors; Located in high-traffic visitor neighborhood |
| 2 | Hotel Kansas City — Curio Collection weekend packages & rooftop dining | KC Hotel Packages | hotel_package | Hotel stay relevant for incoming 2026 World Cup visitors; Skyline dining experience for out-of-town guests; Located in high-traffic visitor neighborhood |
| 3 | Crossroads Hotel — boutique packages with Percheron Rooftop | KC Hotel Packages | hotel_package | Hotel stay relevant for incoming 2026 World Cup visitors; Skyline dining experience for out-of-town guests; Located in high-traffic visitor neighborhood |
| 4 | The Raphael Hotel — Country Club Plaza luxury stay packages | KC Hotel Packages | hotel_package | Hotel stay relevant for incoming 2026 World Cup visitors; Located in high-traffic visitor neighborhood |
| 5 | Percheron Rooftop — Crossroads skyline cocktails & date nights | KC Rooftop Bars | rooftop_experience | Hotel stay relevant for incoming 2026 World Cup visitors; Skyline dining experience for out-of-town guests; Located in high-traffic visitor neighborhood |
| 6 | Nine Zero One — Loews rooftop lounge with downtown views | KC Rooftop Bars | rooftop_experience | Hotel stay relevant for incoming 2026 World Cup visitors; Skyline dining experience for out-of-town guests; Located in high-traffic visitor neighborhood |
| 7 | Mercury Room — rooftop dining & cocktails at Hotel Kansas City | KC Rooftop Bars | rooftop_experience | Hotel stay relevant for incoming 2026 World Cup visitors; Skyline dining experience for out-of-town guests; Located in high-traffic visitor neighborhood |
| 8 | 801 Rooftop — Power & Light District rooftop lounge | KC Rooftop Bars | rooftop_experience | Skyline dining experience for out-of-town guests; Located in high-traffic visitor neighborhood |
| 9 | Corvino — chef tasting menus & supper club date nights | Chef Tasting Menus | luxury_dining | Located in high-traffic visitor neighborhood |
| 10 | The Antler Room — seasonal chef tasting menus in Crossroads | Chef Tasting Menus | luxury_dining | Located in high-traffic visitor neighborhood |
| 11 | Bluestem — prix fixe tasting menus & wine pairings | Chef Tasting Menus | luxury_dining | Located in high-traffic visitor neighborhood |
| 12 | The Rieger — historic fine dining & chef tasting experiences | Chef Tasting Menus | luxury_dining | Located in high-traffic visitor neighborhood |
| 13 | The Savoy at 21c — chef-driven tasting menus & wine program | Chef Tasting Menus | luxury_dining | Hotel stay relevant for incoming 2026 World Cup visitors; Located in high-traffic visitor neighborhood |
| 14 | Lonely Planet: KC Among Best Weekend Getaways Across the USA | Visit KC Romantic Weekends | weekend_getaway | Visit KC tourism content designed for destination visitors |
| 15 | Loews Kansas City — luxury packages & Nine Zero One rooftop | KC Hotel Packages | hotel_package | Hotel stay relevant for incoming 2026 World Cup visitors; Skyline dining experience for out-of-town guests |
| 16 | Sheraton Crown Center — family & couples getaway packages | KC Hotel Packages | hotel_package | Hotel stay relevant for incoming 2026 World Cup visitors |
| 17 | Hey Hey Club — rooftop cocktails above J. Rieger distillery | KC Rooftop Bars | rooftop_experience | Skyline dining experience for out-of-town guests |
| 18 | Sky Cinema — rooftop movie nights & cocktails in Power & Light | KC Rooftop Bars | rooftop_experience | Skyline dining experience for out-of-town guests |
| 19 | Lazia — Italian fine dining & chef special menus | Chef Tasting Menus | luxury_dining | Tourism/visitor-oriented KC experience content |
| 20 | KC Sipps: Three local restaurants add new locations, a Pride Month pre-party, and a free three-day Italian festival | The Pitch KC Sipps | dining | Signature KC dining experience for tourists; Located in high-traffic visitor neighborhood |
| 21 | KC Sipps: New Mexican sushi, Japanese bartending, and an Argentinian brunch party highlight the culinary diversity of Ka | The Pitch KC Sipps | dining | Signature KC dining experience for tourists; Located in high-traffic visitor neighborhood |
| 22 | KC Sipps: Mother’s Day events in Crossroads, and proclaiming it a coconut summer | The Pitch KC Sipps | dining | Signature KC dining experience for tourists; Located in high-traffic visitor neighborhood |
| 23 | KC Sipps: Three openings and delicious festivals to plan your weekend around | The Pitch KC Sipps | dining | Signature KC dining experience for tourists; Located in high-traffic visitor neighborhood |
| 24 | KC Sipps: Free pizza for a year, prominent patios open, and two Blue Springs alerts | The Pitch KC Sipps | dining | Signature KC dining experience for tourists; Located in high-traffic visitor neighborhood |
| 25 | KC Sipps: Two openings, impressive milestones, and restaurants after hours | The Pitch KC Sipps | dining | Signature KC dining experience for tourists; Located in high-traffic visitor neighborhood |

---

## Appendix: Ranking Score Factors

| Ranking | Primary Factors |
|---|---|
| Post This Week | Timeliness + audience alignment + engagement + sponsor value − off-brand discussion |
| Sponsors | Premium category + named business + revenue flags − free/discussion |
| Engagement | Openings/closings/estate sales/free/sports + Reddit controversy/discussion |
| Audience Alignment | Luxury/dining/estate/openings/date night − tragedy/politics Reddit |
| World Cup Visitors | Tourism/hospitality/dining in visitor neighborhoods + Visit KC/hotel/rooftop sources |

---

*Generated from live database export. Re-run after next scan to refresh rankings.*