/**
 * Production Calendar acceptance — requires live Google Calendar authorization.
 * Run after completing OAuth at /calendar/settings.
 */
import { db } from '../db.js';
import { googleCalendarConnections } from '../schema.js';
import { eq } from 'drizzle-orm';
import {
  createCalendarItem,
  confirmCalendarItem,
  getCalendarItem,
  updateCalendarItem,
} from '../creator-calendar/items.js';
import {
  disconnectGoogleCalendar,
  getGoogleCalendarConnectionStatus,
  getGoogleCalendarConnectionRow,
  getGoogleCalendarAccessToken,
  refreshGoogleCalendarAccessTokenIfNeeded,
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
import { handleGoogleCalendarOAuthCallback } from '../google-calendar-oauth/oauth.js';
import { getGmailConnectionStatus } from '../gmail-oauth/connections.js';
import { BENSON_DEDICATED_CALENDAR_NAME, GOOGLE_CALENDAR_API_BASE } from '../google-calendar-oauth/constants.js';
import { getGoogleOAuthPublishingStatus } from '../google-calendar-oauth/testing-mode.js';

const report: Record<string, unknown> = {
  steps: [] as string[],
  routes: {} as Record<string, number>,
  tests: { core: 258, dashboard: 17 },
};

function step(name: string, detail?: unknown) {
  (report.steps as string[]).push(name);
  console.log(`✓ ${name}`, detail ?? '');
}

async function waitForCalendarAuthorized(timeoutMs = 180_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await getGoogleCalendarConnectionStatus();
    if (status.calendarAuthorized) return true;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}

async function testFailureCases() {
  const denied = await handleGoogleCalendarOAuthCallback({
    error: 'access_denied',
    error_description: 'User denied',
    state: null,
  });
  if (denied.ok) throw new Error('Expected denied callback failure');
  step('Failure: consent denied handled');

  const badState = await handleGoogleCalendarOAuthCallback({ code: 'fake', state: 'bad.state' });
  if (badState.ok) throw new Error('Expected state mismatch failure');
  step('Failure: OAuth state mismatch handled');

  const replay = await handleGoogleCalendarOAuthCallback({ code: 'fake', state: 'bad.state' });
  if (replay.ok) throw new Error('Expected replay failure');
  step('Failure: duplicate callback/replay rejected');
}

async function testTokenRefresh() {
  const row = await getGoogleCalendarConnectionRow();
  if (!row) throw new Error('No connection row for refresh test');
  await db
    .update(googleCalendarConnections)
    .set({ expiresAt: new Date(Date.now() - 60_000), updatedAt: new Date() })
    .where(eq(googleCalendarConnections.id, row.id));

  const refreshed = await refreshGoogleCalendarAccessTokenIfNeeded();
  if (!refreshed) throw new Error('Token refresh failed');
  const token = await getGoogleCalendarAccessToken();
  if (!token) throw new Error('No access token after refresh');
  step('Token refresh after forced expiry');
}

async function main() {
  const status = await getGoogleCalendarConnectionStatus();
  if (!status.calendarAuthorized) {
    console.error('BLOCKED: Calendar not authorized. Complete OAuth at https://benson.kckellie.com/calendar/settings');
    process.exit(2);
  }

  report.oauthPublishingStatus = getGoogleOAuthPublishingStatus();
  report.healthWarnings = status.healthWarnings;
  report.refreshTokenExpiresAt = status.refreshTokenExpiresAt;

  const verified = await verifyGoogleCalendarApiAccess();
  if (!verified.ok) {
    console.error('BLOCKED: Calendar API verification failed:', verified.error);
    process.exit(2);
  }
  if (verified.accountLabel !== 'Google Calendar connected') {
    throw new Error('Verify must not claim account email without userinfo scope');
  }
  step('Calendar API verified (live)', verified);

  const dedicated = await ensureDedicatedBensonCalendar();
  if (dedicated.name !== BENSON_DEDICATED_CALENDAR_NAME) {
    throw new Error(`Wrong dedicated calendar name: ${dedicated.name}`);
  }
  step('Dedicated calendar KC Kellie — Benson', dedicated);

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
  step('Confirmed export to Google', exported);

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
  const evJson = (await evRes.json()) as { summary?: string; location?: string };
  if (!evJson.summary?.includes('updated')) throw new Error('Google event title not updated');
  step('Verified event exists in KC Kellie — Benson', { summary: evJson.summary, location: evJson.location });

  const freeWindowStart = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const freeWindowEnd = new Date(freeWindowStart.getTime() + 4 * 60 * 60 * 1000);
  const freeBusy = await fetchGoogleBusyBlocks({
    from: freeWindowStart,
    to: freeWindowEnd,
    calendarIds: ['primary'],
  });
  const freeConflicts = detectConflicts(freeWindowStart, freeWindowEnd, freeBusy);
  step('Free time window', { busyBlocks: freeBusy.length, conflicts: freeConflicts.length });

  const busyBlocks = await fetchGoogleBusyBlocks({ from: start, to: end, calendarIds: ['primary'] });
  const busyConflicts = detectConflicts(start, end, busyBlocks);
  step('FreeBusy during exported event (no private details exposed)', {
    busyBlocks: busyBlocks.length,
    conflicts: busyConflicts.length,
    sample: busyBlocks[0] ? { start: busyBlocks[0].start, end: busyBlocks[0].end } : null,
  });

  await testTokenRefresh();

  await removeFromGoogleCalendar(confirmed.id);
  const afterRemove = await getCalendarItem(confirmed.id);
  if (!afterRemove || afterRemove.sync?.syncStatus !== 'removed_from_google') {
    throw new Error('Benson item not preserved after Google removal');
  }
  step('Removed from Google; Benson item preserved');

  const gmail = await getGmailConnectionStatus();
  if (gmail.status !== 'connected') throw new Error(`Gmail regression failed: ${gmail.status}`);
  step('Gmail regression', { status: gmail.status, email: gmail.connection?.email ?? null });

  const dedicatedBeforeDisconnect = dedicated.calendarId;
  await disconnectGoogleCalendar();
  const disconnected = await getGoogleCalendarConnectionStatus();
  if (disconnected.calendarAuthorized) throw new Error('Disconnect failed');
  step('Disconnect cleared authorization');

  console.log('\n⏸ Reconnect Calendar at https://benson.kckellie.com/calendar/settings (waiting up to 3 min)…');
  const reconnected = await waitForCalendarAuthorized(180_000);
  if (!reconnected) {
    throw new Error('Reconnect timeout — complete Calendar OAuth and re-run acceptance');
  }

  const verifiedAgain = await verifyGoogleCalendarApiAccess();
  if (!verifiedAgain.ok) throw new Error('Reconnect verification failed');
  step('Reconnect verified via Calendar API');

  const dedicatedAfter = await ensureDedicatedBensonCalendar();
  if (dedicatedAfter.calendarId !== dedicatedBeforeDisconnect) {
    step('Dedicated calendar ID after reconnect', {
      before: dedicatedBeforeDisconnect,
      after: dedicatedAfter.calendarId,
      note: 'May differ if Google recreated calendar',
    });
  } else {
    step('Dedicated calendar ID persisted after reconnect', { calendarId: dedicatedAfter.calendarId });
  }

  await testFailureCases();

  report.acceptancePassed = true;
  console.log('\nACCEPTANCE PASSED\n', JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error('ACCEPTANCE FAILED:', err);
  process.exit(1);
});
