/** In-request counters for Home memory stabilization verification (not global caches). */

export type HomeComputationMetrics = {
  inventoryLoadCount: number;
  sponsorIntelComputeCount: number;
};

let metrics: HomeComputationMetrics = {
  inventoryLoadCount: 0,
  sponsorIntelComputeCount: 0,
};

export function beginHomeComputationMetrics(): void {
  metrics = { inventoryLoadCount: 0, sponsorIntelComputeCount: 0 };
}

export function resetHomeComputationMetricsForTests(): void {
  beginHomeComputationMetrics();
}

export function getHomeComputationMetrics(): HomeComputationMetrics {
  return { ...metrics };
}

export function recordHomeInventoryLoad(): void {
  metrics.inventoryLoadCount += 1;
}

export function recordHomeSponsorIntelCompute(): void {
  metrics.sponsorIntelComputeCount += 1;
}

export function readProcessRssKb(): number | null {
  try {
    const rss = process.memoryUsage().rss;
    return Number.isFinite(rss) ? Math.round(rss / 1024) : null;
  } catch {
    return null;
  }
}

export type HomeComputationDiagnostic = {
  event: 'home_computation_started' | 'home_computation_joined' | 'home_computation_finished';
  joinedExisting?: boolean;
  inventoryLoadCount: number;
  sponsorIntelComputeCount: number;
  elapsedMs?: number;
  rssBeforeKb: number | null;
  rssAfterKb: number | null;
};

export function logHomeComputationDiagnostic(diag: HomeComputationDiagnostic): void {
  console.info('[pre-alpha/home-memory]', JSON.stringify(diag));
}
