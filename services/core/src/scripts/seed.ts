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

  console.log('seed complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('seed failed:', err);
  process.exit(1);
});
