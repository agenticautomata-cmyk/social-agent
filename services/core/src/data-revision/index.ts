import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { bensonDataRevisions } from '../schema.js';
import {
  DATA_REVISION_DOMAINS,
  type DataChangeEvent,
  type DataRevisionDomain,
  type DataRevisionStatusResponse,
  type DomainRevisionStatus,
} from './types.js';

const recalculatingDomains = new Map<DataRevisionDomain, { until: number; message?: string }>();

export function markDomainRecalculating(
  domain: DataRevisionDomain,
  options?: { durationMs?: number; message?: string },
): void {
  const durationMs = options?.durationMs ?? 120_000;
  recalculatingDomains.set(domain, {
    until: Date.now() + durationMs,
    message: options?.message,
  });
}

export function clearDomainRecalculating(domain: DataRevisionDomain): void {
  recalculatingDomains.delete(domain);
}

function isRecalculating(domain: DataRevisionDomain): { active: boolean; message?: string } {
  const entry = recalculatingDomains.get(domain);
  if (!entry) return { active: false };
  if (Date.now() > entry.until) {
    recalculatingDomains.delete(domain);
    return { active: false };
  }
  return { active: true, message: entry.message };
}

async function ensureDomainRows(): Promise<void> {
  for (const domain of DATA_REVISION_DOMAINS) {
    await db.insert(bensonDataRevisions).values({ domain, revision: 1 }).onConflictDoNothing();
  }
}

export async function bumpDataRevision(
  domain: DataRevisionDomain,
  event: Omit<DataChangeEvent, 'domains' | 'completedAt'> & { completedAt?: string },
): Promise<number> {
  if (!event.success) {
    console.warn(`[data-revision] skipped bump for ${domain} — event failed: ${event.eventType}`);
    return (await getDomainRevision(domain)) ?? 1;
  }

  await ensureDomainRows();
  const completedAt = event.completedAt ?? new Date().toISOString();
  const [row] = await db
    .update(bensonDataRevisions)
    .set({
      revision: sql`${bensonDataRevisions.revision} + 1`,
      updatedAt: new Date(completedAt),
      lastEventType: event.eventType,
      lastSource: event.source,
      lastSuccess: true,
      lastRecordIds: event.recordIds ?? [],
      metadata: event.metadata ?? {},
    })
    .where(eq(bensonDataRevisions.domain, domain))
    .returning({ revision: bensonDataRevisions.revision });

  return row?.revision ?? 1;
}

export async function emitDataChange(event: DataChangeEvent): Promise<Record<DataRevisionDomain, number>> {
  const bumped: Partial<Record<DataRevisionDomain, number>> = {};
  if (!event.success) {
    console.warn(`[data-revision] data change not propagated — success=false: ${event.eventType}`);
    return bumped as Record<DataRevisionDomain, number>;
  }

  for (const domain of event.domains) {
    bumped[domain] = await bumpDataRevision(domain, event);
  }

  if (
    event.eventType === 'analytics_sync' ||
    event.eventType === 'analytics_import' ||
    event.eventType === 'analytics_reconnect'
  ) {
    markDomainRecalculating('recommendations', {
      message: 'TikTok sync completed. Updating Benson\u2019s recommendations\u2026',
    });
    markDomainRecalculating('home_briefing', {
      message: 'TikTok sync completed. Updating Benson\u2019s recommendations\u2026',
    });
  }

  if (event.eventType === 'pulse_brief_generated' || event.eventType === 'learning_cycle') {
    clearDomainRecalculating('recommendations');
    clearDomainRecalculating('home_briefing');
  }

  console.log(
    `[data-revision] ${event.eventType} from ${event.source} → ${event.domains.join(', ')}`,
  );
  return bumped as Record<DataRevisionDomain, number>;
}

async function getDomainRevision(domain: DataRevisionDomain): Promise<number | null> {
  const [row] = await db
    .select({ revision: bensonDataRevisions.revision })
    .from(bensonDataRevisions)
    .where(eq(bensonDataRevisions.domain, domain))
    .limit(1);
  return row?.revision ?? null;
}

export async function getDataRevisionStatus(): Promise<DataRevisionStatusResponse> {
  await ensureDomainRows();
  const rows = await db.select().from(bensonDataRevisions);
  const byDomain = new Map(rows.map((r) => [r.domain as DataRevisionDomain, r]));

  const revisions = {} as Record<DataRevisionDomain, DomainRevisionStatus>;
  let globalRevision = 0;

  for (const domain of DATA_REVISION_DOMAINS) {
    const row = byDomain.get(domain);
    const revision = row?.revision ?? 1;
    globalRevision += revision;
    const recalc = isRecalculating(domain);
    revisions[domain] = {
      domain,
      revision,
      updatedAt: row?.updatedAt?.toISOString() ?? new Date().toISOString(),
      lastEventType: row?.lastEventType ?? null,
      lastSource: row?.lastSource ?? null,
      lastSuccess: row?.lastSuccess ?? true,
      recalculating: recalc.active,
      ...(recalc.message ? { recalculatingMessage: recalc.message } : {}),
    };
  }

  return {
    revisions,
    globalRevision,
    serverTime: new Date().toISOString(),
  };
}

export async function getDomainRevisions(
  domains: DataRevisionDomain[],
): Promise<Partial<Record<DataRevisionDomain, number>>> {
  if (domains.length === 0) return {};
  const rows = await db
    .select()
    .from(bensonDataRevisions)
    .where(inArray(bensonDataRevisions.domain, domains));
  const out: Partial<Record<DataRevisionDomain, number>> = {};
  for (const row of rows) {
    out[row.domain as DataRevisionDomain] = row.revision;
  }
  return out;
}

export * from './types.js';
