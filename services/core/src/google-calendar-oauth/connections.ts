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
import {
  buildTestingModeRefreshTokenWarnings,
  computeRefreshTokenExpiresAt,
  getGoogleOAuthPublishingStatus,
  GOOGLE_OAUTH_TESTING_TO_PRODUCTION_STEPS,
} from './testing-mode.js';
import { sanitizeGoogleCalendarError } from './errors.js';

/** Internal persisted connection states. */
export type GoogleCalendarConnectionState =
  | 'disconnected'
  | 'authorized_provisioning'
  | 'connected'
  | 'authorized_setup_failed'
  | 'token_refresh_failed'
  | 'revoked'
  | 'error';

export type PublicGoogleCalendarConnectionStatus =
  | 'connected'
  | 'disconnected'
  | 'authorized_setup_failed'
  | 'authorized_provisioning'
  | 'token_refresh_failed'
  | 'revoked'
  | 'expired'
  | 'error'
  | 'credentials_missing';

const TOKEN_USABLE_STATES = new Set<GoogleCalendarConnectionState>([
  'connected',
  'authorized_setup_failed',
  'authorized_provisioning',
  'token_refresh_failed',
  'error',
]);

export type GoogleCalendarConnectionStatusResponse = {
  status: PublicGoogleCalendarConnectionStatus;
  calendarAuthorized: boolean;
  hasValidTokens: boolean;
  canRetryProvisioning: boolean;
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
  oauthPublishingStatus: 'testing' | 'production';
  refreshTokenExpiresAt: string | null;
  healthWarnings: string[];
  productionPublishingRecommendation: string | null;
};

function filterCalendarScopes(scopes: string[]): string[] {
  return scopes.filter((s) => s.includes('/auth/calendar.'));
}

