/**
 * The verified hospitality source registry seed.
 *
 * Every entry here was fetched and read by hand before being written down. Nothing is
 * aspirational and nothing is inferred from a sibling source: the Visit KC crawl delay,
 * the Kansas Tourism 60-day lead time and the Visit KC 14-day minimum notice are all
 * quoted from those specific pages, not generalized across the set.
 *
 * A source in this list is NOT healthy. `health_state` starts at `unchecked` and only a
 * successful check moves it, which is the whole point — the previous registry was a JSON
 * blob where existing and working were the same thing.
 */

export type SourceSeed = {
  url: string;
  name: string;
  sourceType: string;
  portfolioRelationship:
    | 'first_party_property'
    | 'brand_portfolio'
    | 'management_company'
    | 'dmo'
    | 'state_tourism'
    | 'trade_association'
    | 'event_program';
  representsBusiness: string | null;
  extractionTarget: string;
  authorityLevel: 'official_first_party' | 'official_affiliated' | 'third_party';
  leadOrPitch: 'research_lead' | 'supports_pitch';
  geographicRelevance:
    | 'kc_metro'
    | 'kansas_side'
    | 'missouri_side'
    | 'national_with_kc_property'
    | 'national_no_kc_property';
  checkFrequency: 'weekly' | 'monthly' | 'quarterly' | 'seasonal_escalating';
  freshnessPolicy: string;
  /** False where silence is the documented normal state for this source. */
  alertOnSilence: boolean;
  requiresPlaywright: boolean;
  robotsStatus: 'allowed' | 'disallowed' | 'unverified';
  robotsNote: string | null;
  crawlDelaySeconds: number | null;
  leadTimeDays: number | null;
  tier: 1 | 2 | 3;
  enabled: boolean;
  /** Plain-English explanation shown when this source is in a non-healthy state. */
  notes: string;
};

/** Visit KC publishes `Crawl-delay: 5`. It applies to this domain only. */
const VISIT_KC_CRAWL_DELAY = 5;

