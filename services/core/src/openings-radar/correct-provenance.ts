/**
 * Correct fixture-masquerading provenance on the 10 BIG LIST Openings Radar records.
 * Authentic surface: Facebook JoyceKC post 2026-09-20. Substack running list teased, not published.
 */
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  creatorCalendarItems,
  openingEvidence,
  openingLocations,
  openingStatusTransitions,
} from '../schema.js';
import { BIG_LIST_FACEBOOK_URL } from './social-fetch.js';

export const BIG_LIST_LOCATION_IDS = [
  '63e98b65-e754-4b98-ae9d-e70cdc0f464b', // Alice
  '7bb1676e-6464-44df-bbe3-c515253e2fbe', // Angry Chickz
  'efce1c3f-71cc-45b6-b954-bfbc36a905fd', // Bad Cat
  'd1f5a7bb-58a7-440b-a5c9-57629d186da6', // Bam Bird
  '06da7e6c-409a-4769-9f77-6b2b63aeb881', // Blurred
  'ed4ed657-5edd-452f-b5c6-773af9795231', // Bojangles
  '1c1eb9c4-9aa7-4563-a584-5be3a1b3343d', // Boutique
  '69403034-d704-4263-a69f-d94ada349213', // Charlie D's
  'f504357b-e928-4a31-985d-dd1d708e22da', // Donutology
  '6e00adbe-ce06-4aa5-87fb-24a90bc33d3b', // Fleet Feet
] as const;

type Correction = {
  locationId: string;
  status: string;
  estimatedOpeningLabel: string | null;
  exactOpeningDate: string | null;
  grandOpeningDate: string | null;
  softOpeningDate: string | null;
  eventDecision: string;
  revokeCalendar: boolean;
  note: string;
};

/**
 * Status/date corrections grounded in the Facebook BIG LIST body (not the unsupported follow-ups).
 */
