import { GOOGLE_CALENDAR_API_BASE } from './constants.js';
import { getGoogleCalendarAccessToken } from './connections.js';
import { hasGoogleCalendarAppCreatedScope, hasGoogleCalendarFreebusyScope } from './scopes.js';
import { getGoogleCalendarConnectionRow } from './connections.js';

export type GoogleCalendarVerifyResult =
  | { ok: true; accountLabel: string; appCreatedCalendars: number; freebusyOk: boolean }
  | { ok: false; error: string };

/** Confirms Calendar API access with granted scopes — not merely OAuth callback success. */
export async function verifyGoogleCalendarApiAccess(): Promise<GoogleCalendarVerifyResult> {
  const token = await getGoogleCalendarAccessToken();
  if (!token) return { ok: false, error: 'No Calendar access token after OAuth' };

  const row = await getGoogleCalendarConnectionRow();
  const scopes = row?.scopes ?? [];
  if (!hasGoogleCalendarAppCreatedScope(scopes)) {
    return { ok: false, error: 'calendar.app.created scope not granted' };
  }

  const listRes = await fetch(`${GOOGLE_CALENDAR_API_BASE}/users/me/calendarList`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const listJson = (await listRes.json()) as {
    items?: Array<{ id: string; summary?: string }>;
    error?: { message?: string };
  };
  if (!listRes.ok) {
    return { ok: false, error: listJson.error?.message ?? 'Calendar list API failed' };
  }

  let freebusyOk = false;
  if (hasGoogleCalendarFreebusyScope(scopes)) {
    const now = new Date();
    const later = new Date(now.getTime() + 60 * 60 * 1000);
    const fbRes = await fetch(`${GOOGLE_CALENDAR_API_BASE}/freeBusy`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timeMin: now.toISOString(),
        timeMax: later.toISOString(),
        items: [{ id: 'primary' }],
      }),
    });
    freebusyOk = fbRes.ok;
    if (!freebusyOk) {
      const fbJson = (await fbRes.json()) as { error?: { message?: string } };
      return { ok: false, error: fbJson.error?.message ?? 'FreeBusy API failed' };
    }
  }

  const accountLabel = row?.email ?? 'Google Calendar connected';
  return {
    ok: true,
    accountLabel,
    appCreatedCalendars: listJson.items?.length ?? 0,
    freebusyOk,
  };
}
