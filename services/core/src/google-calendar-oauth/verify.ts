import { getGoogleCalendarConnectionRow } from './connections.js';
import { hasGoogleCalendarAppCreatedScope, hasGoogleCalendarFreebusyScope } from './scopes.js';
import { completeGoogleCalendarProvisioning } from './provisioning.js';

export type GoogleCalendarVerifyResult =
  | {
      ok: true;
      /** Non-PII label — Calendar OAuth does not grant email/userinfo scopes. */
      accountLabel: 'Google Calendar connected';
      dedicatedCalendarId: string;
      freebusyOk: boolean;
    }
  | { ok: false; error: string };

/** Confirms Calendar API access via Calendars.get/insert + FreeBusy — never calendarList.list. */
export async function verifyGoogleCalendarApiAccess(): Promise<GoogleCalendarVerifyResult> {
  const row = await getGoogleCalendarConnectionRow();
  const scopes = row?.scopes ?? [];
  if (!hasGoogleCalendarAppCreatedScope(scopes)) {
    return { ok: false, error: 'calendar.app.created scope not granted' };
  }

  const provisioned = await completeGoogleCalendarProvisioning();
  if (!provisioned.ok) {
    return { ok: false, error: provisioned.error };
  }

  return {
    ok: true,
    accountLabel: 'Google Calendar connected',
    dedicatedCalendarId: provisioned.dedicatedCalendarId,
    freebusyOk: hasGoogleCalendarFreebusyScope(scopes),
  };
}
