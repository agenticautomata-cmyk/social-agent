import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { workerHeartbeats, workerJobRuns } from '../schema.js';

const workerIds = ['gmail-inbox-sync', 'gmail-inbox-digest'];

const beats = await db.select().from(workerHeartbeats).where(inArray(workerHeartbeats.workerId, workerIds));
console.log('Worker heartbeats:');
console.log(JSON.stringify(beats, null, 2));

for (const workerId of workerIds) {
  const runs = await db
    .select()
    .from(workerJobRuns)
    .where(eq(workerJobRuns.workerId, workerId))
    .orderBy(desc(workerJobRuns.startedAt))
    .limit(3);
  console.log(`\nRecent ${workerId} runs:`);
  console.log(
    JSON.stringify(
      runs.map((r) => ({
        startedAt: r.startedAt?.toISOString(),
        finishedAt: r.finishedAt?.toISOString(),
        success: r.success,
        error: r.errorMessage?.slice(0, 160) ?? null,
      })),
      null,
      2,
    ),
  );
}

process.exit(0);
