import { processDueOutreachFollowUps } from '@social-agent/core/sponsor-outreach';

const INTERVAL_MS = 6 * 60 * 60 * 1000;
const INITIAL_DELAY_MS = 8 * 60 * 1000;

let timer: ReturnType<typeof setInterval> | null = null;
let initialTimer: ReturnType<typeof setTimeout> | null = null;

async function tick(): Promise<void> {
  try {
    const result = await processDueOutreachFollowUps();
    if (result.drafted.length > 0) {
      console.log(
        `[outreach-follow-up] drafted=${result.drafted.length} processed=${result.processed}`,
      );
    }
  } catch (err) {
    console.warn('[outreach-follow-up] failed:', err instanceof Error ? err.message : err);
  }
}

export const outreachFollowUpWorker = {
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
