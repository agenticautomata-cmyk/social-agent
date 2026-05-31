import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { sponsorContacts, sponsorOpportunities } from '../schema.js';
import { getSponsorContact } from '../sponsor-outreach/contacts.js';
import {
  CLOSED_PIPELINE_STATUSES,
  OPEN_PIPELINE_STATUSES,
  type SponsorPipelineStatus,
} from './constants.js';

export type SponsorOpportunityRecord = {
  id: string;
  sponsorContactId: string;
  title: string;
  estimatedValue: number | null;
  actualValue: number | null;
  status: SponsorPipelineStatus;
  notes: string | null;
  leadSource: string | null;
  plannerListName: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
};

export type SponsorOpportunityWithContact = SponsorOpportunityRecord & {
  sponsorBusinessName: string;
  sponsorCategory: string | null;
  sponsorContactName: string | null;
};

function parseMoney(value: string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function moneyToDb(value: number | null | undefined): string | null {
  if (value == null || Number.isNaN(value)) return null;
  return value.toFixed(2);
}

export function rowToOpportunity(
  row: typeof sponsorOpportunities.$inferSelect,
): SponsorOpportunityRecord {
  return {
    id: row.id,
    sponsorContactId: row.sponsorContactId,
    title: row.title,
    estimatedValue: parseMoney(row.estimatedValue),
    actualValue: parseMoney(row.actualValue),
    status: row.status,
    notes: row.notes,
    leadSource: row.leadSource,
    plannerListName: row.plannerListName,
    dueDate: row.dueDate?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
  };
}

export async function listSponsorOpportunities(filters?: {
  sponsorContactId?: string;
  status?: SponsorPipelineStatus;
  openOnly?: boolean;
}): Promise<SponsorOpportunityRecord[]> {
  const conditions = [];
  if (filters?.sponsorContactId) {
    conditions.push(eq(sponsorOpportunities.sponsorContactId, filters.sponsorContactId));
  }
  if (filters?.status) {
    conditions.push(eq(sponsorOpportunities.status, filters.status));
  }
  if (filters?.openOnly) {
    conditions.push(inArray(sponsorOpportunities.status, OPEN_PIPELINE_STATUSES));
  }

  const rows = await db
    .select()
    .from(sponsorOpportunities)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(sponsorOpportunities.updatedAt));

  return rows.map(rowToOpportunity);
}

export async function getSponsorOpportunity(id: string): Promise<SponsorOpportunityRecord | null> {
  const rows = await db
    .select()
    .from(sponsorOpportunities)
    .where(eq(sponsorOpportunities.id, id))
    .limit(1);
  return rows[0] ? rowToOpportunity(rows[0]) : null;
}

export async function enrichOpportunities(
  opportunities: SponsorOpportunityRecord[],
): Promise<SponsorOpportunityWithContact[]> {
  if (opportunities.length === 0) return [];

  const contactIds = [...new Set(opportunities.map((o) => o.sponsorContactId))];
  const contacts = await db
    .select()
    .from(sponsorContacts)
    .where(inArray(sponsorContacts.id, contactIds));
  const contactMap = new Map(contacts.map((c) => [c.id, c]));

  return opportunities.map((opp) => {
    const c = contactMap.get(opp.sponsorContactId);
    return {
      ...opp,
      sponsorBusinessName: c?.businessName ?? 'Unknown',
      sponsorCategory: c?.category ?? null,
      sponsorContactName: c?.contactName ?? null,
    };
  });
}

export async function createSponsorOpportunity(input: {
  sponsorContactId: string;
  title: string;
  estimatedValue?: number | null;
  actualValue?: number | null;
  status?: SponsorPipelineStatus;
  notes?: string | null;
  leadSource?: string | null;
  plannerListName?: string | null;
  dueDate?: string | null;
}): Promise<SponsorOpportunityRecord> {
  const contact = await getSponsorContact(input.sponsorContactId);
  if (!contact) throw new Error('Sponsor contact not found');

  const [row] = await db
    .insert(sponsorOpportunities)
    .values({
      sponsorContactId: input.sponsorContactId,
      title: input.title,
      estimatedValue: moneyToDb(input.estimatedValue),
      actualValue: moneyToDb(input.actualValue),
      status: input.status ?? 'lead',
      notes: input.notes ?? null,
      leadSource: input.leadSource ?? null,
      plannerListName: input.plannerListName ?? null,
    })
    .returning();

  return rowToOpportunity(row!);
}