async function getConnectionRow(): Promise<GoogleCalendarConnection | null> {
  const rows = await db
    .select()
    .from(googleCalendarConnections)
    .orderBy(desc(googleCalendarConnections.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}

function mapPublicStatus(
  cfg: ReturnType<typeof getGoogleCalendarOAuthConfig>,
  row: GoogleCalendarConnection | null,
): PublicGoogleCalendarConnectionStatus {
  if (!cfg.configured) return 'credentials_missing';
  if (!row || row.status === 'disconnected') return 'disconnected';
  if (row.status === 'error' && row.accessTokenEncrypted) return 'authorized_setup_failed';
  if (row.status === 'connected' && row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    return 'expired';
  }
  return row.status as PublicGoogleCalendarConnectionStatus;
}

function hasUsableTokens(row: GoogleCalendarConnection | null): boolean {
  return Boolean(row?.accessTokenEncrypted && TOKEN_USABLE_STATES.has(row.status as GoogleCalendarConnectionState));
}

export async function getGoogleCalendarConnectionStatus(): Promise<GoogleCalendarConnectionStatusResponse> {
  const cfg = getGoogleCalendarOAuthConfig();
  let row = await getConnectionRow();

  if (hasUsableTokens(row)) {
    await refreshGoogleCalendarAccessTokenIfNeeded();
    row = await getConnectionRow();
  }

  if (
    row &&
    row.accessTokenEncrypted &&
    (row.status === 'authorized_setup_failed' || row.status === 'error')
  ) {
    const { retryGoogleCalendarProvisioning } = await import('./provisioning.js');
    await retryGoogleCalendarProvisioning();
    row = await getConnectionRow();
  }

  const status = mapPublicStatus(cfg, row);
  const calendarAuthorized = status === 'connected';
  const hasValidTokens = hasUsableTokens(row);
  const canRetryProvisioning = status === 'authorized_setup_failed' && hasValidTokens;

  const connectedAt = row?.connectedAt ?? null;
  const refreshTokenExpiresAt =
    hasValidTokens && connectedAt ? computeRefreshTokenExpiresAt(connectedAt) : null;
  const healthWarnings = buildTestingModeRefreshTokenWarnings({
    connectedAt,
    refreshTokenExpiresAt,
  });
  const oauthPublishingStatus = getGoogleOAuthPublishingStatus();

  const setupInstructions = !cfg.configured
    ? 'Add Google OAuth client credentials to your .env, then connect Google Calendar separately from Gmail.'
    : status === 'authorized_setup_failed'
      ? 'Calendar is authorized but setup needs a retry. Benson will retry automatically, or tap Connect Google Calendar again.'
      : status === 'expired' || status === 'token_refresh_failed' || status === 'revoked' || status === 'error'
        ? 'Google Calendar needs reconnect — tap Connect Google Calendar on Calendar settings.'
        : status === 'disconnected'
          ? 'Google Calendar is not connected. Gmail authorization does not grant Calendar access.'
          : null;

  return {
    status,
    calendarAuthorized,
    hasValidTokens,
    canRetryProvisioning,
    gmailMayBeConnectedSeparately: true,
    configuredScopes: [...GOOGLE_CALENDAR_OAUTH_SCOPES],
    connection: row && row.status !== 'disconnected'
      ? {
          id: row.id,
          email: row.email,
          connectedAt: row.connectedAt?.toISOString() ?? null,
          expiresAt: row.expiresAt?.toISOString() ?? null,
          lastError: row.lastError ? sanitizeGoogleCalendarError(row.lastError) : null,
          scopes: filterCalendarScopes(row.scopes ?? []),
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
    oauthPublishingStatus,
    refreshTokenExpiresAt: refreshTokenExpiresAt?.toISOString() ?? null,
    healthWarnings,
    productionPublishingRecommendation:
      oauthPublishingStatus === 'testing' ? GOOGLE_OAUTH_TESTING_TO_PRODUCTION_STEPS : null,
  };
}

export async function upsertGoogleCalendarConnection(input: {
  email: string | null;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes?: string[];
  availabilityEnabled?: boolean;
  status?: GoogleCalendarConnectionState;
}): Promise<GoogleCalendarConnection> {
  const now = new Date();
  const existing = await getConnectionRow();
  const calendarScopes = filterCalendarScopes(
    input.scopes?.length ? input.scopes : [...GOOGLE_CALENDAR_OAUTH_SCOPES],
  );

  const values = {
    email: null,
    accessTokenEncrypted: encryptToken(input.accessToken),
    refreshTokenEncrypted: input.refreshToken
      ? encryptToken(input.refreshToken)
      : existing?.refreshTokenEncrypted ?? null,
    scopes: calendarScopes.length ? calendarScopes : [...GOOGLE_CALENDAR_OAUTH_SCOPES],
    expiresAt: input.expiresAt,
    connectedAt: now,
    disconnectedAt: null,
    status: input.status ?? ('authorized_provisioning' as const),
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

export async function markGoogleCalendarConnected(): Promise<void> {
  const row = await getConnectionRow();
  if (!row) return;
  await db
    .update(googleCalendarConnections)
    .set({ status: 'connected', lastError: null, updatedAt: new Date() })
    .where(eq(googleCalendarConnections.id, row.id));
}

export async function markGoogleCalendarProvisioningFailed(message: string): Promise<void> {
  const row = await getConnectionRow();
  if (!row) return;
  await db
    .update(googleCalendarConnections)
    .set({
      status: row.accessTokenEncrypted ? 'authorized_setup_failed' : 'error',
      lastError: message.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(eq(googleCalendarConnections.id, row.id));
}

export async function markGoogleCalendarConnectionError(message: string): Promise<void> {
  const row = await getConnectionRow();
  if (!row) {
    await db.insert(googleCalendarConnections).values({
      status: 'error',
      lastError: message.slice(0, 500),
      updatedAt: new Date(),
    });
    return;
  }
  await db
    .update(googleCalendarConnections)
    .set({
      status: row.accessTokenEncrypted ? 'authorized_setup_failed' : 'error',
      lastError: message.slice(0, 500),
      updatedAt: new Date(),
    })
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
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(googleCalendarConnections.id, row.id));
}

export async function getGoogleCalendarAccessToken(): Promise<string | null> {
  await refreshGoogleCalendarAccessTokenIfNeeded();
  const row = await getConnectionRow();
  if (!hasUsableTokens(row)) return null;
  return decryptToken(row!.accessTokenEncrypted!);
}

export async function refreshGoogleCalendarAccessTokenIfNeeded(): Promise<boolean> {
  const row = await getConnectionRow();
  if (!row?.refreshTokenEncrypted || !TOKEN_USABLE_STATES.has(row.status as GoogleCalendarConnectionState)) {
    return false;
  }
  const expiresSoon = !row.expiresAt || row.expiresAt.getTime() < Date.now() + 60_000;
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
    await db
      .update(googleCalendarConnections)
      .set({
        status: 'token_refresh_failed',
        lastError: (json.error ?? 'Token refresh failed').slice(0, 500),
        updatedAt: new Date(),
      })
      .where(eq(googleCalendarConnections.id, row.id));
    return false;
  }

  const expiresAt = json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null;
  const nextStatus =
    row.status === 'authorized_setup_failed' ? 'authorized_setup_failed' : 'connected';
  await db
    .update(googleCalendarConnections)
    .set({
      accessTokenEncrypted: encryptToken(json.access_token),
      expiresAt,
      status: nextStatus,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(googleCalendarConnections.id, row.id));
  return true;
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
      lastError: sanitizeGoogleCalendarError(error).slice(0, 500),
      updatedAt: new Date(),
    })
    .where(eq(googleCalendarConnections.id, row.id));
}

export async function getGoogleCalendarConnectionRow(): Promise<GoogleCalendarConnection | null> {
  return getConnectionRow();
}
