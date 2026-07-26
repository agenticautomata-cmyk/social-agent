import {
  defaultCalendarReleaseReport,
  sendCalendarReleaseNotifications,
} from '../benson-calendar/release.js';
import { getGoogleCalendarConnectionStatus } from '../google-calendar-oauth/connections.js';
import { getGmailConnectionStatus } from '../gmail-oauth/connections.js';

const acceptancePassed = process.argv.includes('--acceptance-passed');

const calStatus = acceptancePassed ? await getGoogleCalendarConnectionStatus() : null;
const gmailStatus = acceptancePassed ? await getGmailConnectionStatus() : null;

const report = defaultCalendarReleaseReport({
  acceptancePassed,
  pushResult: acceptancePassed ? 'pending' : 'blocked — acceptance not passed',
  dedicatedCalendarId: calStatus?.connection?.dedicatedCalendarId ?? undefined,
  gmailStatus: gmailStatus?.status ?? undefined,
  reconnectVerified: calStatus?.calendarAuthorized ?? false,
});

const result = await sendCalendarReleaseNotifications(report);
console.log('Calendar release notifications:', { ...result, commit: report.commitHash, tag: report.releaseTag });

process.exit(acceptancePassed ? 0 : 2);