export async function updateSponsorOpportunity(
  id: string,
  input: Partial<{
    title: string;
    estimatedValue: number | null;
    actualValue: number | null;
    status: SponsorPipelineStatus;
    notes: string | null;
    leadSource: string | null;
    plannerListName: string | null;
    dueDate: string | null;
  }>,
): Promise<SponsorOpportunityRecord | null> {
  const existing = await getSponsorOpportunity(id);
  if (!existing) return null;

  const now = new Date();
  const patch: Partial<typeof sponsorOpportunities.$inferInsert> = { updatedAt: now };

  if (input.title !== undefined) patch.title = input.title;
  if (input.estimatedValue !== undefined) patch.estimatedValue = moneyToDb(input.estimatedValue);
  if (input.actualValue !== undefined) patch.actualValue = moneyToDb(input.actualValue);
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.leadSource !== undefined) patch.leadSource = input.leadSource;
  if (input.plannerListName !== undefined) patch.plannerListName = input.plannerListName;
  if (input.dueDate !== undefined) {
    patch.dueDate = input.dueDate ? new Date(input.dueDate) : null;
  }

  if (input.status !== undefined) {
    patch.status = input.status;
    if (CLOSED_PIPELINE_STATUSES.includes(input.status)) {
      patch.closedAt = now;
    } else {
      patch.closedAt = null;
    }
  }

  const [row] = await db
    .update(sponsorOpportunities)
    .set(patch)
    .where(eq(sponsorOpportunities.id, id))
    .returning();

  return row ? rowToOpportunity(row) : null;
}

export async function markOpportunityWon(
  id: string,
  actualValue?: number | null,
): Promise<SponsorOpportunityRecord | null> {
  const existing = await getSponsorOpportunity(id);
  if (!existing) return null;

  const value = actualValue ?? existing.actualValue ?? existing.estimatedValue;

  return updateSponsorOpportunity(id, {
    status: 'won',
    actualValue: value,
  });
}

export async function markOpportunityLost(
  id: string,
  notes?: string | null,
): Promise<SponsorOpportunityRecord | null> {
  const existing = await getSponsorOpportunity(id);
  if (!existing) return null;

  return updateSponsorOpportunity(id, {
    status: 'lost',
    actualValue: 0,
    notes: notes ?? existing.notes,
  });
}

export type SponsorPipelineSummary = {
  openOpportunities: SponsorOpportunityRecord[];
  openPipelineValue: number;
  closedValue: number;
  wonCount: number;
  lostCount: number;
};

export async function getSponsorPipelineSummary(
  sponsorContactId: string,
): Promise<SponsorPipelineSummary> {
  const all = await listSponsorOpportunities({ sponsorContactId });
  const open = all.filter((o) => OPEN_PIPELINE_STATUSES.includes(o.status));
  const won = all.filter((o) => o.status === 'won');

  const openPipelineValue = open.reduce((sum, o) => sum + (o.estimatedValue ?? 0), 0);
  const closedValue = won.reduce(
    (sum, o) => sum + (o.actualValue ?? o.estimatedValue ?? 0),
    0,
  );

  return {
    openOpportunities: open,
    openPipelineValue,
    closedValue,
    wonCount: won.length,
    lostCount: all.filter((o) => o.status === 'lost').length,
  };
}

function startOfMonthUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfMonthUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

export type PipelineDashboard = {
  generatedAt: string;
  totalPipelineValue: number;
  openDealCount: number;
  wonThisMonth: { count: number; value: number };
  lostThisMonth: { count: number };
  conversionRate: number;
  averageDealSize: number;
  byStatus: Array<{ status: SponsorPipelineStatus; count: number; value: number }>;
  opportunities: SponsorOpportunityWithContact[];
};

export async function computePipelineDashboard(
  now = new Date(),
): Promise<PipelineDashboard> {
  const monthStart = startOfMonthUtc(now);
  const monthEnd = endOfMonthUtc(now);

  const rows = await db
    .select({
      opportunity: sponsorOpportunities,
      businessName: sponsorContacts.businessName,
      category: sponsorContacts.category,
      contactName: sponsorContacts.contactName,
    })
    .from(sponsorOpportunities)
    .innerJoin(sponsorContacts, eq(sponsorContacts.id, sponsorOpportunities.sponsorContactId))
    .orderBy(desc(sponsorOpportunities.updatedAt));

  const opportunities: SponsorOpportunityWithContact[] = rows.map(({ opportunity, ...c }) => ({
    ...rowToOpportunity(opportunity),
    sponsorBusinessName: c.businessName,
    sponsorCategory: c.category,
    sponsorContactName: c.contactName,
  }));

  const open = opportunities.filter((o) => OPEN_PIPELINE_STATUSES.includes(o.status));
  const totalPipelineValue = open.reduce((s, o) => s + (o.estimatedValue ?? 0), 0);

  const wonAll = opportunities.filter((o) => o.status === 'won');
  const lostAll = opportunities.filter((o) => o.status === 'lost');

  const wonMonth = wonAll.filter(
    (o) => o.closedAt && new Date(o.closedAt) >= monthStart && new Date(o.closedAt) < monthEnd,
  );
  const lostMonth = lostAll.filter(
    (o) => o.closedAt && new Date(o.closedAt) >= monthStart && new Date(o.closedAt) < monthEnd,
  );

  const wonMonthValue = wonMonth.reduce(
    (s, o) => s + (o.actualValue ?? o.estimatedValue ?? 0),
    0,
  );

  const closedTotal = wonAll.length + lostAll.length;
  const conversionRate = closedTotal > 0 ? wonAll.length / closedTotal : 0;

  const averageDealSize =
    wonAll.length > 0
      ? wonAll.reduce((s, o) => s + (o.actualValue ?? o.estimatedValue ?? 0), 0) / wonAll.length
      : 0;

  const byStatus = OPEN_PIPELINE_STATUSES.concat(CLOSED_PIPELINE_STATUSES).map((status) => {
    const items = opportunities.filter((o) => o.status === status);
    const value = items.reduce((s, o) => {
      if (status === 'won') return s + (o.actualValue ?? o.estimatedValue ?? 0);
      if (status === 'lost') return s;
      return s + (o.estimatedValue ?? 0);
    }, 0);
    return { status, count: items.length, value };
  });

  return {
    generatedAt: now.toISOString(),
    totalPipelineValue,
    openDealCount: open.length,
    wonThisMonth: { count: wonMonth.length, value: wonMonthValue },
    lostThisMonth: { count: lostMonth.length },
    conversionRate,
    averageDealSize,
    byStatus,
    opportunities,
  };
}