const CORRECTIONS: Correction[] = [
  {
    locationId: '63e98b65-e754-4b98-ae9d-e70cdc0f464b',
    status: 'opening_soon',
    estimatedOpeningLabel: 'opening soon',
    exactOpeningDate: null,
    grandOpeningDate: null,
    softOpeningDate: null,
    eventDecision: 'skip:projected_open_date_not_public_event',
    revokeCalendar: false,
    note: 'Reverted unsupported soft_open — Facebook says opening soon only',
  },
  {
    locationId: '7bb1676e-6464-44df-bbe3-c515253e2fbe',
    status: 'opening_soon',
    estimatedOpeningLabel: 'November 2026',
    exactOpeningDate: null,
    grandOpeningDate: null,
    softOpeningDate: null,
    eventDecision: 'skip:projected_open_date_not_public_event',
    revokeCalendar: false,
    note: 'Reverted unsupported delayed/December — Facebook says November opening',
  },
  {
    locationId: 'efce1c3f-71cc-45b6-b954-bfbc36a905fd',
    status: 'site_identified',
    estimatedOpeningLabel: 'September 25, 2026',
    exactOpeningDate: '2026-09-25',
    grandOpeningDate: null,
    softOpeningDate: null,
    eventDecision: 'skip:projected_open_date_not_public_event',
    revokeCalendar: true,
    note: 'Projected open date kept on Radar; revoked Calendar event (not public grand-opening evidence)',
  },
  {
    locationId: 'd1f5a7bb-58a7-440b-a5c9-57629d186da6',
    status: 'grand_opening_scheduled',
    estimatedOpeningLabel: 'October 3, 2026',
    exactOpeningDate: '2026-10-03',
    grandOpeningDate: '2026-10-03',
    softOpeningDate: null,
    eventDecision: 'create:2026-10-03:grand_opening_exact_public_date',
    revokeCalendar: false,
    note: 'Facebook states grand opening Oct. 3 — Event retained',
  },
  {
    locationId: '06da7e6c-409a-4769-9f77-6b2b63aeb881',
    status: 'opening_soon',
    estimatedOpeningLabel: 'Halloween weekend 2026',
    exactOpeningDate: null,
    grandOpeningDate: null,
    softOpeningDate: null,
    eventDecision: 'skip:projected_open_date_not_public_event',
    revokeCalendar: false,
    note: 'Reverted unsupported delayed/mid-November — Facebook says Halloween weekend',
  },
  {
    locationId: 'ed4ed657-5edd-452f-b5c6-773af9795231',
    status: 'site_identified',
    estimatedOpeningLabel: 'November 10, 2026',
    exactOpeningDate: '2026-11-10',
    grandOpeningDate: null,
    softOpeningDate: null,
    eventDecision: 'skip:projected_open_date_not_public_event',
    revokeCalendar: false,
    note: 'Facebook Nov. 10 opening — projected date on Radar only',
  },
  {
    locationId: '1c1eb9c4-9aa7-4563-a584-5be3a1b3343d',
    status: 'opening_soon',
    estimatedOpeningLabel: 'opening soon',
    exactOpeningDate: null,
    grandOpeningDate: null,
    softOpeningDate: null,
    eventDecision: 'skip:projected_open_date_not_public_event',
    revokeCalendar: false,
    note: 'Unchanged — Facebook opening soon',
  },
  {
    locationId: '69403034-d704-4263-a69f-d94ada349213',
    status: 'site_identified',
    estimatedOpeningLabel: 'mid-October 2026',
    exactOpeningDate: null,
    grandOpeningDate: null,
    softOpeningDate: null,
    eventDecision: 'skip:projected_open_date_not_public_event',
    revokeCalendar: false,
    note: 'Unchanged — Facebook Mid-October',
  },
  {
    locationId: 'f504357b-e928-4a31-985d-dd1d708e22da',
    status: 'grand_opening_scheduled',
    estimatedOpeningLabel: 'mid-October 2026',
    exactOpeningDate: null,
    grandOpeningDate: null,
    softOpeningDate: null,
    eventDecision: 'skip:grand_opening_approximate_needs_exact_date',
    revokeCalendar: true,
    note: 'Reverted unsupported exact Oct 15 — Facebook says mid-October grand opening; revoked Event',
  },
  {
    locationId: '6e00adbe-ce06-4aa5-87fb-24a90bc33d3b',
    status: 'site_identified',
    estimatedOpeningLabel: 'early November 2026',
    exactOpeningDate: null,
    grandOpeningDate: null,
    softOpeningDate: null,
    eventDecision: 'skip:projected_open_date_not_public_event',
    revokeCalendar: false,
    note: 'Unchanged — Facebook early November',
  },
];

export type ProvenanceCorrectionReport = {
  locationsUpdated: number;
  evidenceAppended: number;
  transitionsRecorded: number;
  calendarRevoked: number;
  rows: Array<{ locationId: string; note: string; priorStatus: string; newStatus: string }>;
};

