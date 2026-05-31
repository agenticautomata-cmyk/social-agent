// Seed a demo campaign so the dashboard has something to render on first boot.
// Idempotent — safe to run multiple times.

import { eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  campaigns,
  campaignIndustries,
  industries,
  publishingTargets,
  personas,
  sources,
} from '../schema.js';

async function main() {
  console.log('seeding demo campaign...');

  const existing = await db.query.campaigns.findFirst({
    where: eq(campaigns.name, 'Demo Brand'),
  });

  let campaignId: string;
  if (existing) {
    console.log(`  campaign already exists: ${existing.id}`);
    campaignId = existing.id;
  } else {
    const [created] = await db
      .insert(campaigns)
      .values({
        name: 'Demo Brand',
        description:
          'Portfolio demo: a fictional growth-marketing brand serving local businesses across multiple verticals.',
        active: true,
        autonomyMode: 'hitl',
        weeklyTestimonials: 10,
        weeklyCaseStudies: 5,
        weeklyExplainers: 8,
        weeklyEducational: 5,
        weeklyFounderMessages: 2,
        weeklyIndustryInsights: 3,
        languages: ['en'],
        postingSchedule: '0 9,17 * * *',
        postingTimezone: 'Europe/Berlin',
        brandVoice: 'Direct, useful, no fluff. Sounds like a smart friend who runs the numbers.',
        brandDefaultCta: 'Book a 15-min audit at demobrand.example.com',
        brandPrimaryColor: '#0ea5e9',
        founderHeygenAvatarId: 'demo_founder_avatar',
        founderHeygenVoiceId: 'demo_founder_voice',
      })
      .returning({ id: campaigns.id });
    campaignId = created!.id;
    console.log(`  campaign created: ${campaignId}`);
  }

  // Wire all 7 industries with weight=1 (planner rotates evenly)
  const allIndustries = await db.select({ id: industries.id, slug: industries.slug }).from(industries);
  for (const ind of allIndustries) {
    await db
      .insert(campaignIndustries)
      .values({ campaignId, industryId: ind.id, weight: 1 })
      .onConflictDoNothing();
  }
  console.log(`  wired ${allIndustries.length} industries`);

  // Publishing targets — IG and TikTok mocks
  await db
    .insert(publishingTargets)
    .values([
      {
        campaignId,
        platform: 'instagram',
        accountHandle: '@demobrand',
        accountId: 'demo_ig_account',
        active: true,
      },
      {
        campaignId,
        platform: 'tiktok',
        accountHandle: '@demobrand',
        accountId: 'demo_tt_account',
        active: true,
      },
    ])
    .onConflictDoNothing();
  console.log('  wired publishing targets (instagram, tiktok)');

  // A handful of seed personas — one per industry the planner can pick from
  const personaSeeds = [
    { slug: 'dentists', name: 'Dr. Maya Hartwell', role: 'practice owner', age: '38-45' },
    { slug: 'coffee_shops', name: 'Tomás Ruiz', role: 'shop owner', age: '28-35' },
    { slug: 'insurance_agencies', name: 'Linda Chen', role: 'independent agent', age: '45-55' },
    { slug: 'restaurants', name: 'Sara Okonkwo', role: 'bistro owner', age: '32-40' },
    { slug: 'real_estate', name: 'Marcus Vance', role: 'broker', age: '40-50' },
    { slug: 'fitness_studios', name: 'Amara Patel', role: 'studio owner', age: '30-38' },
    { slug: 'marketing_agencies', name: 'Jordan Reyes', role: 'agency founder', age: '35-42' },
  ];

  for (const ps of personaSeeds) {
    const ind = allIndustries.find((i) => i.slug === ps.slug);
    if (!ind) continue;
    const exists = await db.query.personas.findFirst({
      where: (p) => sql`${p.campaignId} = ${campaignId} AND ${p.name} = ${ps.name}`,
    });
    if (exists) continue;
    await db.insert(personas).values({
      campaignId,
      industryId: ind.id,
      name: ps.name,
      role: ps.role,
      ageRange: ps.age,
      background: `${ps.role} in the ${ind.slug.replace(/_/g, ' ')} space`,
      voiceTraits: 'warm, articulate, slightly amused',
      portraitPrompt: `professional headshot of a ${ps.role}, neutral studio lighting, friendly expression`,
      heygenAvatarId: `demo_avatar_${ps.slug}`,
      heygenVoiceId: `demo_voice_${ps.slug}`,
    });
  }
  console.log(`  wired ${personaSeeds.length} personas`);

  const redditExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'r/kansascity'`,
  });
  if (!redditExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'reddit',
      name: 'r/kansascity',
      config: {
        subreddit: 'kansascity',
        sort: 'hot',
        limit: 50,
        format: 'rss',
      },
      active: true,
      pollIntervalCron: '0 */6 * * *',
    });
    console.log('  wired r/kansascity Reddit RSS source');
  } else {
    await db
      .update(sources)
      .set({
        config: {
          subreddit: 'kansascity',
          sort: 'hot',
          limit: 50,
          format: 'rss',
        },
        updatedAt: new Date(),
      })
      .where(eq(sources.id, redditExists.id));
    console.log('  r/kansascity source already exists — config updated to RSS');
  }

  const visitKcExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'Visit KC RSS'`,
  });
  if (!visitKcExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'visitkc',
      name: 'Visit KC RSS',
      config: {
        feedUrl: 'https://news.visitkc.com/rss.xml',
        limit: 50,
      },
      active: true,
      pollIntervalCron: '0 */6 * * *',
    });
    console.log('  wired Visit KC RSS source');
  } else {
    console.log('  Visit KC RSS source already exists');
  }

  const crossroadsExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'Crossroads RSS'`,
  });
  if (!crossroadsExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'crossroads',
      name: 'Crossroads RSS',
      config: {
        feedUrl: 'https://kccrossroads.org/feed/',
        limit: 50,
      },
      active: true,
      pollIntervalCron: '0 */6 * * *',
    });
    console.log('  wired Crossroads RSS source');
  } else {
    console.log('  Crossroads RSS source already exists');
  }

  const unionStationExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'Union Station Events'`,
  });
  if (!unionStationExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'union_station',
      name: 'Union Station Events',
      config: {
        apiUrl: 'https://unionstation.org/wp-json/us/v1/nav-events',
        horizonDays: 14,
        limit: 50,
      },
      active: true,
      pollIntervalCron: '0 */6 * * *',
    });
    console.log('  wired Union Station Events source');
  } else {
    console.log('  Union Station Events source already exists');
  }

  const kauffmanExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'Kauffman Center Events'`,
  });
  if (!kauffmanExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'kauffman',
      name: 'Kauffman Center Events',
      config: {
        apiUrl: 'https://tickets.kauffmancenter.org/api/products/productionseasons',
        horizonDays: 90,
        limit: 50,
      },
      active: true,
      pollIntervalCron: '0 */6 * * *',
    });
    console.log('  wired Kauffman Center Events source');
  } else {
    console.log('  Kauffman Center Events source already exists');
  }

  const sportingKcExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'Sporting KC Schedule'`,
  });
  if (!sportingKcExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'sporting_kc',
      name: 'Sporting KC Schedule',
      config: {
        apiUrl: 'https://dapi.sportingkc.com/v2/content/en-us/matches',
        clubOptaId: 421,
        horizonDays: 180,
        limit: 50,
        maxPages: 10,
      },
      active: true,
      pollIntervalCron: '0 */6 * * *',
    });
    console.log('  wired Sporting KC Schedule source');
  } else {
    console.log('  Sporting KC Schedule source already exists');
  }

  const restaurantWeekExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'KC Restaurant Week'`,
  });
  if (!restaurantWeekExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'restaurant_week',
      name: 'KC Restaurant Week',
      config: {
        feedUrl: 'https://www.kcrestaurantweek.com/rss.xml',
        limit: 50,
        seasonStart: '2026-01-09',
        seasonEnd: '2026-01-18',
      },
      active: true,
      pollIntervalCron: '0 */6 * * *',
    });
    console.log('  wired KC Restaurant Week source');
  } else {
    console.log('  KC Restaurant Week source already exists');
  }

  const pitchDiningExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'The Pitch KC Sipps'`,
  });
  if (!pitchDiningExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'pitch_dining',
      name: 'The Pitch KC Sipps',
      config: {
        feedUrl: 'https://www.thepitchkc.com/tag/kc-sipps/feed/',
        limit: 30,
      },
      active: true,
      pollIntervalCron: '0 */6 * * *',
    });
    console.log('  wired The Pitch KC Sipps source');
  } else {
    console.log('  The Pitch KC Sipps source already exists');
  }

  const kcParksExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'KC Parks Events'`,
  });
  if (!kcParksExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'kc_parks',
      name: 'KC Parks Events',
      config: {
        apiUrl: 'https://kcparks.org/wp-json/tribe/events/v1/events',
        horizonDays: 90,
        limit: 50,
        maxPages: 5,
      },
      active: true,
      pollIntervalCron: '0 */6 * * *',
    });
    console.log('  wired KC Parks Events source');
  } else {
    console.log('  KC Parks Events source already exists');
  }

  const kcLibraryExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'KC Library Events'`,
  });
  if (!kcLibraryExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'kc_library',
      name: 'KC Library Events',
      config: {
        calendarUrl: 'https://kclibrary.org/calendar',
        limit: 30,
        maxPages: 3,
      },
      active: true,
      pollIntervalCron: '0 */6 * * *',
    });
    console.log('  wired KC Library Events source');
  } else {
    console.log('  KC Library Events source already exists');
  }

  const firstFridaysExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'Crossroads First Fridays'`,
  });
  if (!firstFridaysExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'first_fridays',
      name: 'Crossroads First Fridays',
      config: {
        horizonDays: 120,
        seasonStartMonth: 4,
        seasonEndMonth: 10,
        eventUrl: 'https://kccrossroads.org/first-fridays/',
      },
      active: true,
      pollIntervalCron: '0 */6 * * *',
    });
    console.log('  wired Crossroads First Fridays source');
  } else {
    console.log('  Crossroads First Fridays source already exists');
  }

  const estateSalesNetExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'EstateSales.net Kansas City'`,
  });
  if (!estateSalesNetExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'estate_sales_net',
      name: 'EstateSales.net Kansas City',
      config: {
        horizonDays: 60,
        zipPageUrls: [
          'https://www.estatesales.net/MO/Kansas-City/64108',
          'https://www.estatesales.net/MO/Kansas-City/64111',
          'https://www.estatesales.net/MO/Kansas-City/64112',
          'https://www.estatesales.net/MO/Kansas-City/64114',
          'https://www.estatesales.net/MO/Kansas-City/64106',
          'https://www.estatesales.net/KS/Overland-Park/66204',
          'https://www.estatesales.net/KS/Overland-Park/66221',
          'https://www.estatesales.net/KS/Leawood/66209',
          'https://www.estatesales.net/MO/Lees-Summit/64086',
          'https://www.estatesales.net/MO/Independence/64055',
        ],
        requestDelayMs: 250,
      },
      active: true,
      pollIntervalCron: '0 */6 * * *',
    });
    console.log('  wired EstateSales.net Kansas City source');
  } else {
    console.log('  EstateSales.net Kansas City source already exists');
  }

  const estateSalesOrgExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'EstateSales.org Kansas City'`,
  });
  if (!estateSalesOrgExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'estate_sales_org',
      name: 'EstateSales.org Kansas City',
      config: {
        listingUrl: 'https://estatesales.org/estate-sales/mo/kansas-city',
        horizonDays: 60,
        maxDetailFetches: 40,
        requestDelayMs: 300,
      },
      active: true,
      pollIntervalCron: '0 */6 * * *',
    });
    console.log('  wired EstateSales.org Kansas City source');
  } else {
    console.log('  EstateSales.org Kansas City source already exists');
  }

  const brownButtonExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'Brown Button Estate Sales'`,
  });
  if (!brownButtonExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'brown_button_estates',
      name: 'Brown Button Estate Sales',
      config: {
        upcomingUrl: 'https://brownbutton.com/upcoming-estate-sales/',
        horizonDays: 60,
        requestDelayMs: 200,
      },
      active: true,
      pollIntervalCron: '0 */6 * * *',
    });
    console.log('  wired Brown Button Estate Sales source');
  } else {
    console.log('  Brown Button Estate Sales source already exists');
  }

  const pitchOpeningsExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'The Pitch KC Openings'`,
  });
  if (!pitchOpeningsExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'pitch_openings',
      name: 'The Pitch KC Openings',
      config: {
        feedUrls: [
          'https://www.thepitchkc.com/tag/kc-sipps/feed/',
          'https://www.thepitchkc.com/category/dining/feed/',
          'https://www.thepitchkc.com/tag/new-restaurants/feed/',
          'https://www.thepitchkc.com/tag/new-business/feed/',
          'https://www.thepitchkc.com/tag/business/feed/',
        ],
        categoryFeedUrls: {
          coffee_opening: 'https://www.thepitchkc.com/tag/coffee/feed/',
          boutique_opening: 'https://www.thepitchkc.com/tag/boutique/feed/',
          entertainment_opening: 'https://www.thepitchkc.com/tag/entertainment/feed/',
          restaurant_opening: 'https://www.thepitchkc.com/tag/restaurant/feed/',
        },
        limit: 40,
        maxAgeDays: 730,
      },
      active: true,
      pollIntervalCron: '0 */6 * * *',
    });
    console.log('  wired The Pitch KC Openings source');
  } else {
    console.log('  The Pitch KC Openings source already exists');
  }

  const inkcOpeningsExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'In Kansas City Openings'`,
  });
  if (!inkcOpeningsExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'inkc_openings',
      name: 'In Kansas City Openings',
      config: {
        feedUrl: 'https://www.inkansascity.com/feed/',
        limit: 50,
        maxAgeDays: 365,
      },
      active: true,
      pollIntervalCron: '0 */6 * * *',
    });
    console.log('  wired In Kansas City Openings source');
  } else {
    console.log('  In Kansas City Openings source already exists');
  }

  const visitKcOpeningsExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'Visit KC Openings'`,
  });
  if (!visitKcOpeningsExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'visitkc_openings',
      name: 'Visit KC Openings',
      config: {
        feedUrl: 'https://news.visitkc.com/rss.xml',
        limit: 50,
        maxAgeDays: 730,
      },
      active: true,
      pollIntervalCron: '0 */6 * * *',
    });
    console.log('  wired Visit KC Openings source');
  } else {
    console.log('  Visit KC Openings source already exists');
  }

  const pitchClosingsExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'The Pitch KC Closings'`,
  });
  if (!pitchClosingsExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'pitch_closings',
      name: 'The Pitch KC Closings',
      config: {
        feedUrls: [
          'https://www.thepitchkc.com/tag/kc-sipps/feed/',
          'https://www.thepitchkc.com/tag/closing/feed/',
          'https://www.thepitchkc.com/tag/closings/feed/',
          'https://www.thepitchkc.com/tag/restaurant-closings/feed/',
          'https://www.thepitchkc.com/category/dining/feed/',
        ],
        limit: 40,
        maxAgeDays: 730,
      },
      active: true,
      pollIntervalCron: '0 */6 * * *',
    });
    console.log('  wired The Pitch KC Closings source');
  } else {
    console.log('  The Pitch KC Closings source already exists');
  }

  const inkcClosingsExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'In Kansas City Closings'`,
  });
  if (!inkcClosingsExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'inkc_closings',
      name: 'In Kansas City Closings',
      config: {
        feedUrl: 'https://www.inkansascity.com/feed/',
        limit: 50,
        maxAgeDays: 365,
      },
      active: true,
      pollIntervalCron: '0 */6 * * *',
    });
    console.log('  wired In Kansas City Closings source');
  } else {
    console.log('  In Kansas City Closings source already exists');
  }

  const liquidationExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'Liquidation Sales KC'`,
  });
  if (!liquidationExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'liquidation_sales_net',
      name: 'Liquidation Sales KC',
      config: {
        horizonDays: 60,
        zipPageUrls: [
          'https://www.estatesales.net/MO/Kansas-City/64108',
          'https://www.estatesales.net/MO/Kansas-City/64111',
          'https://www.estatesales.net/KS/Overland-Park/66204',
          'https://www.estatesales.net/KS/Overland-Park/66221',
          'https://www.estatesales.net/MO/Lees-Summit/64086',
        ],
        requestDelayMs: 250,
      },
      active: true,
      pollIntervalCron: '0 */6 * * *',
    });
    console.log('  wired Liquidation Sales KC source');
  } else {
    console.log('  Liquidation Sales KC source already exists');
  }

  const consignmentExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'KC Consignment Shops'`,
  });
  if (!consignmentExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'consignment_kc',
      name: 'KC Consignment Shops',
      config: {},
      active: true,
      pollIntervalCron: '0 0 * * 0',
    });
    console.log('  wired KC Consignment Shops source');
  } else {
    console.log('  KC Consignment Shops source already exists');
  }

  const visitKcLuxuryExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'Visit KC Luxury Deals'`,
  });
  if (!visitKcLuxuryExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'visitkc_luxury',
      name: 'Visit KC Luxury Deals',
      config: {
        feedUrl: 'https://news.visitkc.com/rss.xml',
        inkcFeedUrl: 'https://www.inkansascity.com/feed/',
        limit: 50,
        maxAgeDays: 730,
      },
      active: true,
      pollIntervalCron: '0 */6 * * *',
    });
    console.log('  wired Visit KC Luxury Deals source');
  } else {
    console.log('  Visit KC Luxury Deals source already exists');
  }

  const visitKcRomanticExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'Visit KC Romantic Weekends'`,
  });
  if (!visitKcRomanticExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'visitkc_romantic_weekends',
      name: 'Visit KC Romantic Weekends',
      config: { feedUrl: 'https://news.visitkc.com/rss.xml', limit: 50, maxAgeDays: 730 },
      active: true,
      pollIntervalCron: '0 */6 * * *',
    });
    console.log('  wired Visit KC Romantic Weekends source');
  } else {
    console.log('  Visit KC Romantic Weekends source already exists');
  }

  const visitKcLuxExpExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'Visit KC Luxury Experiences'`,
  });
  if (!visitKcLuxExpExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'visitkc_luxury_experiences',
      name: 'Visit KC Luxury Experiences',
      config: { feedUrl: 'https://news.visitkc.com/rss.xml', limit: 50, maxAgeDays: 730 },
      active: true,
      pollIntervalCron: '0 */6 * * *',
    });
    console.log('  wired Visit KC Luxury Experiences source');
  } else {
    console.log('  Visit KC Luxury Experiences source already exists');
  }

  const hotelPackagesExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'KC Hotel Packages'`,
  });
  if (!hotelPackagesExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'kc_hotel_packages',
      name: 'KC Hotel Packages',
      config: {},
      active: true,
      pollIntervalCron: '0 0 * * 0',
    });
    console.log('  wired KC Hotel Packages source');
  } else {
    console.log('  KC Hotel Packages source already exists');
  }

  const casinoHotelExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'Casino Hotel Packages'`,
  });
  if (!casinoHotelExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'casino_hotel_packages',
      name: 'Casino Hotel Packages',
      config: {},
      active: true,
      pollIntervalCron: '0 0 * * 0',
    });
    console.log('  wired Casino Hotel Packages source');
  } else {
    console.log('  Casino Hotel Packages source already exists');
  }

  const spaPackagesExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'KC Spa Packages'`,
  });
  if (!spaPackagesExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'spa_packages_kc',
      name: 'KC Spa Packages',
      config: {},
      active: true,
      pollIntervalCron: '0 0 * * 0',
    });
    console.log('  wired KC Spa Packages source');
  } else {
    console.log('  KC Spa Packages source already exists');
  }

  const rooftopBarsExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'KC Rooftop Bars'`,
  });
  if (!rooftopBarsExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'rooftop_bars_kc',
      name: 'KC Rooftop Bars',
      config: {},
      active: true,
      pollIntervalCron: '0 0 * * 0',
    });
    console.log('  wired KC Rooftop Bars source');
  } else {
    console.log('  KC Rooftop Bars source already exists');
  }

  const wineTastingExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'KC Wine Tastings'`,
  });
  if (!wineTastingExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'wine_tasting_kc',
      name: 'KC Wine Tastings',
      config: {},
      active: true,
      pollIntervalCron: '0 0 * * 0',
    });
    console.log('  wired KC Wine Tastings source');
  } else {
    console.log('  KC Wine Tastings source already exists');
  }

  const chefTastingExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'Chef Tasting Menus'`,
  });
  if (!chefTastingExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'chef_tasting_menus',
      name: 'Chef Tasting Menus',
      config: {},
      active: true,
      pollIntervalCron: '0 0 * * 0',
    });
    console.log('  wired Chef Tasting Menus source');
  } else {
    console.log('  Chef Tasting Menus source already exists');
  }

  const kauffmanDateNightsExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'Kauffman Date Nights'`,
  });
  if (!kauffmanDateNightsExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'kauffman_date_nights',
      name: 'Kauffman Date Nights',
      config: {
        apiUrl: 'https://tickets.kauffmancenter.org/api/products/productionseasons',
        horizonDays: 90,
        limit: 50,
        minHour: 17,
      },
      active: true,
      pollIntervalCron: '0 */6 * * *',
    });
    console.log('  wired Kauffman Date Nights source');
  } else {
    console.log('  Kauffman Date Nights source already exists');
  }

  const romanticRestaurantExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'Romantic Restaurant Events'`,
  });
  if (!romanticRestaurantExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'romantic_restaurant_events',
      name: 'Romantic Restaurant Events',
      config: {
        feedUrls: [
          'https://www.thepitchkc.com/category/dining/feed/',
          'https://www.thepitchkc.com/tag/food/feed/',
          'https://www.thepitchkc.com/tag/kc-sipps/feed/',
          'https://www.thepitchkc.com/tag/restaurant/feed/',
        ],
        limit: 40,
        maxAgeDays: 730,
      },
      active: true,
      pollIntervalCron: '0 */6 * * *',
    });
    console.log('  wired Romantic Restaurant Events source');
  } else {
    console.log('  Romantic Restaurant Events source already exists');
  }

  const bigSlickExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'Big Slick KC'`,
  });
  if (!bigSlickExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'big_slick_kc',
      name: 'Big Slick KC',
      config: { pageUrl: 'https://www.bigslickkc.org/' },
      active: true,
      pollIntervalCron: '0 */6 * * *',
    });
    console.log('  wired Big Slick KC source');
  } else {
    console.log('  Big Slick KC source already exists');
  }

  const childrensMercyExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = ${"Children's Mercy Events"}`,
  });
  if (!childrensMercyExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'childrens_mercy_events',
      name: 'Children\'s Mercy Events',
      config: {},
      active: true,
      pollIntervalCron: '0 0 * * 0',
    });
    console.log('  wired Children\'s Mercy Events source');
  } else {
    console.log('  Children\'s Mercy Events source already exists');
  }

  const chiefsCharityExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'Chiefs Charity Events'`,
  });
  if (!chiefsCharityExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'chiefs_charity_events',
      name: 'Chiefs Charity Events',
      config: {},
      active: true,
      pollIntervalCron: '0 0 * * 0',
    });
    console.log('  wired Chiefs Charity Events source');
  } else {
    console.log('  Chiefs Charity Events source already exists');
  }

  const royalsCharityExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'Royals Charity Events'`,
  });
  if (!royalsCharityExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'royals_charity_events',
      name: 'Royals Charity Events',
      config: {},
      active: true,
      pollIntervalCron: '0 0 * * 0',
    });
    console.log('  wired Royals Charity Events source');
  } else {
    console.log('  Royals Charity Events source already exists');
  }

  const sportingKcCharityExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'Sporting KC Charity Events'`,
  });
  if (!sportingKcCharityExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'sporting_kc_charity',
      name: 'Sporting KC Charity Events',
      config: {},
      active: true,
      pollIntervalCron: '0 0 * * 0',
    });
    console.log('  wired Sporting KC Charity Events source');
  } else {
    console.log('  Sporting KC Charity Events source already exists');
  }

  const kcCurrentCharityExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'KC Current Charity Events'`,
  });
  if (!kcCurrentCharityExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'kc_current_charity',
      name: 'KC Current Charity Events',
      config: {},
      active: true,
      pollIntervalCron: '0 0 * * 0',
    });
    console.log('  wired KC Current Charity Events source');
  } else {
    console.log('  KC Current Charity Events source already exists');
  }

  const kauffmanCharityExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'Kauffman Charity Galas'`,
  });
  if (!kauffmanCharityExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'kauffman_charity_galas',
      name: 'Kauffman Charity Galas',
      config: {
        apiUrl: 'https://tickets.kauffmancenter.org/api/products/productionseasons',
        horizonDays: 90,
        limit: 50,
      },
      active: true,
      pollIntervalCron: '0 */6 * * *',
    });
    console.log('  wired Kauffman Charity Galas source');
  } else {
    console.log('  Kauffman Charity Galas source already exists');
  }

  const visitKcCharityExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'Visit KC Charity Events'`,
  });
  if (!visitKcCharityExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'visitkc_charity_events',
      name: 'Visit KC Charity Events',
      config: { feedUrl: 'https://news.visitkc.com/rss.xml', limit: 50, maxAgeDays: 730 },
      active: true,
      pollIntervalCron: '0 */6 * * *',
    });
    console.log('  wired Visit KC Charity Events source');
  } else {
    console.log('  Visit KC Charity Events source already exists');
  }

  const nonprofitGalasExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'KC Nonprofit Galas'`,
  });
  if (!nonprofitGalasExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'kc_nonprofit_galas',
      name: 'KC Nonprofit Galas',
      config: {},
      active: true,
      pollIntervalCron: '0 0 * * 0',
    });
    console.log('  wired KC Nonprofit Galas source');
  } else {
    console.log('  KC Nonprofit Galas source already exists');
  }

  const entertainmentCharityExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'KC Entertainment Charity Events'`,
  });
  if (!entertainmentCharityExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'kc_entertainment_charity',
      name: 'KC Entertainment Charity Events',
      config: {
        feedUrls: [
          'https://www.thepitchkc.com/category/arts-entertainment/feed/',
          'https://www.thepitchkc.com/tag/events/feed/',
        ],
        limit: 30,
        maxAgeDays: 730,
      },
      active: true,
      pollIntervalCron: '0 */6 * * *',
    });
    console.log('  wired KC Entertainment Charity Events source');
  } else {
    console.log('  KC Entertainment Charity Events source already exists');
  }

  const shoppingSources: Array<{ type: string; name: string }> = [
    { type: 'country_club_plaza', name: 'Country Club Plaza Retail' },
    { type: 'crown_center_retail', name: 'Crown Center Retail' },
    { type: 'corbin_park', name: 'Corbin Park Retail' },
    { type: 'prairiefire_retail', name: 'Prairiefire Retail' },
    { type: 'town_center_plaza', name: 'Town Center Plaza Retail' },
    { type: 'zona_rosa', name: 'Zona Rosa Retail' },
    { type: 'legends_outlets', name: 'Legends Outlets KC' },
    { type: 'strawberry_swing', name: 'Strawberry Swing Markets' },
    { type: 'west_bottoms_vintage', name: 'West Bottoms Vintage' },
    { type: 'river_market_vendors', name: 'River Market Vendors' },
    { type: 'made_in_kc', name: 'Made in KC Events' },
    { type: 'cardshows_io', name: 'CardShows.io KC' },
    { type: 'collect_a_con', name: 'Collect-A-Con Kansas City' },
    { type: 'planet_comicon', name: 'Planet Comicon KC' },
  ];

  for (const src of shoppingSources) {
    const exists = await db.query.sources.findFirst({
      where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = ${src.name}`,
    });
    if (!exists) {
      await db.insert(sources).values({
        campaignId,
        type: src.type as import('../schema.js').SourceType,
        name: src.name,
        config: {},
        active: true,
        pollIntervalCron: '0 0 * * 0',
      });
      console.log(`  wired ${src.name} source`);
    } else {
      console.log(`  ${src.name} source already exists`);
    }
  }

  const shareIntakeExists = await db.query.sources.findFirst({
    where: (s) => sql`${s.campaignId} = ${campaignId} AND ${s.name} = 'Share Intake'`,
  });
  if (!shareIntakeExists) {
    await db.insert(sources).values({
      campaignId,
      type: 'manual',
      name: 'Share Intake',
      config: { ingest: 'share_intake' },
      active: true,
    });
    console.log('  wired Share Intake source');
  } else {
    console.log('  Share Intake source already exists');
  }

  console.log('seed complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('seed failed:', err);
  process.exit(1);
});
