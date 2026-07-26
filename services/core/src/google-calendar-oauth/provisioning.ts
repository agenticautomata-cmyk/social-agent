import {
  BENSON_DEDICATED_CALENDAR_NAME,
  GOOGLE_CALENDAR_API_BASE,
} from './constants.js';
import {
  getGoogleCalendarAccessToken,
  getGoogleCalendarConnectionRow,
  markGoogleCalendarConnected,
  markGoogleCalendarProvisioningFailed,
  setDedicatedGoogleCalendar,
} from './connections.js';
import { sanitizeGoogleCalendarError } from './errors.js';
import { hasGoogleCalendarFreebusyScope } from './scopes.js';

type GoogleApiError = { error?: { message?: string; errors?: Array<{ reason?: string }> } };

async function calendarApiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getGoogleCalendarAccessToken();
  if (!token) throw new Error('Google Calendar authorization required');

  return fetch(`${GOOGLE_CALENDAR_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

/** GET /calendars/{calendarId} — supported by calendar.app.created for app-created calendars. */
export async function getAppCreatedCalendarById(
  calendarId: string,
): Promise<{ id: string; summary: string } | null> {
  const res = await calendarApiFetch(`/calendars/${encodeURIComponent(calendarId)}`);
  if (res.status === 404) return null;
  const json = (await res.json()) as { id?: string; summary?: string } & GoogleApiError;
  if (!res.ok) {
    throw new Error(json.error?.message ?? 'Failed to load dedicated calendar');
  }
  if (!json.id) return null;
  return { id: json.id, summary: json.summary ?? BENSON_DEDICATED_CALENDAR_NAME };
}

/** POST /calendars — create the dedicated Benson calendar (calendar.app.created). */
export async function insertDedicatedBensonCalendar(): Promise<{ id: string; name: string }> {
  const res = await calendarApiFetch('/calendars', {
    method: 'POST',
    body: JSON.stringify({
      summary: BENSON_DEDICATED_CALENDAR_NAME,
      timeZone: 'America/Chicago',
      description: 'Creator operations calendar created and managed by Benson',
    }),
  });
  const json = (await res.json()) as { id?: string; summary?: string } & GoogleApiError;
  if (!res.ok || !json.id) {
    throw new Error(json.error?.message ?? 'Failed to create dedicated calendar');
  }
  return { id: json.id, name: json.summary ?? BENSON_DEDICATED_CALENDAR_NAME };
}

/**
 * Ensures KC Kellie — Benson exists without calendarList.list.
 * Uses stored ID + Calendars.get, or Calendars.insert when missing/404.
 */
export async function ensureDedicatedBensonCalendar(): Promise<{
  id: string;
  name: string;
  created: boolean;
}> {
  const row = await getGoogleCalendarConnectionRow();
  const storedId = row?.dedicatedCalendarId;

  if (storedId) {
    const existing = await getAppCreatedCalendarById(storedId);
    if (existing) {
      return {
        id: existing.id,
        name: existing.summary,
        created: false,
      };
    }
  }

  const created = await insertDedicatedBensonCalendar();
  await setDedicatedGoogleCalendar({ calendarId: created.id, calendarName: created.name });
  return { id: created.id, name: created.name, created: true };
}

async function verifyFreebusyAccess(): Promise<boolean> {
  const row = await getGoogleCalendarConnectionRow();
  if (!row || !hasGoogleCalendarFreebusyScope(row.scopes ?? [])) return false;

  const now = new Date();
  const later = new Date(now.getTime() + 60 * 60 * 1000);
  const res = await calendarApiFetch('/freeBusy', {
    method: 'POST',
    body: JSON.stringify({
      timeMin: now.toISOString(),
      timeMax: later.toISOString(),
      items: [{ id: 'primary' }],
    }),
  });
  return res.ok;
}

/** Provisions dedicated calendar and confirms narrow-scope API access. Never calls calendarList.list. */
export async function completeGoogleCalendarProvisioning(): Promise<
  { ok: true; dedicatedCalendarId: string } | { ok: false; error: string }
> {
  try {
    const dedicated = await ensureDedicatedBensonCalendar();
    const freebusyOk = await verifyFreebusyAccess();
    if (!freebusyOk) {
      return { ok: false, error: 'FreeBusy verification failed' };
    }
    await markGoogleCalendarConnected();
    return { ok: true, dedicatedCalendarId: dedicated.id };
  } catch (err) {
    const raw = err instanceof Error ? err.message : 'Calendar provisioning failed';
    await markGoogleCalendarProvisioningFailed(raw);
    return { ok: false, error: sanitizeGoogleCalendarError(raw) };
  }
}

export async function retryGoogleCalendarProvisioning(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const row = await getGoogleCalendarConnectionRow();
  if (!row?.accessTokenEncrypted) {
    return { ok: false, error: 'Google Calendar not authorized' };
  }
  const result = await completeGoogleCalendarProvisioning();
  if (!result.ok) return result;
  return { ok: true };
}
