// Worker runtime — generic state-machine pump.
// Each worker advertises its input state, claims items in batches with FOR
// UPDATE SKIP LOCKED, processes them, advances state.

import { eq, and, sql } from 'drizzle-orm';
import {
  db,
  contentItems,
  workflowRuns,
  type ContentItem,
  type ContentState,
  type NewWorkflowRun,
  env,
} from '@social-agent/core';

export interface WorkerHandler {
  name: string;
  inputState: ContentState;
  // Process a single content item; return the new state.
  // Throw to mark the item failed (with retry).
  process: (item: ContentItem) => Promise<{ nextState: ContentState; payload?: unknown }>;
  batchSize?: number;
  pollIntervalMs?: number;
}

const MAX_RETRY = 5;

export function createWorker(handler: WorkerHandler) {
  const batchSize = handler.batchSize ?? env.WORKER_BATCH_SIZE;
  const pollMs = handler.pollIntervalMs ?? env.WORKER_POLL_INTERVAL_MS;

  let stopped = false;

  async function tick(): Promise<number> {
    // Claim items via FOR UPDATE SKIP LOCKED to allow horizontal scaling.
    const claimedRaw = await db.execute(sql`
      WITH claimed AS (
        SELECT id FROM content_items
        WHERE state = ${handler.inputState}
        ORDER BY created_at
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE content_items SET state = state, updated_at = now()
      FROM claimed
      WHERE content_items.id = claimed.id
      RETURNING content_items.*
    `);
    const claimed = claimedRaw as unknown as ContentItem[];

    for (const item of claimed) {
      const start = Date.now();
      const runRow: NewWorkflowRun = {
        contentItemId: item.id,
        workflowName: handler.name,
        stateFrom: handler.inputState,
        startedAt: new Date(),
        status: 'running',
      };
      const [run] = await db.insert(workflowRuns).values(runRow).returning({ id: workflowRuns.id });

      try {
        const { nextState, payload } = await handler.process(item);

        await db
          .update(contentItems)
          .set({
            state: nextState,
            lastError: null,
            retryCount: 0,
          })
          .where(eq(contentItems.id, item.id));

        await db
          .update(workflowRuns)
          .set({
            stateTo: nextState,
            finishedAt: new Date(),
            durationMs: Date.now() - start,
            status: 'success',
            payload: (payload ?? null) as object | null,
          })
          .where(eq(workflowRuns.id, run!.id));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const retryCount = (item.retryCount ?? 0) + 1;
        const nextState: ContentState =
          retryCount >= MAX_RETRY ? 'failed' : handler.inputState;

        await db
          .update(contentItems)
          .set({
            state: nextState,
            retryCount,
            lastError: message,
          })
          .where(eq(contentItems.id, item.id));

        await db
          .update(workflowRuns)
          .set({
            stateTo: nextState,
            finishedAt: new Date(),
            durationMs: Date.now() - start,
            status: 'failed',
            error: message,
          })
          .where(eq(workflowRuns.id, run!.id));
      }
    }

    return claimed.length;
  }

  async function loop() {
    while (!stopped) {
      try {
        const processed = await tick();
        if (processed === 0) {
          await new Promise((r) => setTimeout(r, pollMs));
        }
      } catch (err) {
        console.error(`[${handler.name}] loop error:`, err);
        await new Promise((r) => setTimeout(r, pollMs * 2));
      }
    }
  }

  return {
    name: handler.name,
    start: () => {
      console.log(`[worker] ${handler.name} listening on state=${handler.inputState}`);
      void loop();
    },
    stop: () => {
      stopped = true;
    },
  };
}

// ============================================================================
// CRON-STYLE worker (no input state — fires on interval)
// ============================================================================

export function createCronWorker(opts: {
  name: string;
  intervalMs: number;
  run: () => Promise<unknown>;
}) {
  let stopped = false;

  async function loop() {
    while (!stopped) {
      try {
        await opts.run();
      } catch (err) {
        console.error(`[${opts.name}] cron error:`, err);
      }
      await new Promise((r) => setTimeout(r, opts.intervalMs));
    }
  }

  return {
    name: opts.name,
    start: () => {
      console.log(`[worker] ${opts.name} cron every ${opts.intervalMs}ms`);
      void loop();
    },
    stop: () => {
      stopped = true;
    },
  };
}

// Suppress unused import warning when only types are used elsewhere
export const _unusedAnd = and;
