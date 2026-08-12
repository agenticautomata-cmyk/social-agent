import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { sourceWatchers } from '../schema.js';

const FOUR_H = 4 * 60 * 60 * 1000;
const id = '6cd867ad-9bdf-441b-b30f-d51bed11376b';

await db
  .update(sourceWatchers)
  .set({ checkFrequencyMs: FOUR_H, updatedAt: new Date() })
  .where(eq(sourceWatchers.id, id));

const [row] = await db
  .select({
    checkFrequencyMs: sourceWatchers.checkFrequencyMs,
    lastSuccessfulCheck: sourceWatchers.lastSuccessfulCheck,
    authenticationRequired: sourceWatchers.authenticationRequired,
    sessionStatus: sourceWatchers.sessionStatus,
  })
  .from(sourceWatchers)
  .where(eq(sourceWatchers.id, id));

const next =
  row?.lastSuccessfulCheck != null
    ? new Date(row.lastSuccessfulCheck.getTime() + FOUR_H).toISOString()
    : null;

console.log(
  JSON.stringify(
    {
      checkFrequencyMs: row?.checkFrequencyMs,
      lastSuccessfulCheck: row?.lastSuccessfulCheck,
      nextScheduledCheck: next,
      authenticationRequired: row?.authenticationRequired,
      sessionStatus: row?.sessionStatus,
    },
    null,
    2,
  ),
);
