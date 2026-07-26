import {
  defaultCalendarReleaseReport,
  sendCalendarReleaseNotifications,
} from '../benson-calendar/release.js';

const acceptancePassed = process.argv.includes('--acceptance-passed');

const report = defaultCalendarReleaseReport({
  acceptancePassed,
  pushResult: acceptancePassed ? 'pending' : 'blocked — acceptance not passed',
});

const result = await sendCalendarReleaseNotifications(report);
console.log('Calendar release notifications:', { ...result, commit: report.commitHash, tag: report.releaseTag });

process.exit(acceptancePassed && result.push.sent ? 0 : acceptancePassed ? 0 : 2);
