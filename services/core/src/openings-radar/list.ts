import { and, desc, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db.js';
import { openingBusinesses, openingEvidence, openingLocations, openingStatusTransitions } from '../schema.js';
import type { OpeningRadarCard } from './types.js';

export type ListOpeningsQuery = {
  q?: string;
  status?: string;
  filter?: string;
  city?: string;
  neighborhood?: string;
  sort?: 'urgency' | 'discovered' | 'expected';
  includeDismissed?: boolean;
  limit?: number;
  offset?: number;
};

function mapCard(
  loc: typeof openingLocations.$inferSelect,
  biz: typeof openingBusinesses.$inferSelect,
): OpeningRadarCard {
  const address = [loc.streetAddress, loc.suite ? `Suite ${loc.suite}` : null, loc.city, loc.state]
    .filter(Boolean)
    .join(', ');
  return {
    id: loc.id,
    businessId: biz.id,
    businessName: biz.canonicalName,
    category: biz.category,
    neighborhood: loc.neighborhood,
    city: loc.city,
    address: address || null,
    status: loc.status as OpeningRadarCard['status'],
    expectedOpening: loc.estimatedOpeningLabel,
    exactOpeningDate: loc.exactOpeningDate,
    grandOpeningDate: loc.grandOpeningDate,
    softOpeningDate: loc.softOpeningDate,
    sourceTitle: loc.sourceTitle,
    sourceUrl: loc.sourceUrl,
    verificationLevel: loc.verificationLevel,
    lastChecked: (loc.lastConfirmedAt ?? loc.updatedAt).toISOString(),
    creatorFitScore: loc.creatorFitScore != null ? Number(loc.creatorFitScore) : null,
    recommendedNextAction: loc.recommendedNextAction,
    opportunityDecision: loc.opportunityDecision,
    eventDecision: loc.eventDecision,
    opportunityContentItemId: loc.opportunityContentItemId,
    calendarItemId: loc.calendarItemId,
    isLocalIndependent: biz.isLocalIndependent,
    isChain: biz.isChain,
    relocationStatus: loc.relocationStatus,
    expansionStatus: loc.expansionStatus,
    latitude: loc.latitude,
    longitude: loc.longitude,
    dismissed: Boolean(loc.dismissedAt),
    research: (loc.research ?? {}) as Record<string, unknown>,
  };
}

export async function listOpenings(query: ListOpeningsQuery = {}): Promise<{
  items: OpeningRadarCard[];
  total: number;
}> {
  const limit = Math.min(query.limit ?? 100, 200);
  const offset = query.offset ?? 0;
  const conditions: SQL[] = [];

  if (!query.includeDismissed) {
    conditions.push(isNull(openingLocations.dismissedAt));
  }
  if (query.status) {
    conditions.push(eq(openingLocations.status, query.status));
  }
  if (query.city) {
    conditions.push(ilike(openingLocations.city, `%${query.city}%`));
  }
  if (query.neighborhood) {
    conditions.push(ilike(openingLocations.neighborhood, `%${query.neighborhood}%`));
  }
  if (query.q) {
    const q = `%${query.q}%`;
    conditions.push(
      or(
        ilike(openingBusinesses.canonicalName, q),
        ilike(openingLocations.streetAddress, q),
        ilike(openingLocations.city, q),
        ilike(openingLocations.neighborhood, q),
      )!,
    );
  }

  switch (query.filter) {
    case 'opening_soon':
      conditions.push(
        or(
          eq(openingLocations.status, 'opening_soon'),
          ilike(openingLocations.estimatedOpeningLabel, '%soon%'),
        )!,
      );
      break;
    case 'soft_opened':
      conditions.push(eq(openingLocations.status, 'soft_open'));
      break;
    case 'grand_opening_scheduled':
      conditions.push(eq(openingLocations.status, 'grand_opening_scheduled'));
      break;
    case 'opened_recently':
      conditions.push(eq(openingLocations.status, 'open'));
      break;
    case 'restaurants':
      conditions.push(ilike(openingBusinesses.category, '%restaurant%'));
      break;
    case 'bars':
      conditions.push(ilike(openingBusinesses.category, '%bar%'));
      break;
    case 'retail':
      conditions.push(ilike(openingBusinesses.category, '%retail%'));
      break;
    case 'entertainment':
      conditions.push(ilike(openingBusinesses.category, '%entertainment%'));
      break;
    case 'locally_owned':
      conditions.push(eq(openingBusinesses.isLocalIndependent, true));
      break;
    case 'chains':
      conditions.push(eq(openingBusinesses.isChain, true));
      break;
    case 'relocations':
      conditions.push(sql`${openingLocations.relocationStatus} is not null`);
      break;
    case 'expansions':
      conditions.push(sql`${openingLocations.expansionStatus} is not null`);
      break;
    case 'needs_verification':
      conditions.push(eq(openingLocations.status, 'needs_verification'));
      break;
    case 'creator_opportunity':
      conditions.push(sql`${openingLocations.opportunityContentItemId} is not null`);
      break;
    default:
      break;
  }

  const where = conditions.length ? and(...conditions) : undefined;

  let orderBy;
  switch (query.sort) {
    case 'expected':
      orderBy = [openingLocations.exactOpeningDate, openingLocations.estimatedOpeningLabel];
      break;
    case 'discovered':
      orderBy = [desc(openingLocations.firstDiscoveredAt)];
      break;
    case 'urgency':
    default:
      orderBy = [desc(openingLocations.creatorFitScore), desc(openingLocations.lastConfirmedAt)];
      break;
  }

  const rows = await db
    .select({ loc: openingLocations, biz: openingBusinesses })
    .from(openingLocations)
    .innerJoin(openingBusinesses, eq(openingLocations.businessId, openingBusinesses.id))
    .where(where)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);

  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(openingLocations)
    .innerJoin(openingBusinesses, eq(openingLocations.businessId, openingBusinesses.id))
    .where(where);

  return {
    items: rows.map((r) => mapCard(r.loc, r.biz)),
    total: countRows[0]?.count ?? 0,
  };
}

export async function getOpeningDetail(id: string) {
  const row = await db
    .select({ loc: openingLocations, biz: openingBusinesses })
    .from(openingLocations)
    .innerJoin(openingBusinesses, eq(openingLocations.businessId, openingBusinesses.id))
    .where(eq(openingLocations.id, id))
    .limit(1);
  if (!row[0]) return null;

  const evidence = await db
    .select()
    .from(openingEvidence)
    .where(eq(openingEvidence.locationId, id))
    .orderBy(desc(openingEvidence.extractedAt))
    .limit(40);

  const transitions = await db
    .select()
    .from(openingStatusTransitions)
    .where(eq(openingStatusTransitions.locationId, id))
    .orderBy(desc(openingStatusTransitions.occurredAt))
    .limit(40);

  return {
    card: mapCard(row[0].loc, row[0].biz),
    location: row[0].loc,
    business: row[0].biz,
    evidence,
    transitions,
  };
}
