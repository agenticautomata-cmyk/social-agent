import type { SourceWatcher } from '../schema.js';
import { runWatcherAdapter } from './adapters.js';
import { mergeKeywordPatterns } from './keywords.js';
import { ACTIVE_KC_SOURCES, KC_SOURCE_CATALOG, type SourceCatalogEntry } from './source-catalog.js';

export type SourceProbeResult = SourceCatalogEntry & {
  httpStatus: number | null;
  fetchOk: boolean;
  adapterOk: boolean;
  signalsExtracted: number;
  sampleExtract: string | null;
  lastTestedAt: string;
  testResult: 'pass' | 'fail' | 'rejected';
  testDetail: string;
};

function catalogEntryToWatcher(entry: SourceCatalogEntry): SourceWatcher {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    sourceName: entry.sourceName,
    sourceUrl: entry.sourceUrl,
    sourceCategory: entry.sourceCategory,
    adapterType: entry.adapterType,
    checkFrequencyMs: entry.checkFrequencyMs,
    lastSuccessfulCheck: null,
    lastChangedAt: null,
    lastFailureAt: null,
    lastFailureMessage: null,
    enabled: entry.catalogStatus === 'active',
    consecutiveFailureCount: 0,
    healthStatus: 'unknown',
    linkedSourceId: null,
    config: entry.config ?? {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function probeCatalogEntry(entry: SourceCatalogEntry): Promise<SourceProbeResult> {
  const testedAt = new Date().toISOString();

  if (entry.catalogStatus === 'rejected') {
    return {
      ...entry,
      httpStatus: null,
      fetchOk: false,
      adapterOk: false,
      signalsExtracted: 0,
      sampleExtract: null,
      lastTestedAt: testedAt,
      testResult: 'rejected',
      testDetail: entry.rejectionReason ?? 'Rejected in catalog',
    };
  }

  const watcher = catalogEntryToWatcher(entry);
  const adapterResult = await runWatcherAdapter(watcher, mergeKeywordPatterns([]), null);

  return {
    ...entry,
    httpStatus: adapterResult.responseStatus,
    fetchOk: adapterResult.ok,
    adapterOk: adapterResult.ok,
    signalsExtracted: adapterResult.results.length,
    sampleExtract: adapterResult.extractedContent?.slice(0, 200) ?? adapterResult.results[0]?.changeSummary ?? null,
    lastTestedAt: testedAt,
    testResult: adapterResult.ok ? 'pass' : 'fail',
    testDetail: adapterResult.ok
      ? adapterResult.results.length > 0
        ? `Parsed ${adapterResult.results.length} signal(s)`
        : 'Fetch OK — no keyword matches in current snapshot (source monitored for changes)'
      : adapterResult.error ?? 'adapter_failed',
  };
}

export async function probeAllCatalogSources(): Promise<{
  results: SourceProbeResult[];
  activePassing: number;
  activeFailing: number;
  rejected: number;
}> {
  const results: SourceProbeResult[] = [];
  for (const entry of KC_SOURCE_CATALOG) {
    results.push(await probeCatalogEntry(entry));
  }
  return {
    results,
    activePassing: results.filter((r) => r.catalogStatus === 'active' && r.testResult === 'pass').length,
    activeFailing: results.filter((r) => r.catalogStatus === 'active' && r.testResult === 'fail').length,
    rejected: results.filter((r) => r.testResult === 'rejected').length,
  };
}

export async function probeActiveSourcesOnly(): Promise<SourceProbeResult[]> {
  const out: SourceProbeResult[] = [];
  for (const entry of ACTIVE_KC_SOURCES) {
    out.push(await probeCatalogEntry(entry));
  }
  return out;
}
