/**
 * Surgical repair for Original Sin fingerprint theft + named venue recoveries.
 */
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { creatorCalendarItems } from '../schema.js';
import {
  admissionDecisionToMetadata,
  evaluateCalendarAdmission,
} from '../creator-calendar/admission/index.js';

const now = new Date();

// 1) Restore Original Sin canonical survivor (was overwritten by New Dance Partners).
const originalSinId = 'a1f8695c-6266-431c-8bc9-2ab94374ed27';
const osDecision = evaluateCalendarAdmission(
  {
    title: 'ORIGINAL SIN: A SAPPHIC CABARET AND DANCE PARTY',
    summary: 'Sapphic cabaret and dance party — Saturday Sept 19, 9:00 PM CT',
    venue: "Woody's",
    locationName: 'Westport, Kansas City, MO',
    neighborhood: 'Westport',
    sourceUrl: 'https://www.instagram.com/p/original-sin-hookedonkc/',
    attribution: '@hookedonkc',
    eventDate: '2026-09-20T02:00:00.000Z',
    extractedEventDate: '2026-09-19',
    extractedStartTime: '9:00 PM',
    ingest: 'instagram_watchlist',
    watchlistVerified: true,
    yearExplicit: true,
  },
  now,
);

await db
  .update(creatorCalendarItems)
  .set({
    title: 'ORIGINAL SIN: A SAPPHIC CABARET AND DANCE PARTY',
    description: 'Sapphic cabaret and dance party — Saturday Sept 19, 9:00 PM CT',
    location: "Woody's · Westport",
    startAt: new Date('2026-09-20T02:00:00.000Z'),
    planningStatus: 'suggested',
    status: 'suggested',
    dismissedAt: null,
    sourceUrl: 'https://www.instagram.com/p/original-sin-hookedonkc/',
    updatedAt: now,
    metadata: {
      ...admissionDecisionToMetadata(osDecision),
      repairedOriginalSin: true,
      repairedAt: now.toISOString(),
      preferredLocalStart: '2026-09-19T21:00:00-05:00',
    },
  })
  .where(eq(creatorCalendarItems.id, originalSinId));

console.log('Original Sin repaired', {
  lifecycle: osDecision.lifecycle,
  reason: osDecision.primaryReason,
  geo: osDecision.evidence.geoEvidence,
});

// 2) Ensure New Dance Partners row is not labeled Original Sin (id that stole fingerprint).
const ndpId = '17a4839e-ee8d-438f-9185-777c410e42da';
const [ndp] = await db
  .select()
  .from(creatorCalendarItems)
  .where(eq(creatorCalendarItems.id, ndpId))
  .limit(1);
if (ndp && /original\s+sin|sapphic\s+cabaret/i.test(ndp.title)) {
  console.log('NDP row still has OS title — leaving as-is for operator review', ndp.title);
} else {
  // Repair NDP location away from curator placeholder.
  const ndpDecision = evaluateCalendarAdmission(
    {
      title: 'New Dance Partners',
      venue: 'Yardley Hall at Midwest Trust Center',
      locationName: 'Overland Park, KS',
      sourceUrl: 'https://kansascity.events/family-shows',
      eventDate: '2026-09-19T00:30:00.000Z',
      extractedEventDate: '2026-09-18',
      extractedStartTime: '7:30 PM',
      ingest: 'scrape_listing',
      yearExplicit: true,
    },
    now,
  );
  await db
    .update(creatorCalendarItems)
    .set({
      location: 'Yardley Hall at Midwest Trust Center, Overland Park',
      sourceUrl: 'https://kansascity.events/family-shows',
      updatedAt: now,
      metadata: {
        ...((ndp.metadata as Record<string, unknown> | null) ?? {}),
        ...admissionDecisionToMetadata(ndpDecision),
        repairedNdpLocation: true,
      },
    })
    .where(eq(creatorCalendarItems.id, ndpId));
  console.log('NDP row repaired', ndpDecision.lifecycle, ndp?.title);
}

// 3) Recover Waldo Medicare + CMP Whitecaps if still dismissed/quarantined.
const recoveries = [
  {
    matchTitle: /Understanding Medicare/i,
    candidate: {
      title: 'Understanding Medicare',
      venue: 'Waldo Branch Library',
      locationName: 'Kansas City, MO',
      sourceUrl: 'https://kclibrary.org/calendar/understanding-medicare-14',
      eventDate: '2026-09-18T17:00:00.000Z',
      extractedEventDate: '2026-09-18',
      extractedStartTime: '12:00 PM',
      ingest: 'kc_library_scrape',
      yearExplicit: true as const,
    },
  },
  {
    matchTitle: /Sporting KC vs Vancouver Whitecaps Fc/i,
    candidate: {
      title: 'Sporting KC vs Vancouver Whitecaps FC',
      venue: "Children's Mercy Park",
      locationName: 'Kansas City, KS',
      sourceUrl: 'https://www.sportingkc.com/matches/',
      eventDate: '2026-09-21T00:30:00.000Z',
      extractedEventDate: '2026-09-20',
      extractedStartTime: '7:30 PM',
      ingest: 'sporting_kc_event_api',
      yearExplicit: true as const,
    },
  },
];

for (const recovery of recoveries) {
  const rows = await db.select().from(creatorCalendarItems);
  const hit = rows.find((r) => recovery.matchTitle.test(r.title) && r.location);
  if (!hit) {
    console.log('no row for', recovery.candidate.title);
    continue;
  }
  const decision = evaluateCalendarAdmission(recovery.candidate, now);
  console.log('recover candidate', recovery.candidate.title, decision.lifecycle, decision.primaryReason);
  if (decision.lifecycle !== 'accepted') continue;
  await db
    .update(creatorCalendarItems)
    .set({
      title: recovery.candidate.title,
      location: recovery.candidate.venue,
      startAt: new Date(recovery.candidate.eventDate),
      planningStatus: 'suggested',
      status: 'suggested',
      dismissedAt: null,
      sourceUrl: recovery.candidate.sourceUrl,
      updatedAt: now,
      metadata: {
        ...((hit.metadata as Record<string, unknown> | null) ?? {}),
        ...admissionDecisionToMetadata(decision),
        recoveredBySurgicalRepair: true,
        recoveredAt: now.toISOString(),
      },
    })
    .where(eq(creatorCalendarItems.id, hit.id));
  console.log('recovered', hit.id, recovery.candidate.title);
}

// 4) Scrub mismatched source URLs on dismissed BPCofKC / Exclusive Sundays.
const scrub = await db.execute(
  // drizzle sql tagged via raw execute
  (await import('drizzle-orm')).sql`
    UPDATE creator_calendar_items
    SET source_url = NULL,
        updated_at = NOW(),
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('sourceUrlScrubbed', true, 'scrubbedAt', NOW()::text)
    WHERE (
      (title ILIKE '%BPCofKC%' AND source_url ILIKE '%sincerely%her%')
      OR (title ILIKE '%Exclusive Sundays%' AND source_url ILIKE '%bridge909.org%')
    )
    RETURNING id, title
  `,
);
console.log('scrubbed', scrub.rows ?? scrub);

process.exit(0);