export async function correctBigListProvenanceAndStatus(): Promise<ProvenanceCorrectionReport> {
  const rows: ProvenanceCorrectionReport['rows'] = [];
  let evidenceAppended = 0;
  let transitionsRecorded = 0;
  let calendarRevoked = 0;

  for (const fix of CORRECTIONS) {
    const [existing] = await db
      .select()
      .from(openingLocations)
      .where(eq(openingLocations.id, fix.locationId))
      .limit(1);
    if (!existing) continue;

    const priorMeta = (existing.metadata && typeof existing.metadata === 'object'
      ? existing.metadata
      : {}) as Record<string, unknown>;

    if (existing.status !== fix.status) {
      await db.insert(openingStatusTransitions).values({
        locationId: fix.locationId,
        fromStatus: existing.status,
        toStatus: fix.status,
        evidence: fix.note,
        source: 'provenance_correction',
        metadata: {
          authenticEvidenceUrl: BIG_LIST_FACEBOOK_URL,
          priorUnsupportedUpdate: true,
        },
      });
      transitionsRecorded += 1;
    }

    if (fix.revokeCalendar && existing.calendarItemId) {
      const cal = await db.query.creatorCalendarItems.findFirst({
        where: eq(creatorCalendarItems.id, existing.calendarItemId),
      });
      const calMeta = {
        ...((cal?.metadata as Record<string, unknown>) ?? {}),
        revokedReason: fix.note,
        revokedAt: new Date().toISOString(),
        openingsRadarCorrection: true,
      };
      await db
        .update(creatorCalendarItems)
        .set({
          status: 'cancelled',
          planningStatus: 'cancelled',
          updatedAt: new Date(),
          metadata: calMeta,
        })
        .where(eq(creatorCalendarItems.id, existing.calendarItemId));
      calendarRevoked += 1;
    }

    await db
      .update(openingLocations)
      .set({
        status: fix.status,
        estimatedOpeningLabel: fix.estimatedOpeningLabel,
        exactOpeningDate: fix.exactOpeningDate,
        grandOpeningDate: fix.grandOpeningDate,
        softOpeningDate: fix.softOpeningDate,
        sourceTitle: "The BIG LIST: Who's Opening, Where & When",
        sourceAuthor: 'Joyce Smith / KCinsiders',
        sourceUrl: BIG_LIST_FACEBOOK_URL,
        socialPostUrl: BIG_LIST_FACEBOOK_URL,
        sourcePublishedAt: new Date('2026-09-20T16:39:00.000Z'),
        gmailMessageId: null,
        eventDecision: fix.eventDecision,
        calendarItemId: fix.revokeCalendar ? null : existing.calendarItemId,
        verificationLevel: 'social_supported',
        metadata: {
          ...priorMeta,
          provenance: {
            channel: 'social',
            surface: 'facebook',
            authenticUrl: BIG_LIST_FACEBOOK_URL,
            substackStatus: 'teased_running_list_not_published',
            initialIngest: 'fixture_force_corrected',
            correctedAt: new Date().toISOString(),
          },
        },
        fieldLabels: {
          ...((existing.fieldLabels as Record<string, unknown>) ?? {}),
          address: 'social_supported',
          openingDate: 'social_supported',
          provenance: 'facebook_social',
        },
        updatedAt: new Date(),
      })
      .where(eq(openingLocations.id, fix.locationId));

    await db.insert(openingEvidence).values({
      locationId: fix.locationId,
      field: 'provenance_correction',
      excerpt: fix.note,
      sourceKind: 'social',
      sourceUrl: BIG_LIST_FACEBOOK_URL,
      confidence: '0.950',
      metadata: {
        correction: true,
        priorSourceUrl: existing.sourceUrl,
        priorStatus: existing.status,
      },
    });
    evidenceAppended += 1;

    rows.push({
      locationId: fix.locationId,
      note: fix.note,
      priorStatus: existing.status,
      newStatus: fix.status,
    });
  }

  return {
    locationsUpdated: rows.length,
    evidenceAppended,
    transitionsRecorded,
    calendarRevoked,
    rows,
  };
}

export async function provenanceTable(): Promise<
  Array<{
    business: string;
    locationId: string;
    provenance: string;
    status: string;
    sourceUrl: string | null;
    socialPostUrl: string | null;
  }>
> {
  const rows = await db
    .select({
      id: openingLocations.id,
      business: sql<string>`(SELECT canonical_name FROM opening_businesses WHERE id = ${openingLocations.businessId})`,
      status: openingLocations.status,
      sourceUrl: openingLocations.sourceUrl,
      socialPostUrl: openingLocations.socialPostUrl,
      metadata: openingLocations.metadata,
    })
    .from(openingLocations)
    .where(inArray(openingLocations.id, [...BIG_LIST_LOCATION_IDS]));

  return rows
    .map((r) => {
      const meta = (r.metadata && typeof r.metadata === 'object' ? r.metadata : {}) as {
        provenance?: { channel?: string; surface?: string; initialIngest?: string };
      };
      const p = meta.provenance;
      const provenance = p
        ? `${p.surface ?? p.channel ?? 'unknown'}${p.initialIngest ? ` (was ${p.initialIngest})` : ''}`
        : r.socialPostUrl
          ? 'social'
          : r.sourceUrl?.includes('substack')
            ? 'substack_url_unverified'
            : 'unknown';
      return {
        business: r.business,
        locationId: r.id,
        provenance,
        status: r.status,
        sourceUrl: r.sourceUrl,
        socialPostUrl: r.socialPostUrl,
      };
    })
    .sort((a, b) => a.business.localeCompare(b.business));
}
