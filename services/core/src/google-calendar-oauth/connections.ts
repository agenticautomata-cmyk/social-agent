import { desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { googleCalendarConnections, type GoogleCalendarConnection } from '../schema.js';
import { decryptToken, encryptToken } from '../tiktok-oauth/token-crypto.js';
import {
  getGoogleCalendarClientId,
  getGoogleCalendarClientSecret,
  getGoogleCalendarOAuthConfig,
} from './config.js';
import { GOOGLE_CALENDAR_OAUTH_SCOPES } from './scopes.js';

export type PublicGoogleCalendarConnectionStatus =
  | 'connected'
  | 'disconnected'
  | 'expired'
  | 'error'
  | 'credentials_missing';

export type GoogleCalendarConnectionStatusResponse = {
  status: PublicGoogleCalendarConnectionStatus;
  /** Separate from Gmail — Calendar may require its own authorization. */
  calendarAuthorized: boolean;
  gmailMayBeConnectedSeparately: true;
  connection: {
    id: string;
    email: string | null;
    connectedAt: string | null;
    expiresAt: string | null;
    lastError: string | null;
    scopes: string[];
    selectedCalendarId: string | null;
    selectedCalendarName: string | null;
    dedicatedCalendarId: string | null;
    dedicatedCalendarName: string | null;
    availabilityEnabled: boolean;
    lastSuccessfulSyncAt: string | null;
    lastFailedSyncAt: string | null;
  } | null;
  credentialsConfigured: boolean;
  credentialsMissing: string[];
  setupInstructions: string | null;
  configuredScopes: readonly string[];
};

async function getConnectionRow(): Promise<GoogleCalendarConnection | null> {
  const rows = await db
    .select()
    .from(googleCalendarConnections)
    .orderBy(desc(googleCalendarConnections.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}

function mapStatus(
  cfg: ReturnType<typeof getGoogleCalendarOAuthConfig>,
  row: GoogleCalendarConnection | null,
): PublicGoogleCalendarConnectionStatus {
  if (!cfg.configured) return 'credentials_missing';
  if (!row || row.status === 'disconnected') return 'disconnected';
  if (row.status === 'error') return 'error';
  if (row.expiresAt && row.expiresAt.getTime() < Date.now() && row.status === 'connected') {
    return 'expired';
  }
  if (row.status === 'connected') return 'connected';
  return row.status as PublicGoogleCalendarConnectionStatus;
}

export async function getGoogleCalendarConnectionStatus(): Promise<GoogleCalendarConnectionStatusResponse> {
  const cfg = getGoogleCalendarOAuthConfig();
  let row = await getConnectionRow();

  if (row?.status === 'connected' && row.accessTokenEncrypted) {
    await refreshGoogleCalendarAccessTokenIfNeeded();
    row = await getConnectionRow();
  }

  const status = mapStatus(cfg, row);
  const calendarAuthorized = status === 'connected';

  const setupInstructions = !cfg.configured
    ? 'Add Google OAuth client credentials to your .env, then connect Google Calendar separately from Gmail.'
    : status === 'expired' || status === 'error'
      ? 'Google Calendar needs reconnect — tap Connect Google Calendar on Calendar settings.'
      : status === 'disconnected'
        ? 'Google Calendar is not connected. Gmail authorization does not grant Calendar access.'
        : null;

  return {
    status,
    calendarAuthorized,
    gmailMayBeConnectedSeparately: true,
    configuredScopes: [...GOOGLE_CALENDAR_OAUTH_SCOPES],
    connection: row && row.status !== 'disconnected'
      ? {
          id: row.id,
          email: row.email,
          connectedAt: row.connectedAt?.toISOString() ?? null,
          expiresAt: row.expiresAt?.toISOString() ?? null,
          lastError: row.lastError,
          scopes: row.scopes ?? [],
          selectedCalendarId: row.selectedCalendarId,
          selectedCalendarName: row.selectedCalendarName,
          dedicatedCalendarId: row.dedicatedCalendarId,
          dedicatedCalendarName: row.dedicatedCalendarName,
          availabilityEnabled: row.availabilityEnabled,
          lastSuccessfulSyncAt: row.lastSuccessfulSyncAt?.toISOString() ?? null,
          lastFailedSyncAt: row.lastFailedSyncAt?.toISOString() ?? null,
        }
      : null,
    credentialsConfigured: cfg.configured,
    credentialsMissing: cfg.missing,
    setupInstructions,
  };
}

export async function upsertGoogleCalendarConnection(input: {
  email: string | null;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes?: string[];
  availabilityEnabled?: boolean;
}): Promise<GoogleCalendarConnection> {
  const now = new Date();
  const existing = await getConnectionRow();

  const values = {
    email: input.email ?? existing?.email ?? null,
    accessTokenEncrypted: encryptToken(input.accessToken),
    refreshTokenEncrypted: input.refreshToken
      ? encryptToken(input.refreshToken)
      : existing?.refreshTokenEncrypted ?? null,
    scopes: input.scopes?.length ? input.scopes : [...GOOGLE_CALENDAR_OAUTH_SCOPES],
    expiresAt: input.expiresAt,
    connectedAt: now,
    disconnectedAt: null,
    status: 'connected' as const,
    lastError: null,
    availabilityEnabled: input.availabilityEnabled ?? true,
    updatedAt: now,
  };

  if (existing) {
    const [updated] = await db
      .update(googleCalendarConnections)
      .set(values)
      .where(eq(googleCalendarConnections.id, existing.id))
      .returning();
    return updated!;
  }

  const [created] = await db.insert(googleCalendarConnections).values(values).returning();
  return created!;
}

export async function markGoogleCalendarConnectionError(message: string): Promise<void> {
  const row = await getConnectionRow();
  if (!row) {
    await db.insert(googleCalendarConnections).values({
      status: 'error',
      lastError: message,
      updatedAt: new Date(),
    });
    return;
  }
  await db
    .update(googleCalendarConnections)
    .set({ status: 'error', lastError: message, updatedAt: new Date() })
    .where(eq(googleCalendarConnections.id, row.id));
}

export async function disconnectGoogleCalendar(): Promise<void> {
  const row = await getConnectionRow();
  if (!row) return;
  await db
    .update(googleCalendarConnections)
    .set({
      status: 'disconnected',
      disconnectedAt: new Date(),
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      updatedAt: new Date(),
    })
    .where(eq(googleCalendarConnections.id, row.id));
}

export async function getGoogleCalendarAccessToken(): Promise<string | null> {
  await refreshGoogleCalendarAccessTokenIfNeeded();
  const row = await getConnectionRow();
  if (!row?.accessTokenEncrypted || row.status !== 'connected') return null;
  return decryptToken(row.accessTokenEncrypted);
}

export async function refreshGoogleCalendarAccessTokenIfNeeded(): Promise<boolean> {
  const row = await getConnectionRow();
  if (!row?.refreshTokenEncrypted || row.status !== 'connected') return false;
  const expiresSoon = row.expiresAt && row.expiresAt.getTime() < Date.now() + 60_000;
  if (!expiresSoon) return false;

  const clientId = getGoogleCalendarClientId();
  const secret = getGoogleCalendarClientSecret();
  if (!clientId || !secret) return false;

  const refreshToken = decryptToken(row.refreshTokenEncrypted);
  if (!refreshToken) return false;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: secret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };

  if (!res.ok || !json.access_token) {
    await markGoogleCalendarConnectionError(json.error ?? 'Token refresh failed');
    return false;
  }

  const expiresAt = json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null;
  await db
    .update(googleCalendarConnections)
    .set({
      accessTokenEncrypted: encryptToken(json.access_token),
      expiresAt,
      status: 'connected',
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(googleCalendarConnections.id, row.id));
  return true;
}

export async function updateGoogleCalendarSelection(input: {
  selectedCalendarId: string;
  selectedCalendarName: string;
}): Promise<void> {
  const row = await getConnectionRow();
  if (!row) throw new Error('Google Calendar not connected');
  await db
    .update(googleCalendarConnections)
    .set({
      selectedCalendarId: input.selectedCalendarId,
      selectedCalendarName: input.selectedCalendarName,
      updatedAt: new Date(),
    })
    .where(eq(googleCalendarConnections.id, row.id));
}

export async function setDedicatedGoogleCalendar(input: {
  calendarId: string;
  calendarName: string;
}): Promise<void> {
  const row = await getConnectionRow();
  if (!row) throw new Error('Google Calendar not connected');
  await db
    .update(googleCalendarConnections)
    .set({
      dedicatedCalendarId: input.calendarId,
      dedicatedCalendarName: input.calendarName,
      selectedCalendarId: input.calendarId,
      selectedCalendarName: input.calendarName,
      updatedAt: new Date(),
    })
    .where(eq(googleCalendarConnections.id, row.id));
}

export async function recordGoogleCalendarSyncSuccess(): Promise<void> {
  const row = await getConnectionRow();
  if (!row) return;
  await db
    .update(googleCalendarConnections)
    .set({ lastSuccessfulSyncAt: new Date(), lastError: null, updatedAt: new Date() })
    .where(eq(googleCalendarConnections.id, row.id));
}

export async function recordGoogleCalendarSyncFailure(error: string): Promise<void> {
  const row = await getConnectionRow();
  if (!row) return;
  await db
    .update(googleCalendarConnections)
    .set({
      lastFailedSyncAt: new Date(),
      lastError: error.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(eq(googleCalendarConnections.id, row.id));
}

export async function getGoogleCalendarConnectionRow(): Promise<GoogleCalendarConnection | null> {
  return getConnectionRow();
}
