// Source health — checks each enabled source's feed URL, tracks consecutive
// failures in source.config.health, auto-disables chronically broken sources,
// and uses web research to propose replacement URLs for operator review.

import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { sources, sourceProposals, type Source } from '../schema.js';
import { SOURCE_TYPE_META, resolveFeedUrl } from '../source-ingestion/source-meta.js';
import { researchReplacementSource } from '../web-research/index.js';

const FAILURES_BEFORE_DISABLE = 3;
const CHECK_TIMEOUT_MS = 15_000;

export type SourceHealthResult = {
  sourceId: string;
  sourceName: string;
  url: string | null;
  ok: boolean;
  status: number | null;
  consecutiveFailures: number;
  disabled: boolean;
  proposalCreated: boolean;
  error?: string;
};

export type SourceHealthRunResult = {
  checked: number;
  healthy: number;
  failing: number;
  disabled: number;
  proposals: number;
  results: SourceHealthResult[];
};

type HealthState = {
  consecutiveFailures: number;
  lastCheckedAt: string;
  lastStatus: number | null;
  lastError: string | null;
};

async function checkUrl(url: string): Promise<{ ok: boolean; status: number | null; error?: string }> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; BensonBot/1.0; +https://benson.kckellie.com)',
        Accept: 'text/html,application/xhtml+xml,application/xml,application/rss+xml,*/*',
      },
      redirect: 'follow',
    });
    // 403/429 often mean bot-blocking, not a dead feed — treat as inconclusive-healthy.
    if (res.ok || res.status === 403 || res.status === 429) {
      return { ok: true, status: res.status };
    }
    return { ok: false, status: res.status, error: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, status: null, error: err instanceof Error ? err.message : String(err) };
  }
}

async function proposeReplacement(source: Source, brokenUrl: string | null): Promise<boolean> {
  try {
    const meta = SOURCE_TYPE_META[source.type];
    const research = await researchReplacementSource({
      sourceName: source.name,
      sourceType: `${source.type} (${meta?.category ?? 'general'})`,
      brokenUrl,
    });
    if (!research.ok || research.citations.length === 0) return false;

    let created = false;
    for (const citation of research.citations.slice(0, 3)) {
      const inserted = await db
        .insert(sourceProposals)
        .values({
          kind: 'replacement_url',
          sourceId: source.id,
          title: `Replacement for ${source.name}`,
          url: citation.url,
          rationale: research.summary?.slice(0, 1000) ?? null,
          metadata: {
            brokenUrl,
            sourceType: source.type,
            citationTitle: citation.title,
          },
        })
        .onConflictDoNothing()
        .returning({ id: sourceProposals.id });
      if (inserted.length > 0) created = true;
    }
    return created;
  } catch (err) {
    console.warn('[source-health] replacement research failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

export async function runSourceHealthCheck(options?: {
  proposeReplacements?: boolean;
}): Promise<SourceHealthRunResult> {
  const proposeReplacements = options?.proposeReplacements ?? true;
  const rows = await db.select().from(sources).where(eq(sources.active, true));

  const run: SourceHealthRunResult = {
    checked: 0,
    healthy: 0,
    failing: 0,
    disabled: 0,
    proposals: 0,
    results: [],
  };

  for (const source of rows) {
    if (source.type === 'manual') continue;
    const config = (source.config ?? {}) as Record<string, unknown>;
    const url = resolveFeedUrl(config, source.type);
    if (!url) continue;

    run.checked += 1;
    const check = await checkUrl(url);
    const prevHealth = (config.health ?? {}) as Partial<HealthState>;
    const consecutiveFailures = check.ok ? 0 : (prevHealth.consecutiveFailures ?? 0) + 1;

    const health: HealthState = {
      consecutiveFailures,
      lastCheckedAt: new Date().toISOString(),
      lastStatus: check.status,
      lastError: check.error ?? null,
    };

    const shouldDisable = consecutiveFailures >= FAILURES_BEFORE_DISABLE;
    let proposalCreated = false;

    await db
      .update(sources)
      .set({
        config: { ...config, health },
        ...(shouldDisable ? { active: false, lastError: `Auto-disabled after ${consecutiveFailures} failed health checks: ${check.error}` } : {}),
        updatedAt: new Date(),
      })
      .where(eq(sources.id, source.id));

    if (shouldDisable) {
      run.disabled += 1;
      console.warn(`[source-health] auto-disabled ${source.name} (${check.error})`);
      if (proposeReplacements) {
        proposalCreated = await proposeReplacement(source, url);
        if (proposalCreated) run.proposals += 1;
      }
    }

    if (check.ok) run.healthy += 1;
    else run.failing += 1;

    run.results.push({
      sourceId: source.id,
      sourceName: source.name,
      url,
      ok: check.ok,
      status: check.status,
      consecutiveFailures,
      disabled: shouldDisable,
      proposalCreated,
      error: check.error,
    });
  }

  console.log(
    `[source-health] checked ${run.checked} — ${run.healthy} healthy, ${run.failing} failing, ${run.disabled} auto-disabled, ${run.proposals} replacement proposals`,
  );
  return run;
}

export async function listSourceProposals(status?: string) {
  const rows = status
    ? await db.select().from(sourceProposals).where(eq(sourceProposals.status, status))
    : await db.select().from(sourceProposals);
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
