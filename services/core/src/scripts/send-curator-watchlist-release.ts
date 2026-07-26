#!/usr/bin/env tsx
import {
  defaultCuratorReleaseReport,
  sendCuratorWatchlistReleaseNotifications,
} from '../curator-watchlist/release.js';
import { listCuratorLeads } from '../curator-watchlist/store.js';

async function main() {
  const leads = await listCuratorLeads({ limit: 10 });
  const report = defaultCuratorReleaseReport({
    eventsExtracted: leads.length,
    verified: leads.filter((l) => l.verificationStatus === 'VERIFIED').length,
    partiallyVerified: leads.filter((l) => l.verificationStatus === 'PARTIALLY_VERIFIED').length,
    conflicted: leads.filter((l) => l.verificationStatus === 'CONFLICTED').length,
    exampleLeads: leads.slice(0, 5).map((l) => ({
      name: l.eventName,
      status: l.verificationStatus,
      date: l.eventDate,
    })),
    testTotals: process.env.CURATOR_TEST_TOTALS ?? 'see CI',
    restartResults: process.env.CURATOR_RESTART_RESULTS ?? 'API + dashboard restarted',
  });

  const result = await sendCuratorWatchlistReleaseNotifications(report);
  console.log(JSON.stringify({ report: { commit: report.commitHash, tag: report.releaseTag }, ...result }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
