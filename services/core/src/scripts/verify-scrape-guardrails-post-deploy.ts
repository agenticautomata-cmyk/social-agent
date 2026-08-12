/**
 * Post-deploy: run one refresh wave and correlate scrape web_search telemetry.
 *   pnpm exec tsx src/scripts/verify-scrape-guardrails-post-deploy.ts
 */
import { and, eq, gte, sql } from 'drizzle-orm';
import { refreshAllSources } from '../source-ingestion/refresh.js';
import { db } from '../db.js';
import { llmUsageEvents, sources } from '../schema.js';
import { env } from '../env.js';
import { shouldSkipBackgroundLlm } from '../llm-spend/index.js';
import { SCRAPE_WEB_SEARCH_PER_REFRESH_CAP } from '../ask-benson/scrape-websearch-guardrails.js';

const gate = await shouldSkipBackgroundLlm('web_search');

const scrapeSources = await db
  .select({ id: sources.id, name: sources.name, type: sources.type, config: sources.config })
  .from(sources)
  .where(eq(sources.active, true));

const scrapeListingCount = scrapeSources.filter((s) => s.type === 'scrape').length;

const waveStartedAt = new Date();
const refresh = await refreshAllSources({ dryRun: false });
const waveFinishedAt = new Date();

const refreshWaveId = `refresh-${refresh.startedAt}`;

const webRows = await db
  .select({
    id: llmUsageEvents.id,
    createdAt: llmUsageEvents.createdAt,
    estimatedCost: llmUsageEvents.estimatedCost,
    metadata: llmUsageEvents.metadata,
  })
  .from(llmUsageEvents)
  .where(
    and(
      gte(llmUsageEvents.createdAt, waveStartedAt),
      eq(llmUsageEvents.source, 'web_search'),
    ),
  );

const scrapeRows = webRows.filter((r) => {
  const m = (r.metadata ?? {}) as Record<string, unknown>;
  return m.caller === 'scrape_listing';
});

const userRows = webRows.filter((r) => {
  const m = (r.metadata ?? {}) as Record<string, unknown>;
  return m.context === 'user' || (!m.context && !m.caller);
});

const waveRows = scrapeRows.filter((r) => {
  const m = (r.metadata ?? {}) as Record<string, unknown>;
  return m.refreshWaveId === refreshWaveId;
});

const listingUrls = waveRows.map((r) => (r.metadata as Record<string, unknown>).listingUrl as string);
const uniqueListingUrls = new Set(listingUrls);

const estimatedCost = waveRows.reduce((sum, r) => sum + Number(r.estimatedCost ?? 0), 0);

const telemetrySample = waveRows.slice(0, 3).map((r) => r.metadata);

const duplicateListingInWave = listingUrls.length !== uniqueListingUrls.size;

console.log(
  JSON.stringify(
    {
      policy: {
        BENSON_WEB_SEARCH_ENABLED: env.BENSON_WEB_SEARCH_ENABLED,
        BENSON_LLM_DAILY_BUDGET_USD: env.BENSON_LLM_DAILY_BUDGET_USD,
        backgroundWebSearchGate: gate,
      },
      refresh: {
        refreshWaveId,
        startedAt: refresh.startedAt,
        finishedAt: refresh.finishedAt,
        durationSec:
          (new Date(refresh.finishedAt).getTime() - new Date(refresh.startedAt).getTime()) / 1000,
        totals: refresh.totals,
      },
      candidates: {
        activeSources: scrapeSources.length,
        scrapeListingSources: scrapeListingCount,
        note: 'Each failed page fetch or discount_watch enrich is a scrape search candidate',
      },
      guardrails: {
        cap: SCRAPE_WEB_SEARCH_PER_REFRESH_CAP,
        actualScrapeWebSearchRows: waveRows.length,
        allScrapeCallerRowsInWindow: scrapeRows.length,
        withinCap: waveRows.length <= SCRAPE_WEB_SEARCH_PER_REFRESH_CAP,
        duplicateListingUrlInWave: duplicateListingInWave,
      },
      blocks: {
        capBlockedEstimate: Math.max(
          0,
          scrapeListingCount - SCRAPE_WEB_SEARCH_PER_REFRESH_CAP - (gate.skip ? scrapeListingCount : 0),
        ),
        note: 'Cap/dedupe/gate blocks are in-process only; infer from candidates vs actual rows',
        backgroundPolicyWouldBlock: gate.skip,
        expectedOpenAiCallsIfGateBlocks: gate.skip ? 0 : null,
      },
      telemetry: {
        rowsWithRequiredFields: waveRows.every((r) => {
          const m = (r.metadata ?? {}) as Record<string, unknown>;
          return (
            m.context === 'background' &&
            m.caller === 'scrape_listing' &&
            m.process === 'worker' &&
            typeof m.sourceId === 'string' &&
            typeof m.refreshWaveId === 'string' &&
            typeof m.listingUrl === 'string'
          );
        }),
        scanRunIdPresentCount: waveRows.filter(
          (r) => typeof (r.metadata as Record<string, unknown>).scanRunId === 'string',
        ).length,
        estimatedCostUsd: estimatedCost,
        sample: telemetrySample,
      },
      askBensonUserContext: {
        userContextRowsInWindow: userRows.length,
        note: 'No refresh-triggered user-context web_search expected',
      },
      verification: {
        fingerprintsNote: 'Check deployment-status separately',
        noDuplicateListingOpenAi: !duplicateListingInWave,
        withinCap: waveRows.length <= SCRAPE_WEB_SEARCH_PER_REFRESH_CAP,
        telemetryOk:
          waveRows.length === 0
            ? gate.skip || scrapeListingCount === 0
            : waveRows.every((r) => {
                const m = (r.metadata ?? {}) as Record<string, unknown>;
                return (
                  m.context === 'background' &&
                  m.caller === 'scrape_listing' &&
                  m.process === 'worker' &&
                  m.sourceId &&
                  m.refreshWaveId &&
                  m.listingUrl
                );
              }),
      },
    },
    null,
    2,
  ),
);
