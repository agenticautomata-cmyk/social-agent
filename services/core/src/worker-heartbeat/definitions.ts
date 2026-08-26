export type WorkerDefinition = {
  workerId: string;
  displayName: string;
  scheduleLabel: string;
  /** Expected max gap between successful runs before status becomes delayed (ms). */
  staleAfterMs: number;
};

export const PRODUCTION_WORKERS: WorkerDefinition[] = [
  { workerId: 'benson-pulse', displayName: 'Benson Pulse', scheduleLabel: 'every 4h', staleAfterMs: 5 * 60 * 60 * 1000 },
  { workerId: 'tiktok-token-refresh', displayName: 'TikTok token refresh', scheduleLabel: 'every 15m', staleAfterMs: 45 * 60 * 1000 },
  { workerId: 'milestone-watch', displayName: 'Milestone watch', scheduleLabel: 'every 15m', staleAfterMs: 45 * 60 * 1000 },
  { workerId: 'opportunity-refresh', displayName: 'Opportunity refresh', scheduleLabel: 'every 6h', staleAfterMs: 8 * 60 * 60 * 1000 },
  { workerId: 'source-health', displayName: 'Source health', scheduleLabel: 'every 24h', staleAfterMs: 30 * 60 * 60 * 1000 },
  { workerId: 'expired-event-sweep', displayName: 'Expired event sweep', scheduleLabel: 'every 24h', staleAfterMs: 30 * 60 * 60 * 1000 },
  { workerId: 'benson-learning', displayName: 'Benson Learning', scheduleLabel: 'every 6h', staleAfterMs: 8 * 60 * 60 * 1000 },
  { workerId: 'benson-discovery', displayName: 'Benson Discovery', scheduleLabel: 'every 12h', staleAfterMs: 16 * 60 * 60 * 1000 },
  {
    workerId: 'eventbrite-kc-discovery',
    displayName: 'Eventbrite KC Discovery',
    scheduleLabel: 'every 24h',
    staleAfterMs: 30 * 60 * 60 * 1000,
  },
  { workerId: 'outreach-dispatch', displayName: 'Outreach dispatch', scheduleLabel: 'poll', staleAfterMs: 30 * 60 * 1000 },
  { workerId: 'benson-outreach-drafting', displayName: 'Outreach drafting', scheduleLabel: 'poll', staleAfterMs: 30 * 60 * 1000 },
  { workerId: 'outreach-follow-up', displayName: 'Outreach follow-up', scheduleLabel: 'poll', staleAfterMs: 30 * 60 * 1000 },
  { workerId: 'gmail-inbox-sync', displayName: 'Gmail inbox sync', scheduleLabel: 'poll', staleAfterMs: 30 * 60 * 1000 },
  { workerId: 'gmail-inbox-digest', displayName: 'Gmail digest', scheduleLabel: 'poll', staleAfterMs: 6 * 60 * 60 * 1000 },
  { workerId: 'gmail-discovery-sync', displayName: 'Gmail discovery sync', scheduleLabel: 'poll', staleAfterMs: 30 * 60 * 1000 },
  { workerId: 'share-intake-media', displayName: 'Share intake media', scheduleLabel: 'poll', staleAfterMs: 15 * 60 * 1000 },
  { workerId: 'unposted-draft-intelligence', displayName: 'Unposted draft intelligence', scheduleLabel: 'poll', staleAfterMs: 30 * 60 * 1000 },
  { workerId: 'early-signals', displayName: 'Early Signals', scheduleLabel: 'every 6h', staleAfterMs: 8 * 60 * 60 * 1000 },
  {
    workerId: 'curator-watchlist-check',
    displayName: 'Curator Watchlist Check',
    scheduleLabel: 'every 4h',
    staleAfterMs: 6 * 60 * 60 * 1000,
  },
  {
    workerId: 'program-library-enrichment',
    displayName: 'Program Library enrichment',
    scheduleLabel: 'every 6h',
    staleAfterMs: 8 * 60 * 60 * 1000,
  },
];

export function workerDefinition(workerId: string): WorkerDefinition | undefined {
  return PRODUCTION_WORKERS.find((w) => w.workerId === workerId);
}
