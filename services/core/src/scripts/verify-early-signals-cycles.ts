/**
 * Prove early-signals can register + complete N consecutive job runs without FK errors.
 * Does not change production interval; invokes the same record/run path as the cron worker.
 */
import { runEarlySignalPipeline, seedDefaultWatchers } from '../early-signals/index.js';
import {
  ensureWorkerRegistered,
  recordWorkerRunFailure,
  recordWorkerRunStart,
  recordWorkerRunSuccess,
} from '../worker-heartbeat/index.js';

const CYCLES = Number(process.argv[2] || 3);
const WORKER = 'early-signals';

async function oneCycle(i: number): Promise<void> {
  const start = Date.now();
  await ensureWorkerRegistered(WORKER);
  const runId = await recordWorkerRunStart(WORKER);
  try {
    if (i === 0) await seedDefaultWatchers();
    const result = await runEarlySignalPipeline();
    await recordWorkerRunSuccess(WORKER, runId, Date.now() - start);
    console.log(
      JSON.stringify({
        cycle: i + 1,
        runId,
        ok: true,
        signalsCreated: result.signalsCreated,
        watchersFailed: result.watchersFailed,
        errors: result.errors.slice(0, 3),
        durationMs: Date.now() - start,
      }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordWorkerRunFailure(WORKER, runId, Date.now() - start, message);
    console.error(JSON.stringify({ cycle: i + 1, runId, ok: false, error: message }));
    throw err;
  }
}

await ensureWorkerRegistered(WORKER);
for (let i = 0; i < CYCLES; i++) {
  await oneCycle(i);
}
console.log(`OK: ${CYCLES} consecutive early-signals cycles without FK errors`);
