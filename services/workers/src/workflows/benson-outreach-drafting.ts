import { env } from '@social-agent/core';
import { runBensonOutreachDraftingBatch } from '@social-agent/core/sponsor-outreach/benson-drafting';
import { shouldSkipBackgroundLlm } from '@social-agent/core/llm-spend';

const INTERVAL_MS = 24 * 60 * 60 * 1000;
const INITIAL_DELAY_MS = 5 * 60 * 1000;

let timer: ReturnType<typeof setInterval> | null = null;
let initialTimer: ReturnType<typeof setTimeout> | null = null;

async function tick(): Promise<void> {
  if (env.DEMO_MODE && !env.BENSON_AUTO_DRAFT_ENABLED) return;
  if (!env.OPENAI_API_KEY?.trim()) return;
  const gate = await shouldSkipBackgroundLlm('outreach');
  if (gate.skip) return;
  try {
    const result = await runBensonOutreachDraftingBatch();
    if (result.drafted > 0) {
      console.log('[benson-outreach-drafting] drafted', result.drafted, result.emailIds);
    }
  } catch (err) {
    console.warn('[benson-outreach-drafting] failed:', err);
  }
}

export const bensonOutreachDraftingWorker = {
  start() {
    initialTimer = setTimeout(() => {
      void tick();
      timer = setInterval(() => void tick(), INTERVAL_MS);
    }, INITIAL_DELAY_MS);
  },
  stop() {
    if (initialTimer) clearTimeout(initialTimer);
    if (timer) clearInterval(timer);
    initialTimer = null;
    timer = null;
  },
};
