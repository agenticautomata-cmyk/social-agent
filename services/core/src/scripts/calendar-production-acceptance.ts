/**
 * Production Calendar acceptance — requires live Google Calendar authorization.
 * Run after completing OAuth at /calendar/settings.
 */
import {
  createCalendarItem,
  confirmCalendarItem,
  getCalendarItem,
  updateCalendarItem,
} from '../creator-calendar/items.js';
import {
  disconnectGoogleCalendar,
  getGoogleCalendarConnectionStatus,
} from '../google-calendar-oauth/connections.js';
import {
  ensureDedicatedBensonCalendar,
  exportCalendarItemToGoogle,
  fetchGoogleBusyBlocks,
  removeFromGoogleCalendar,
  updateGoogleCalendarEvent,
  detectConflicts,
} from '../google-calendar-oauth/sync.js';
import { verifyGoogleCalendarApiAccess } from '../google-calendar-oauth/verify.js';
import { getGmailConnectionStatus } from '../gmail-oauth/connections.js';
import { BENSON_DEDICATED_CALENDAR_NAME } from '../google-calendar-oauth/constants.js';
import { GOOGLE_CALENDAR_API_BASE } from '../google-calendar-oauth/constants.js';
import { getGoogleCalendarAccessToken } from '../google-calendar-oauth/connections.js';

const report: Record<string, unknown> = { steps: [] as string[] };

function step(name: string, detail?: unknown) {
  (report.steps as string[]).push(name);
  console.log(`✓ ${name}`, detail ?? '');
}

async function main() {
  const status = await getGoogleCalendarConnectionStatus();
  if (!status.calendarAuthorized) {
    console.error('BLOCKED: Calendar not authorized. Complete OAuth at https://benson.kckellie.com/calendar/settings');
    process.exit(2);
  }

  const verified = await verifyGoogleCalendarApiAccess();
  if (!verified.ok) {
    console.error('BLOCKED: Calendar API verification failed:', verified.error);
    process.exit(2);
  }
  step('Calendar API verified', verified);

  const dedicated = await ensureDedicatedBensonCalendar();
  if (dedicated.name !== BENSON_DEDICATED_CALENDAR_NAME) {
    throw new Error(`Wrong dedicated calendar name: ${dedicated.name}`);
  }
  step('Dedicated calendar', dedicated);

  const start = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

  const tentative = await createCalendarItem({
    title: 'Benson acceptance — tentative',
    itemType: 'creator_task',
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    planningStatus: 'tentative',
  });
  if (tentative.sync?.googleEventId) throw new Error('Tentative item exported unexpectedly');
  step('Benson-only item does not auto-export');

  const confirmed = await confirmCalendarItem(tentative.id);
  if (!confirmed) throw new Error('Failed to confirm calendar item');
  const exported = await exportCalendarItemToGoogle(confirmed.id);
  step('Exported to Google', exported);

  let dupFailed = false;
  try {
    await exportCalendarItemToGoogle(confirmed.id);
  } catch {
    dupFailed = true;
  }
  if (!dupFailed) throw new Error('Duplicate export should fail');
  step('Duplicate export blocked');

  await updateCalendarItem(confirmed.id, {
    title: 'Benson acceptance — updated',
    location: 'Kansas City, MO',
  });
  await updateGoogleCalendarEvent(confirmed.id);
  step('Google event updated');

  const token = await getGoogleCalendarAccessToken();
  const evRes = await fetch(
    `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(exported.calendarId)}/events/${encodeURIComponent(exported.googleEventId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!evRes.ok) throw new Error('Event not found in Google Calendar');
  const evJson = (await evRes.json()) as { summary?: string };
  if (!evJson.summary?.includes('updated')) throw new Error('Google event title not updated');
  step('Verified event in Google Calendar');

  const busy = await fetchGoogleBusyBlocks({ from: start, to: end, calendarIds: ['primary'] });
  const conflicts = detectConflicts(start, end, busy);
  step('FreeBusy query', { busyBlocks: busy.length, conflicts: conflicts.length });

  await removeFromGoogleCalendar(confirmed.id);
  const afterRemove = await getCalendarItem(confirmed.id);
  if (!afterRemove || afterRemove.sync?.syncStatus !== 'removed_from_google') {
    throw new Error('Benson item not preserved after Google removal');
  }
  step('Removed from Google; Benson item preserved');

  const gmail = await getGmailConnectionStatus();
  step('Gmail regression', { status: gmail.status });

  console.log('\nACCEPTANCE PASSED\n', JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error('ACCEPTANCE FAILED:', err);
  process.exit(1);
});
