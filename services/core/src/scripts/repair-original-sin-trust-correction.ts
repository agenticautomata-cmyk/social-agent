/**
 * Surgical Original Sin trust correction:
 * - Restore captured Instagram shortcode (never title-slug fabrications)
 * - Force allDay=false for the proven 9:00 PM CT instant
 * - Keep UTC instant 2026-09-20T02:00:00.000Z unchanged
 * - Demote VERIFIED only when source cannot support facts
 * - Also clear mistagged allDay=true on other non-midnight timed suggestions
 */
import { eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { creatorCalendarItems, curatorEventLeads } from '../schema.js';
import {
  admissionDecisionToMetadata,
  evaluateCalendarAdmission,
} from '../creator-calendar/admission/index.js';
import { getLocalCalendarDay } from '../datetime.js';
import { isSyntheticSocialPermalink } from '../creator-calendar/admission/gates/source-evidence.js';

const now = new Date();
const ORIGINAL_SIN_ID = 'a1f8695c-6266-431c-8bc9-2ab94374ed27';
const ORIGINAL_SIN_LEAD_ID = '47cd2415-0efd-4363-9705-b4c98c8c3fa3';
/** Captured Watchlist evidence — carousel slide covering Original Sin. */
const CAPTURED_SOURCE = 'https://www.instagram.com/p/Dcjl6BJlYA0/';
const STORED_UTC = '2026-09-20T02:00:00.000Z';

const osDecision = evaluateCalendarAdmission(
  {
    title: 'Original Sin: A Sapphic Cabaret and Dance Party',
    summary: 'Sapphic cabaret and dance party — Saturday Sept 19, 9:00 PM CT',
    venue: "Woody's",
    locationName: 'Westport, Kansas City, MO',
    neighborhood: 'Westport',
    formattedAddress: '4800 Main St, Kansas City, MO 64112',
    sourceUrl: CAPTURED_SOURCE,
    attribution: '@hookedonkc',
    eventDate: STORED_UTC,
    extractedEventDate: '2026-09-19',
    extractedStartTime: '9:00 PM',
    ingest: 'instagram_watchlist',
    watchlistVerified: true,
    yearExplicit: true,
  },
  now,
);

const [existing] = await db
  .select()
  .from(creatorCalendarItems)
  .where(eq(creatorCalendarItems.id, ORIGINAL_SIN_ID))
  .limit(1);

if (!existing) {
  console.error('Original Sin calendar row missing', ORIGINAL_SIN_ID);
  process.exit(1);
}

const prevMeta = (existing.metadata as Record<string, unknown> | null) ?? {};
const verificationState =
  osDecision.lifecycle === 'accepted' ? 'VERIFIED' : 'PARTIALLY_VERIFIED';

await db
  .update(creatorCalendarItems)
  .set({
    title: 'Original Sin: A Sapphic Cabaret and Dance Party',
    description: 'Sapphic cabaret and dance party — Saturday Sept 19, 9:00 PM CT @ Woody\'s · Westport (4800 Main St)',
    location: "Woody's · Westport",
    startAt: new Date(STORED_UTC),
    allDay: false,
    timezone: 'America/Chicago',
    planningStatus: 'suggested',
    status: 'suggested',
    dismissedAt: null,
    sourceUrl: CAPTURED_SOURCE,
    verificationState,
    updatedAt: now,
    metadata: {
      ...prevMeta,
      ...admissionDecisionToMetadata(osDecision),
      repairedOriginalSinTrust: true,
      repairedAt: now.toISOString(),
      preferredLocalStart: '2026-09-19T21:00:00-05:00',
      capturedSourceUrl: CAPTURED_SOURCE,
      fabricatedSourceUrlRemoved: 'https://www.instagram.com/p/original-sin-hookedonkc/',
      organizerAttribution: '@hookedonkc',
      venueRegistryId: 'woodys-westport',
      venueAddress: '4800 Main St, Kansas City, MO 64112',
      organizerUrlScrubbed:
        'https://www.thepitchkc.com/warehouse-on-broadway-in-a-fresh-variation-the-venue-makes-its-return-as-an-inclusive-space-for-unfamiliar-faces-to-meet-in-westport/?utm_source=openai',
      organizerUrlScrubReason: 'unrelated_pitch_warehouse_openai_url',
    },
  })
  .where(eq(creatorCalendarItems.id, ORIGINAL_SIN_ID));

console.log('Original Sin trust repaired', {
  lifecycle: osDecision.lifecycle,
  reason: osDecision.primaryReason,
  localDay: getLocalCalendarDay(new Date(STORED_UTC)),
  allDay: false,
  sourceUrl: CAPTURED_SOURCE,
  verificationState,
  startAt: STORED_UTC,
});

// Align curator lead clock + venue so re-projection does not revive allDay=true.
await db
  .update(curatorEventLeads)
  .set({
    eventTime: '9:00 PM',
    venue: "Woody's",
    neighborhood: 'Westport',
    discoveredViaPostUrl: CAPTURED_SOURCE,
    updatedAt: now,
  })
  .where(eq(curatorEventLeads.id, ORIGINAL_SIN_LEAD_ID));

console.log('Original Sin curator lead aligned', ORIGINAL_SIN_LEAD_ID);

// Scrub any remaining synthetic social permalinks on calendar rows.
const allRows = await db.select().from(creatorCalendarItems);
let scrubbed = 0;
for (const row of allRows) {
  const url = (row.sourceUrl ?? '').trim();
  if (!url || !isSyntheticSocialPermalink(url)) continue;
  const meta = (row.metadata as Record<string, unknown> | null) ?? {};
  await db
    .update(creatorCalendarItems)
    .set({
      sourceUrl: null,
      verificationState:
        /^verified$/i.test(row.verificationState ?? '') || row.verificationState === 'VERIFIED'
          ? 'PARTIALLY_VERIFIED'
          : row.verificationState,
      updatedAt: now,
      metadata: {
        ...meta,
        sourceUrlScrubbed: true,
        scrubbedSyntheticUrl: url,
        scrubbedAt: now.toISOString(),
        scrubReason: 'synthetic_social_permalink_prohibited',
      },
    })
    .where(eq(creatorCalendarItems.id, row.id));
  scrubbed += 1;
  console.log('scrubbed synthetic source', row.id, row.title, url);
}
console.log('synthetic scrub count', scrubbed);

// Mistagged allDay=true on non-UTC-midnight timed suggestions → allDay=false.
const mistagged = await db.execute(sql`
  UPDATE creator_calendar_items
  SET all_day = false,
      updated_at = NOW(),
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'allDayMistagRepaired', true,
        'allDayRepairedAt', NOW()::text
      )
  WHERE all_day = true
    AND start_at IS NOT NULL
    AND (
      EXTRACT(HOUR FROM start_at AT TIME ZONE 'UTC') <> 0
      OR EXTRACT(MINUTE FROM start_at AT TIME ZONE 'UTC') <> 0
      OR EXTRACT(SECOND FROM start_at AT TIME ZONE 'UTC') <> 0
    )
    AND planning_status IN ('suggested', 'tentative')
    AND dismissed_at IS NULL
  RETURNING id, title, start_at
`);
console.log('allDay mistag repairs', mistagged.rows ?? mistagged);

process.exit(0);
