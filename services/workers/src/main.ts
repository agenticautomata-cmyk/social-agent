// Boots all workers in a single process. Suitable for local dev and small
// deployments. For horizontal scale, run each worker file as its own process.

import { plannerWorker } from './workflows/planner.js';
import { scriptWriterWorker } from './workflows/script-writer.js';
import { approvalGateWorker } from './workflows/approval-gate.js';
import { personaPickerWorker } from './workflows/persona-picker.js';
import { avatarStartWorker, avatarPollWorker } from './workflows/avatar-render.js';
import { postProductionWorker } from './workflows/post-production.js';
import { schedulerWorker } from './workflows/scheduler.js';
import { publisherWorker } from './workflows/publisher.js';
import { tokenRotationWorker } from './workflows/token-rotation.js';
import { analyticsIngestWorker } from './workflows/analytics-ingest.js';

const workers = [
  plannerWorker,
  scriptWriterWorker,
  approvalGateWorker,
  personaPickerWorker,
  avatarStartWorker,
  avatarPollWorker,
  postProductionWorker,
  schedulerWorker,
  publisherWorker,
  tokenRotationWorker,
  analyticsIngestWorker,
];

console.log(`[main] starting ${workers.length} workers`);
for (const w of workers) w.start();

const shutdown = (sig: string) => {
  console.log(`[main] ${sig} — stopping workers`);
  for (const w of workers) w.stop();
  setTimeout(() => process.exit(0), 500);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
