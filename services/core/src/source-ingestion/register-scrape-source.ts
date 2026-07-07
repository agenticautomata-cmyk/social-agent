import { and, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { sourceProposals, sources, type Source } from '../schema.js';
import { resolveFeedUrl } from './source-meta.js';

/** Hosts that are aggregators we already track or never useful as scrape sources. */
export const SCRAPE_HOST_BLOCKLIST =
  /(google\.|facebook\.com|instagram\.com|tiktok\.com|twitter\.com|x\.com|youtube\.com|reddit\.com|wikipedia\.org|yelp\.com|tripadvisor\.)/i;

export type RegisterScrapeSourceInput = {
  campaignId: string;
  url: string;
  title?: string | null;
  rationale?: string | null;
  metadata?: Record<string, unknown>;
  proposalId?: string;
};

export type RegisterScrapeSourceResult =
  | { ok: true; sourceId: string; sourceName: string; created: boolean }
  | {
      ok: false;
      reason: 'blocked_host' | 'already_registered' | 'covered_by_existing' | 'invalid_url';
    };

export function normalizeScrapeUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    parsed.hash = '';
    let path = parsed.pathname.replace(/\/+$/, '');
    if (!path) path = '';
    parsed.pathname = path || '/';
    return parsed.toString();
  } catch {
    return null;
  }
}

function listingUrlFromConfig(config: Record<string, unknown>): string | null {
  for (const key of ['listingUrl', 'url', 'feedUrl', 'directoryUrl', 'calendarUrl', 'upcomingUrl']) {
    const value = config[key];
    if (typeof value === 'string' && value.trim()) return normalizeScrapeUrl(value);
  }
  return null;
}

function hostname(url: string): string {
  return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
}

async function findExistingSourceForUrl(
  campaignId: string,
  url: string,
): Promise<Source | null> {
  const normalized = normalizeScrapeUrl(url);
  if (!normalized) return null;
  const targetHost = hostname(normalized);

  const rows = await db.select().from(sources).where(eq(sources.campaignId, campaignId));
  for (const source of rows) {
    const config = (source.config ?? {}) as Record<string, unknown>;
    const configured = listingUrlFromConfig(config) ?? resolveFeedUrl(config, source.type);
    if (configured && normalizeScrapeUrl(configured) === normalized) {
      return source;
    }
    if (configured) {
      try {
        if (hostname(configured) === targetHost) return source;
      } catch {
        // ignore malformed configured URLs
      }
    }
  }
  return null;
}

function buildSourceName(title: string | null | undefined, url: string): string {
  const host = hostname(url);
  const base = title?.trim() || host;
  const trimmed = base.replace(/\s+/g, ' ').slice(0, 72);
  return trimmed.toLowerCase().startsWith('[benson]') ? trimmed : `[Benson] ${trimmed}`;
}

export async function registerScrapeSource(
  input: RegisterScrapeSourceInput,
): Promise<RegisterScrapeSourceResult> {
  const normalized = normalizeScrapeUrl(input.url);
  if (!normalized) return { ok: false, reason: 'invalid_url' };
  if (SCRAPE_HOST_BLOCKLIST.test(hostname(normalized))) {
    return { ok: false, reason: 'blocked_host' };
  }

  const existing = await findExistingSourceForUrl(input.campaignId, normalized);
  if (existing) {
    if (input.proposalId) {
      await db
        .update(sourceProposals)
        .set({
          status: 'accepted',
          sourceId: existing.id,
          updatedAt: new Date(),
        })
        .where(eq(sourceProposals.id, input.proposalId));
    }
    return { ok: false, reason: existing.type === 'scrape' ? 'already_registered' : 'covered_by_existing' };
  }

  const sourceName = buildSourceName(input.title, normalized);
  const now = new Date();
  const [created] = await db
    .insert(sources)
    .values({
      campaignId: input.campaignId,
      type: 'scrape',
      name: sourceName,
      config: {
        listingUrl: normalized,
        discoveredVia: 'ask_benson',
        askBensonTitle: input.title ?? null,
        askBensonRationale: input.rationale ?? null,
        registeredAt: now.toISOString(),
        ...(input.metadata ?? {}),
      },
      active: true,
      pollIntervalCron: '0 9 * * *',
    })
    .returning({ id: sources.id, name: sources.name });

  if (input.proposalId) {
    await db
      .update(sourceProposals)
      .set({
        status: 'accepted',
        sourceId: created!.id,
        updatedAt: now,
      })
      .where(eq(sourceProposals.id, input.proposalId));
  }

  return { ok: true, sourceId: created!.id, sourceName: created!.name, created: true };
}

export async function registerScrapeSourceFromProposal(
  proposalId: string,
  campaignId: string,
): Promise<RegisterScrapeSourceResult> {
  const proposal = await db.query.sourceProposals.findFirst({
    where: eq(sourceProposals.id, proposalId),
  });
  if (!proposal) return { ok: false, reason: 'invalid_url' };
  return registerScrapeSource({
    campaignId,
    url: proposal.url,
    title: proposal.title,
    rationale: proposal.rationale,
    metadata: (proposal.metadata ?? {}) as Record<string, unknown>,
    proposalId: proposal.id,
  });
}

/** Promote pending Ask Benson proposals into active scrape sources. */
export async function promotePendingAskBensonProposals(campaignId: string): Promise<number> {
  const pending = await db
    .select()
    .from(sourceProposals)
    .where(
      and(eq(sourceProposals.status, 'proposed'), eq(sourceProposals.kind, 'new_source')),
    );

  let registered = 0;
  for (const proposal of pending) {
    const meta = (proposal.metadata ?? {}) as Record<string, unknown>;
    const discoveredVia = typeof meta.discoveredVia === 'string' ? meta.discoveredVia : '';
    if (!discoveredVia.startsWith('ask_benson')) continue;

    const result = await registerScrapeSource({
      campaignId,
      url: proposal.url,
      title: proposal.title,
      rationale: proposal.rationale,
      metadata: meta,
      proposalId: proposal.id,
    });
    if (result.ok && result.created) registered += 1;
  }
  return registered;
}
