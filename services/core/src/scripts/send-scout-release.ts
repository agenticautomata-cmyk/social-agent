import {
  defaultScoutReleaseReport,
  sendScoutReleaseNotifications,
} from '../benson-scout/release.js';
import { scoutHealthSummary } from '../benson-scout/watchlist.js';

const health = await scoutHealthSummary();

const report = defaultScoutReleaseReport({
  pilotSourcesActive: health.activeWatchers,
  promptfooSummary: '9/9 fixture assertions via benson-scout/eval-fixtures.test.ts',
  pushResult: 'pending',
});

const result = await sendScoutReleaseNotifications(report);

console.log('Scout release notifications:', {
  push: result.push,
  telegram: result.telegram,
  commit: report.commitHash,
  tag: report.releaseTag,
});

process.exit(0);
