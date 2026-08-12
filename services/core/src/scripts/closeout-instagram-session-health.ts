import { verifyInstagramProductionSession } from '../curator-watchlist/instagram-session-verify.js';
import {
  markInstagramAuthenticationRequired,
  reconcileAuthenticatedInstagramSuccess,
  shouldMarkInstagramAuthenticationRequired,
} from '../curator-watchlist/auth-reconciliation.js';
import { getCuratorSourceHealth } from '../curator-watchlist/store.js';
import { isSchedulerLive } from '../curator-watchlist/scheduler.js';
import { db } from '../db.js';
import { sourceWatchers } from '../schema.js';
import { eq } from 'drizzle-orm';

const JAS_CANONICAL = 'instagram:account:jasfoodjourney';

const [jas] = await db
  .select({ id: sourceWatchers.id })
  .from(sourceWatchers)
  .where(eq(sourceWatchers.canonicalKey, JAS_CANONICAL))
  .limit(1);

if (!jas) {
  console.error(JSON.stringify({ ok: false, error: 'jasfoodjourney source not found' }));
  process.exit(1);
}

const report = await verifyInstagramProductionSession();

if (
  shouldMarkInstagramAuthenticationRequired({
    pageKind: report.pageKind,
    sessionStatus: report.pageKind === 'feed' ? 'ready' : report.pageKind,
  })
) {
  await markInstagramAuthenticationRequired(
    jas.id,
    report.error ?? `Instagram ${report.pageKind}`,
  );
} else if (report.pageKind === 'feed' || report.authenticatedHandle) {
  await reconcileAuthenticatedInstagramSuccess(jas.id);
}

const health = await getCuratorSourceHealth(jas.id);
const schedulerLive = await isSchedulerLive();

console.log(
  JSON.stringify(
    {
      ok: true,
      session: {
        pageKind: report.pageKind,
        authenticatedHandle: report.authenticatedHandle,
        sessionOpened: report.sessionOpened,
        error: report.error,
      },
      curatorHealth: health,
      schedulerLive,
      jasSourceCount: 1,
    },
    null,
    2,
  ),
);

process.exit(health?.authenticationRequired ? 2 : 0);
