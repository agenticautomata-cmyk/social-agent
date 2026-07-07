// Boots all workers in a single process. Suitable for local dev and small
// deployments. For horizontal scale, run each worker file as its own process.

import { featureFlags } from '@social-agent/core/feature-flags';
import { plannerWorker } from './workflows/planner.js';
import { scriptWriterWorker } from './workflows/script-writer.js';
import { approvalGateWorker } from './workflows/approval-gate.js';
import { scannerWorker } from './workflows/scanner.js';
import { personaPickerWorker } from './workflows/persona-picker.js';
import { avatarStartWorker, avatarPollWorker } from './workflows/avatar-render.js';
import { postProductionWorker } from './workflows/post-production.js';
import { schedulerWorker } from './workflows/scheduler.js';
import { publisherWorker } from './workflows/publisher.js';
import { tokenRotationWorker } from './workflows/token-rotation.js';
import { analyticsIngestWorker } from './workflows/analytics-ingest.js';
import { creatorAnalyticsSyncWorker } from './workflows/creator-analytics-sync.js';

/** Always-on workers: planning, drafting, approval gate. */
const coreWorkers = featureFlags.enableKcScanner
  ? [scriptWriterWorker, approvalGateWorker, scannerWorker]
  : [plannerWorker, scriptWriterWorker, approvalGateWorker];

/** Video, post-production, publishing, and platform maintenance workers. */
const videoPipelineWorkers = [
  personaPickerWorker,
  avatarStartWorker,
  avatarPollWorker,
  postProductionWorker,
  schedulerWorker,
  publisherWorker,
  tokenRotationWorker,
  analyticsIngestWorker,
  creatorAnalyticsSyncWorker,
];

const workers = featureFlags.disableVideoPipeline
  ? coreWorkers
  : [...coreWorkers, ...videoPipelineWorkers];

if (featureFlags.disableVideoPipeline) {
  console.log(
    '[main] DISABLE_VIDEO_PIPELINE=true — skipping video/post-production/publishing workers; pipeline ends at script_approved',
  );
}

if (featureFlags.enableKcScanner) {
  console.log(
    '[main] ENABLE_KC_SCANNER=true — Reddit scanner active; planner disabled; script-writer skips ingested rows',
  );
}

console.log(`[main] starting ${workers.length} workers`);
for (const w of workers) w.start();

const shutdown = (sig: string) => {
  console.log(`[main] ${sig} — stopping workers`);
  for (const w of workers) w.stop();
  setTimeout(() => process.exit(0), 500);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
