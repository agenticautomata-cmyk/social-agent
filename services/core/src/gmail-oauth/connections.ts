import { desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { gmailConnections, type GmailConnection } from '../schema.js';
import { decryptToken, encryptToken } from '../tiktok-oauth/token-crypto.js';
import { getGmailOAuthConfig } from './config.js';
import { GMAIL_OAUTH_SCOPES } from './scopes.js';

export type PublicGmailConnectionStatus =
  | 'connected'
  | 'disconnected'
  | 'expired'
  | 'error'
  | 'credentials_missing';

export type GmailConnectionStatusResponse = {
  status: PublicGmailConnectionStatus;
  connection: {
    id: string;
    email: string | null;
    connectedAt: string | null;
    expiresAt: string | null;
    lastError: string | null;
    scopes: string[];
  } | null;
  credentialsConfigured: boolean;
  credentialsMissing: string[];
  setupInstructions: string | null;
};

async function getConnectionRow(): Promise<GmailConnection | null> {
  const rows = await db
    .select()
    .from(gmailConnections)
    .orderBy(desc(gmailConnections.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}

function mapStatus(
  cfg: ReturnType<typeof getGmailOAuthConfig>,
  row: GmailConnection | null,
): PublicGmailConnectionStatus {
  if (!cfg.configured) return 'credentials_missing';
  if (!row || row.status === 'disconnected') return 'disconnected';
  if (row.status === 'error') return 'error';
  if (row.expiresAt && row.expiresAt.getTime() < Date.now() && row.status === 'connected') {
    return 'expired';
  }
  if (row.status === 'connected') return 'connected';
  return row.status as PublicGmailConnectionStatus;
}

export async function getGmailConnectionStatus(): Promise<GmailConnectionStatusResponse> {
  const cfg = getGmailOAuthConfig();
  let row = await getConnectionRow();

  // Refresh expired access tokens before reporting status — keeps live send ready.
  if (row?.status === 'connected' && row.accessTokenEncrypted) {
    await refreshGmailAccessTokenIfNeeded();
    row = await getConnectionRow();
  }

  const status = mapStatus(cfg, row);
  const setupInstructions = !cfg.configured
    ? 'Add GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REDIRECT_URI to your .env, then register the redirect URI in Google Cloud Console.'
    : status === 'expired' || status === 'error'
      ? 'Gmail needs reconnect — tap Connect Gmail on this page so approved pitches send live from Kellie\'s inbox.'
      : null;

  return {
    status,
    connection: row && row.status !== 'disconnected'
      ? {
          id: row.id,
          email: row.email,
          connectedAt: row.connectedAt?.toISOString() ?? null,
          expiresAt: row.expiresAt?.toISOString() ?? null,
          lastError: row.lastError,
          scopes: row.scopes ?? [],
        }
      : null,
    credentialsConfigured: cfg.configured,
    credentialsMissing: cfg.missing,
    setupInstructions,
  };
}

export async function upsertGmailConnection(input: {
  email: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes?: string[];
}): Promise<GmailConnection> {
  const now = new Date();
  const values = {
    email: input.email,
    accessTokenEncrypted: encryptToken(input.accessToken),
    refreshTokenEncrypted: input.refreshToken ? encryptToken(input.refreshToken) : null,
    scopes: input.scopes?.length ? input.scopes : [...GMAIL_OAUTH_SCOPES],
    expiresAt: input.expiresAt,
    connectedAt: now,
    disconnectedAt: null,
    status: 'connected' as const,
    lastError: null,
    updatedAt: now,
  };

  const existing = await getConnectionRow();
  if (existing) {
    const [updated] = await db
      .update(gmailConnections)
      .set(values)
      .where(eq(gmailConnections.id, existing.id))
      .returning();
    return updated!;
  }

  const [created] = await db.insert(gmailConnections).values(values).returning();
  return created!;
}

export async function markGmailConnectionError(message: string): Promise<void> {
  const existing = await getConnectionRow();
  const now = new Date();
  if (existing) {
    await db
      .update(gmailConnections)
      .set({ status: 'error', lastError: message, updatedAt: now })
      .where(eq(gmailConnections.id, existing.id));
    return;
  }
  await db.insert(gmailConnections).values({
    status: 'error',
    lastError: message,
    updatedAt: now,
  });
}

export async function disconnectGmail(): Promise<{ disconnected: boolean }> {
  const row = await getConnectionRow();
  if (!row) return { disconnected: false };
  const now = new Date();
  await db
    .update(gmailConnections)
    .set({
      status: 'disconnected',
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      expiresAt: null,
      disconnectedAt: now,
      updatedAt: now,
    })
    .where(eq(gmailConnections.id, row.id));
  return { disconnected: true };
}

export async function getDecryptedGmailTokens(): Promise<{
  accessToken: string;
  refreshToken: string | null;
  email: string | null;
} | null> {
  const row = await getConnectionRow();
  if (!row?.accessTokenEncrypted || row.status !== 'connected') return null;
  return {
    accessToken: decryptToken(row.accessTokenEncrypted)!,
    refreshToken: row.refreshTokenEncrypted ? decryptToken(row.refreshTokenEncrypted) : null,
    email: row.email,
  };
}

export async function refreshGmailAccessTokenIfNeeded(): Promise<string | null> {
  const row = await getConnectionRow();
  if (!row?.accessTokenEncrypted || row.status !== 'connected') return null;

  const needsRefresh =
    row.expiresAt && row.expiresAt.getTime() < Date.now() + 60_000;
  if (!needsRefresh) return decryptToken(row.accessTokenEncrypted);

  const refreshToken = row.refreshTokenEncrypted
    ? decryptToken(row.refreshTokenEncrypted)
    : null;
  if (!refreshToken) return decryptToken(row.accessTokenEncrypted);

  const cfg = getGmailOAuthConfig();
  const secret = cfg.configured ? getGmailOAuthConfig() : null;
  if (!cfg.clientId || !cfg.effectiveRedirectUri) return null;

  const { getGmailClientSecret } = await import('./config.js');
  const clientSecret = getGmailClientSecret();
  if (!clientSecret) return null;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !json.access_token) {
    const msg = json.error_description ?? json.error ?? 'Gmail token refresh failed';
    await markGmailConnectionError(msg);
    return null;
  }

  const expiresAt = json.expires_in
    ? new Date(Date.now() + json.expires_in * 1000)
    : null;

  await db
    .update(gmailConnections)
    .set({
      accessTokenEncrypted: encryptToken(json.access_token),
      expiresAt,
      status: 'connected',
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(gmailConnections.id, row.id));

  return json.access_token;
}
