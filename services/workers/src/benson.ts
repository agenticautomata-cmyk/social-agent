// Benson brain workers — always-on intelligence loop for the pre-alpha stack.
// Runs independently of the legacy video pipeline (main.ts):
//   - benson-pulse:        TikTok sync + delta detection + GPT progress brief (4 h)
//   - tiktok-token-refresh: proactive OAuth refresh before token expiry (15 min)
//   - milestone-watch:     faster TikTok sync + 5K detection when near goal (15 min)
//   - opportunity-refresh: source scrape + Benson scoring (6 h)
//   - source-health:       broken feed detection + replacement proposals (24 h)
//   - expired-event-sweep: hard-delete past-dated opportunities (24 h)
//   - benson-learning:     synthesize durable insights from feedback + behavior (6 h)
//   - benson-discovery:    autonomous KC web scouting for new local opportunities (12 h)
//   - program-library-enrichment: gradual verify/enrich saved programs (6 h, max 1/run)

import { bensonPulseWorker } from './workflows/benson-pulse.js';
import { tiktokTokenRefreshWorker } from './workflows/tiktok-token-refresh.js';
import { milestoneWatchWorker } from './workflows/milestone-watch.js';
import { opportunityRefreshWorker } from './workflows/opportunity-refresh.js';
import { sourceHealthWorker } from './workflows/source-health.js';
import { expiredEventSweepWorker } from './workflows/expired-event-sweep.js';
import { bensonLearningWorker } from './workflows/benson-learning.js';
import { bensonDiscoveryWorker } from './workflows/benson-discovery.js';
import { eventbriteKcDiscoveryWorker } from './workflows/eventbrite-kc-discovery.js';
import { outreachDispatchWorker } from './workflows/outreach-dispatch.js';
import { bensonOutreachDraftingWorker } from './workflows/benson-outreach-drafting.js';
import { gmailInboxSyncWorker } from './workflows/gmail-inbox-sync.js';
import { gmailInboxDigestWorker } from './workflows/gmail-inbox-digest.js';
import { gmailDiscoverySyncWorker } from './workflows/gmail-discovery-sync.js';
import { outreachFollowUpWorker } from './workflows/outreach-follow-up.js';
import { shareIntakeMediaWorker } from './workflows/share-intake-media.js';
import { unpostedDraftWorker } from './workflows/unposted-draft-intelligence.js';
import { earlySignalsWorker } from './workflows/early-signals.js';
import { curatorWatchlistCheckWorker } from './workflows/curator-watchlist-check.js';
import { programLibraryEnrichmentWorker } from './workflows/program-library-enrichment.js';
import { releaseWorkersStartLock } from '@social-agent/core/workers-runtime/lock';

const workers = [
  bensonPulseWorker,
  tiktokTokenRefreshWorker,
  milestoneWatchWorker,
  opportunityRefreshWorker,
  sourceHealthWorker,
  expiredEventSweepWorker,
  bensonLearningWorker,
  bensonDiscoveryWorker,
  eventbriteKcDiscoveryWorker,
  outreachDispatchWorker,
  bensonOutreachDraftingWorker,
  outreachFollowUpWorker,
  gmailInboxSyncWorker,
  gmailInboxDigestWorker,
  gmailDiscoverySyncWorker,
  shareIntakeMediaWorker,
  unpostedDraftWorker,
  earlySignalsWorker,
  curatorWatchlistCheckWorker,
  programLibraryEnrichmentWorker,
];

console.log(`[benson] starting ${workers.length} Benson brain workers`);
for (const w of workers) w.start();

const shutdown = (sig: string) => {
  console.log(`[benson] ${sig} — stopping workers`);
  for (const w of workers) w.stop();
  releaseWorkersStartLock(process.env.BENSON_REPO_ROOT);
  setTimeout(() => process.exit(0), 500);
};

process.on('exit', () => {
  releaseWorkersStartLock(process.env.BENSON_REPO_ROOT);
});

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