export const SOURCE_SEEDS: SourceSeed[] = [
  // ---------------------------------------------------------------- Tier 1
  {
    url: 'https://www.loewshotels.com/influencer-stay-request',
    name: 'Loews — Influencer Stay Request',
    sourceType: 'official_influencer_program',
    portfolioRelationship: 'brand_portfolio',
    representsBusiness: 'Loews Hotels',
    extractionTarget:
      'The required fields and the published response commitment. Loews asks for last-90-days follower counts AND engagement per platform, audience age breakdown, top three audience geographies, a media kit, and three date options, and commits in writing to replying within five business days.',
    authorityLevel: 'official_first_party',
    leadOrPitch: 'supports_pitch',
    geographicRelevance: 'national_with_kc_property',
    checkFrequency: 'quarterly',
    freshnessPolicy:
      'Form fields and the reply commitment change rarely. Re-read quarterly to catch a changed requirement before a pitch is built on a stale one.',
    alertOnSilence: false,
    requiresPlaywright: false,
    robotsStatus: 'unverified',
    robotsNote: null,
    crawlDelaySeconds: null,
    leadTimeDays: null,
    tier: 1,
    enabled: true,
    notes:
      'Loews Kansas City is in the property dropdown, so this is a real route for Kellie rather than a national dead end. Benson prepares the answers; a human submits the form. The UGC rights flow grants Loews a perpetual, worldwide, royalty-free license with no obligation to use the content — surface that as a term to weigh, not as a disqualification.',
  },
  {
    url: 'https://crossroadshotelkc.com/events/',
    name: 'Crossroads Hotel — Events',
    sourceType: 'official_events_page',
    portfolioRelationship: 'first_party_property',
    representsBusiness: 'Crossroads Hotel',
    extractionTarget:
      'Event name, date, time, recurrence and location within the property. This is the densest feed of genuinely fresh pitchable moments in the metro — a specific dated event is the "why now" a pitch needs.',
    authorityLevel: 'official_first_party',
    leadOrPitch: 'supports_pitch',
    geographicRelevance: 'kc_metro',
    checkFrequency: 'weekly',
    freshnessPolicy:
      'Events turn over weekly. An event that has already happened must never appear as a reason to reach out.',
    alertOnSilence: true,
    requiresPlaywright: false,
    robotsStatus: 'unverified',
    robotsNote: null,
    crawlDelaySeconds: null,
    leadTimeDays: null,
    tier: 1,
    enabled: true,
    notes:
      'Server-rendered. If the extracted event count drops to zero, treat it as a structural break in the page rather than as a hotel with no events.',
  },
  {
    url: 'https://www.visitkc.com/media-center/contact-us/',
    name: 'Visit KC — Media Team Contacts',
    sourceType: 'official_media_request_form',
    portfolioRelationship: 'dmo',
    representsBusiness: 'Visit KC',
    extractionTarget:
      'Named contacts with their beat assignments. Makenzie Wolters covers "Local, Regional", which is Kellie\u2019s correct beat. The newsroom separately publishes social.media@visitkc.com for content-creator inquiries specifically, as distinct from journalist inquiries.',
    authorityLevel: 'official_affiliated',
    leadOrPitch: 'supports_pitch',
    geographicRelevance: 'kc_metro',
    checkFrequency: 'quarterly',
    freshnessPolicy:
      'Staff pages change on hiring cycles. If a pitch bounces, re-check this page before concluding the outreach failed.',
    alertOnSilence: false,
    requiresPlaywright: false,
    robotsStatus: 'allowed',
    robotsNote: 'robots.txt allows all crawlers, disallows only /wp-admin/, and sets Crawl-delay: 5.',
    crawlDelaySeconds: VISIT_KC_CRAWL_DELAY,
    leadTimeDays: 14,
    tier: 1,
    enabled: true,
    notes:
      'Visit KC\u2019s published media FAQ sets a minimum 14 days notice, deprioritizes creators without a confirmed assignment, and asks for analytics. Any Visit KC-routed pitch must satisfy the 14-day rule before Benson calls it real. Benson must never auto-submit the form.',
  },
  {
    url: 'https://www.travelks.com/media/media-visits/',
    name: 'Kansas Tourism — Media Visits',
    sourceType: 'official_media_request_form',
    portfolioRelationship: 'state_tourism',
    representsBusiness: 'Kansas Tourism',
    extractionTarget:
      'The stated assistance policy and its lead time. Kansas Tourism states in writing that it will help secure complimentary or reduced-rate lodging and meals, which makes this the only source in the set that documents compensation up front.',
    authorityLevel: 'official_first_party',
    leadOrPitch: 'supports_pitch',
    geographicRelevance: 'kansas_side',
    checkFrequency: 'quarterly',
    freshnessPolicy: 'Policy pages are the slowest-changing content on any site.',
    alertOnSilence: false,
    requiresPlaywright: false,
    robotsStatus: 'unverified',
    robotsNote: null,
    crawlDelaySeconds: null,
    leadTimeDays: 60,
    tier: 1,
    enabled: true,
    notes:
      'Covers the Kansas side of the metro only — Overland Park and Kansas City, Kansas, not Kansas City, Missouri. The 60-day lead time is this source\u2019s own and must not be generalized to other sources.',
  },
  {
    url: 'https://crossroadshotelkc.com/contact-2/',
    name: 'Crossroads Hotel — Contact',
    sourceType: 'official_property_site',
    portfolioRelationship: 'first_party_property',
    representsBusiness: 'Crossroads Hotel',
    extractionTarget:
      'The published media inbox. media@crossroadshotelkc.com is a real dedicated media address on the property\u2019s own site, which makes it the strongest verified hospitality contact in the metro for Kellie.',
    authorityLevel: 'official_first_party',
    leadOrPitch: 'supports_pitch',
    geographicRelevance: 'kc_metro',
    checkFrequency: 'quarterly',
    freshnessPolicy: 'Re-verify the address quarterly so a pitch is never built on a dead inbox.',
    alertOnSilence: false,
    requiresPlaywright: false,
    robotsStatus: 'unverified',
    robotsNote: null,
    crawlDelaySeconds: null,
    leadTimeDays: null,
    tier: 1,
    enabled: true,
    notes:
      'A dedicated media@ inbox on the property\u2019s own domain is a verified role inbox, not a guess and not a front desk.',
  },
  {
    url: 'https://www.loewshotels.com/press/contact-us',
    name: 'Loews — Press Contacts',
    sourceType: 'official_press_news',
    portfolioRelationship: 'brand_portfolio',
    representsBusiness: 'Loews Hotels',
    extractionTarget:
      'The named PR lead assigned to Kansas City, with their title and address. A brand-level PR contact is only usable for the specific properties their listed scope covers.',
    authorityLevel: 'official_first_party',
    leadOrPitch: 'supports_pitch',
    geographicRelevance: 'national_with_kc_property',
    checkFrequency: 'quarterly',
    freshnessPolicy: 'PR assignments move with staffing. Re-check quarterly.',
    alertOnSilence: false,
    requiresPlaywright: false,
    robotsStatus: 'unverified',
    robotsNote: null,
    crawlDelaySeconds: null,
    leadTimeDays: null,
    tier: 1,
    enabled: true,
    notes:
      'This contact is scoped to Kansas City by Loews\u2019 own page, so it may be used for Loews Kansas City. It must never be attached to a non-Loews property.',
  },

  // ---------------------------------------------------------------- Tier 2
  {
    url: 'https://www.visitkc.com/articles/kc-hotel-updates-and-renovations',
    name: 'Visit KC — Hotel Openings & Updates',
    sourceType: 'tourism_board_media',
    portfolioRelationship: 'dmo',
    representsBusiness: null,
    extractionTarget:
      'Property name, anticipated opening month, neighborhood, room count and named onsite restaurant or bar, from the "Opening Soon", "New and Recent Openings" and "In Development" sections. A property moving between those sections is the lead — a pre-opening hotel has a launch to fill and no coverage yet, which is the most receptive window there is.',
    authorityLevel: 'official_affiliated',
    leadOrPitch: 'research_lead',
    geographicRelevance: 'kc_metro',
    checkFrequency: 'monthly',
    freshnessPolicy:
      'Opening dates are forward-looking and slip. Treat every date as anticipated, never as confirmed.',
    alertOnSilence: false,
    requiresPlaywright: false,
    robotsStatus: 'allowed',
    robotsNote: 'Crawl-delay: 5 published for this domain.',
    crawlDelaySeconds: VISIT_KC_CRAWL_DELAY,
    leadTimeDays: null,
    tier: 2,
    enabled: true,
    notes:
      'If the extracted property count falls below about five, that is a structural break: Visit KC moved or renamed the article and the page Benson is watching no longer lives at that address. It is not "no new hotels in Kansas City".',
  },
  {
    url: 'https://crossroadshotelkc.com/offers/',
    name: 'Crossroads Hotel — Offers',
    sourceType: 'official_offers_page',
    portfolioRelationship: 'first_party_property',
    representsBusiness: 'Crossroads Hotel',
    extractionTarget:
      'Package name, what is included, stated rate or discount, and validity window. Read carefully: a package is what the hotel sells to the public, not what it has offered Kellie.',
    authorityLevel: 'official_first_party',
    leadOrPitch: 'supports_pitch',
    geographicRelevance: 'kc_metro',
    checkFrequency: 'monthly',
    freshnessPolicy: 'An expired package must never appear as a current reason to reach out.',
    alertOnSilence: false,
    requiresPlaywright: false,
    robotsStatus: 'unverified',
    robotsNote: null,
    crawlDelaySeconds: null,
    leadTimeDays: null,
    tier: 2,
    enabled: true,
    notes:
      'Rate-plan names like "Advance Purchase Offer" or "A Suite Deal" are products, not businesses and not opportunities. They must never become a pitch target.',
  },
  {
    url: 'https://raphaelkc.com/event-calendar/',
    name: 'Raphael Hotel — Event Calendar',
    sourceType: 'official_events_page',
    portfolioRelationship: 'first_party_property',
    representsBusiness: 'The Raphael Hotel',
    extractionTarget: 'Event name, date and location within the property.',
    authorityLevel: 'official_first_party',
    leadOrPitch: 'supports_pitch',
    geographicRelevance: 'kc_metro',
    checkFrequency: 'weekly',
    freshnessPolicy: 'Weekly turnover. Past events are not reasons to reach out.',
    alertOnSilence: false,
    requiresPlaywright: false,
    robotsStatus: 'unverified',
    robotsNote: null,
    crawlDelaySeconds: null,
    leadTimeDays: null,
    tier: 2,
    enabled: true,
    notes: 'A Historic Hotels of America property on the Country Club Plaza. Server-rendered.',
  },
  {
    url: 'https://www.loewshotels.com/kansas-city-hotel/offers',
    name: 'Loews Kansas City — Offers',
    sourceType: 'official_offers_page',
    portfolioRelationship: 'first_party_property',
    representsBusiness: 'Loews Kansas City Hotel',
    extractionTarget:
      'Package name, inclusions and validity window for the Kansas City property specifically.',
    authorityLevel: 'official_first_party',
    leadOrPitch: 'supports_pitch',
    geographicRelevance: 'kc_metro',
    checkFrequency: 'monthly',
    freshnessPolicy: 'Expired packages must not surface as current.',
    alertOnSilence: false,
    requiresPlaywright: false,
    robotsStatus: 'unverified',
    robotsNote: null,
    crawlDelaySeconds: null,
    leadTimeDays: null,
    tier: 2,
    enabled: true,
    notes: 'Property-specific, so offers here genuinely apply to the Kansas City hotel.',
  },
  {
    url: 'https://www.originhotel.com/hotels/kansas-city/hotel-deals-kansas-city',
    name: 'Origin Hotel KC — Deals',
    sourceType: 'official_offers_page',
    portfolioRelationship: 'first_party_property',
    representsBusiness: 'Origin Hotel Kansas City',
    extractionTarget: 'Package name, inclusions and rate, including the embedded JSON-LD.',
    authorityLevel: 'official_first_party',
    leadOrPitch: 'supports_pitch',
    geographicRelevance: 'kc_metro',
    checkFrequency: 'monthly',
    freshnessPolicy: 'Expired packages must not surface as current.',
    alertOnSilence: false,
    requiresPlaywright: false,
    robotsStatus: 'unverified',
    robotsNote: null,
    crawlDelaySeconds: null,
    leadTimeDays: null,
    tier: 2,
    enabled: true,
    notes:
      'Origin Hotel Kansas City publishes no findable media or partnerships contact anywhere. It stays monitor-only: Benson may build an evidenced opportunity from this page, but it can never become send-ready, because inventing a contact for it is exactly the failure this system is being repaired to stop.',
  },
  {
    url: 'https://stories.hilton.com/influencer-inquiries',
    name: 'Hilton — Influencer/Blogger Request',
    sourceType: 'official_influencer_program',
    portfolioRelationship: 'brand_portfolio',
    representsBusiness: 'Hilton',
    extractionTarget:
      'The routing behaviour, not a decision. Hilton states the request "will be shared directly with the hotel", so this form is a router: it forwards to a property that then decides.',
    authorityLevel: 'official_first_party',
    leadOrPitch: 'supports_pitch',
    geographicRelevance: 'national_with_kc_property',
    checkFrequency: 'quarterly',
    freshnessPolicy: 'Re-read quarterly.',
    alertOnSilence: false,
    requiresPlaywright: true,
    robotsStatus: 'unverified',
    robotsNote: null,
    crawlDelaySeconds: null,
    leadTimeDays: null,
    tier: 2,
    enabled: true,
    notes:
      'Model this as a router, never as a decision-maker: submitting it is not the same as reaching a property. Hilton publishes no partnership email, and breakingnews@hilton.com is a crisis-communications inbox that is permanently blocklisted from outreach. Static shell with a JS form, so reading the fields needs a browser.',
  },
  {
    url: 'https://www.kcrestaurantweek.com/restaurants',
    name: 'KC Restaurant Week — Participants',
    sourceType: 'restaurant_week_participants',
    portfolioRelationship: 'event_program',
    representsBusiness: null,
    extractionTarget: 'Participating restaurant names and neighborhoods for the current event year.',
    authorityLevel: 'official_affiliated',
    leadOrPitch: 'research_lead',
    geographicRelevance: 'kc_metro',
    checkFrequency: 'seasonal_escalating',
    freshnessPolicy:
      'The participant list is legitimately empty between event years and repopulates ahead of the January event. Escalate toward daily as the event approaches; stay monthly the rest of the year.',
    alertOnSilence: false,
    requiresPlaywright: false,
    robotsStatus: 'unverified',
    robotsNote: null,
    crawlDelaySeconds: null,
    leadTimeDays: null,
    tier: 2,
    enabled: true,
    notes:
      'An empty participant list is `dormant`, not a scraper failure. The page loads correctly and truthfully has no participants right now. Reporting this as broken would send an operator chasing a bug that does not exist.',
  },
  {
    url: 'https://web.kansascitylodging.org/search',
    name: 'HLAKC — Member Directory',
    sourceType: 'lodging_association',
    portfolioRelationship: 'trade_association',
    representsBusiness: null,
    extractionTarget:
      'Member hotel names and cities — a roster of properties that have paid to be part of the local lodging association, which is a useful signal of an engaged operator.',
    authorityLevel: 'official_affiliated',
    leadOrPitch: 'research_lead',
    geographicRelevance: 'kc_metro',
    checkFrequency: 'quarterly',
    freshnessPolicy: 'Membership changes annually at most.',
    alertOnSilence: false,
    requiresPlaywright: true,
    robotsStatus: 'unverified',
    robotsNote: null,
    crawlDelaySeconds: null,
    leadTimeDays: null,
    tier: 2,
    enabled: true,
    notes:
      'Returns zero records on a plain fetch because the directory renders client-side. It needs a browser, and a zero-record plain fetch must be reported as `needs_browser`, not as an empty directory.',
  },
  {
    url: 'https://news.visitkc.com/',
    name: 'Visit KC — Newsroom',
    sourceType: 'official_press_news',
    portfolioRelationship: 'dmo',
    representsBusiness: 'Visit KC',
    extractionTarget:
      'Release headline, date, category and the media-contact block appended to every release.',
    authorityLevel: 'official_affiliated',
    leadOrPitch: 'research_lead',
    geographicRelevance: 'kc_metro',
    checkFrequency: 'monthly',
    freshnessPolicy:
      'Nothing newer than 2026-02-18 was visible when this was verified. Quiet is the normal state here.',
    alertOnSilence: false,
    requiresPlaywright: false,
    robotsStatus: 'unverified',
    robotsNote:
      'Separate subdomain from www.visitkc.com; its own robots.txt has not been verified, so the conservative 5-second delay applies until it is.',
    crawlDelaySeconds: VISIT_KC_CRAWL_DELAY,
    leadTimeDays: null,
    tier: 2,
    enabled: true,
    notes:
      'Never alert on silence here, and never conclude from a quiet newsroom that Kansas City hospitality has gone quiet. Visit KC simply does not post often.',
  },

  // ------------------------------------------------- Recorded but disabled
  {
    url: 'https://www.kansascitylodging.org/news.html',
    name: 'HLAKC — News (robots-disallowed)',
    sourceType: 'lodging_association',
    portfolioRelationship: 'trade_association',
    representsBusiness: null,
    extractionTarget: 'Nothing. This path is disallowed and must not be fetched.',
    authorityLevel: 'official_affiliated',
    leadOrPitch: 'research_lead',
    geographicRelevance: 'kc_metro',
    checkFrequency: 'quarterly',
    freshnessPolicy: 'Not applicable — never fetched.',
    alertOnSilence: false,
    requiresPlaywright: false,
    robotsStatus: 'disallowed',
    robotsNote: 'kansascitylodging.org/robots.txt contains `Disallow: /news.html`.',
    crawlDelaySeconds: null,
    leadTimeDays: null,
    tier: 3,
    enabled: false,
    notes:
      'Recorded deliberately so nobody re-adds it later thinking it was an oversight. The site owner asked crawlers not to read this page and Benson respects that. This is a legitimate honest state, not a failure.',
  },
  {
    url: 'https://press.fourseasons.com/content/fourseasons_pressroom/en/forms/influencer.html',
    name: 'Four Seasons — Influencer Form (no KC property)',
    sourceType: 'official_influencer_program',
    portfolioRelationship: 'brand_portfolio',
    representsBusiness: 'Four Seasons',
    extractionTarget: 'Nothing. Excluded.',
    authorityLevel: 'official_first_party',
    leadOrPitch: 'research_lead',
    geographicRelevance: 'national_no_kc_property',
    checkFrequency: 'quarterly',
    freshnessPolicy: 'Not applicable — excluded.',
    alertOnSilence: false,
    requiresPlaywright: true,
    robotsStatus: 'unverified',
    robotsNote: null,
    crawlDelaySeconds: null,
    leadTimeDays: null,
    tier: 3,
    enabled: false,
    notes:
      'Four Seasons has no property in the Kansas City metro and the form requires naming a specific property. Benson must never present this as a Kansas City option. Recorded as explicitly excluded so it cannot be rediscovered and re-seeded as an opportunity.',
  },
];

/** The Tier 1 seed set — the sources a first run must cover. */
export const TIER_1_SOURCE_URLS = SOURCE_SEEDS.filter((s) => s.tier === 1).map((s) => s.url);