export type PipelineReporting = {
  byLeadSource: Array<{ source: string; count: number; won: number; lost: number; closeRate: number }>;
  byCategory: Array<{
    category: string;
    count: number;
    openValue: number;
    wonValue: number;
    closeRate: number;
  }>;
  revenueByCategory: Array<{ category: string; revenue: number; dealCount: number }>;
};

export async function computePipelineReporting(): Promise<PipelineReporting> {
  const enriched = await enrichOpportunities(await listSponsorOpportunities());

  const sourceMap = new Map<string, { count: number; won: number; lost: number }>();
  const categoryMap = new Map<
    string,
    { count: number; openValue: number; wonValue: number; won: number; closed: number }
  >();

  for (const opp of enriched) {
    const source = opp.leadSource ?? 'unknown';
    const cat = opp.sponsorCategory?.replace(/_/g, ' ') ?? 'uncategorized';

    const s = sourceMap.get(source) ?? { count: 0, won: 0, lost: 0 };
    s.count += 1;
    if (opp.status === 'won') s.won += 1;
    if (opp.status === 'lost') s.lost += 1;
    sourceMap.set(source, s);

    const c = categoryMap.get(cat) ?? {
      count: 0,
      openValue: 0,
      wonValue: 0,
      won: 0,
      closed: 0,
    };
    c.count += 1;
    if (OPEN_PIPELINE_STATUSES.includes(opp.status)) {
      c.openValue += opp.estimatedValue ?? 0;
    }
    if (opp.status === 'won') {
      c.won += 1;
      c.closed += 1;
      c.wonValue += opp.actualValue ?? opp.estimatedValue ?? 0;
    }
    if (opp.status === 'lost') {
      c.closed += 1;
    }
    categoryMap.set(cat, c);
  }

  const byLeadSource = [...sourceMap.entries()]
    .map(([source, stats]) => ({
      source,
      count: stats.count,
      won: stats.won,
      lost: stats.lost,
      closeRate: stats.won + stats.lost > 0 ? stats.won / (stats.won + stats.lost) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const byCategory = [...categoryMap.entries()]
    .map(([category, stats]) => ({
      category,
      count: stats.count,
      openValue: stats.openValue,
      wonValue: stats.wonValue,
      closeRate: stats.closed > 0 ? stats.won / stats.closed : 0,
    }))
    .sort((a, b) => b.wonValue - a.wonValue);

  const revenueByCategory = byCategory
    .filter((c) => c.wonValue > 0)
    .map((c) => ({
      category: c.category,
      revenue: c.wonValue,
      dealCount: enriched.filter(
        (o) =>
          o.status === 'won' &&
          (o.sponsorCategory?.replace(/_/g, ' ') ?? 'uncategorized') === c.category,
      ).length,
    }));

  return { byLeadSource, byCategory, revenueByCategory };
}

export async function createOpportunityFromIntelligence(input: {
  contentItemId: string;
  title?: string;
  estimatedValue?: number | null;
  plannerListName?: string | null;
}): Promise<{ contactId: string; opportunity: SponsorOpportunityRecord; created: boolean }> {
  const { createSponsorFromOpportunity } = await import('../sponsor-outreach/contacts.js');
  const { contact } = await createSponsorFromOpportunity(input.contentItemId);

  const existing = await listSponsorOpportunities({
    sponsorContactId: contact.id,
    openOnly: true,
  });

  if (existing.length > 0 && !input.title) {
    return { contactId: contact.id, opportunity: existing[0]!, created: false };
  }

  const title =
    input.title ??
    `${contact.businessName} partnership`;

  const opportunity = await createSponsorOpportunity({
    sponsorContactId: contact.id,
    title,
    estimatedValue: input.estimatedValue,
    leadSource: 'sponsor_intelligence',
    plannerListName: input.plannerListName,
    status: 'lead',
  });

  return { contactId: contact.id, opportunity, created: true };
}
