import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import {
  creatorAccounts,
  creatorPlatformConnections,
  type CreatorPlatformConnection,
  type Platform,
} from '../schema.js';
import { getOrCreateAccount } from '../creator-analytics/import.js';
import { decryptToken, encryptToken } from './token-crypto.js';
import { getTikTokOAuthConfig } from './config.js';

const DEFAULT_TIKTOK_USERNAME = 'kelliekc';

export type PublicConnectionStatus =
  | 'connected'
  | 'disconnected'
  | 'expired'
  | 'error'
  | 'credentials_missing';

export type TikTokConnectionStatusResponse = {
  platform: 'tiktok';
  status: PublicConnectionStatus;
  credentialsConfigured: boolean;
  credentialsMissing: string[];
  demoMode: boolean;
  connection: {
    id: string;
    platformUsername: string | null;
    platformUserId: string | null;
    scopes: string[];
    connectedAt: string | null;
    expiresAt: string | null;
    lastError: string | null;
  } | null;
  setupInstructions: string | null;
};

export async function resolveActiveTikTokCreatorAccountId(): Promise<string> {
  const [connectedRow] = await db
    .select({
      platformUsername: creatorPlatformConnections.platformUsername,
    })
    .from(creatorPlatformConnections)
    .where(
      and(
        eq(creatorPlatformConnections.platform, 'tiktok'),
        eq(creatorPlatformConnections.status, 'connected'),
      ),
    )
    .limit(1);

  if (connectedRow?.platformUsername) {
    return getOrCreateAccount('tiktok', connectedRow.platformUsername);
  }

  return getOrCreateAccount('tiktok', DEFAULT_TIKTOK_USERNAME);
}

/** @deprecated use resolveActiveTikTokCreatorAccountId — kept for call-site compat */
export async function resolveDefaultTikTokCreatorAccountId(): Promise<string> {
  return resolveActiveTikTokCreatorAccountId();
}

export async function getActiveTikTokConnectionRow(): Promise<CreatorPlatformConnection | null> {
  const rows = await db
    .select()
    .from(creatorPlatformConnections)
    .where(eq(creatorPlatformConnections.platform, 'tiktok'))
    .orderBy(desc(creatorPlatformConnections.updatedAt))
    .limit(5);

  return (
    rows.find((r) => r.status === 'connected') ??
    rows.find((r) => r.status === 'error') ??
    rows[0] ??
    null
  );
}

/** Move OAuth connection onto the account that receives live video sync. */
export async function alignTikTokConnectionToAccount(targetAccountId: string): Promise<void> {
  const rows = await db
    .select()
    .from(creatorPlatformConnections)
    .where(
      and(
        eq(creatorPlatformConnections.platform, 'tiktok'),
        eq(creatorPlatformConnections.status, 'connected'),
      ),
    );

  const now = new Date();
  for (const row of rows) {
    if (row.creatorAccountId === targetAccountId) continue;
    await db
      .update(creatorPlatformConnections)
      .set({ creatorAccountId: targetAccountId, updatedAt: now })
      .where(eq(creatorPlatformConnections.id, row.id));
  }

  await db
    .update(creatorAccounts)
    .set({ connectionStatus: 'import_only', updatedAt: now })
    .where(
      and(
        eq(creatorAccounts.platform, 'tiktok'),
        eq(creatorAccounts.connectionStatus, 'oauth_connected'),
      ),
    );

  await db
    .update(creatorAccounts)
    .set({ connectionStatus: 'oauth_connected', updatedAt: now })
    .where(eq(creatorAccounts.id, targetAccountId));
}

export async function getTikTokConnectionRow(
  creatorAccountId: string,
): Promise<CreatorPlatformConnection | null> {
  const rows = await db
    .select()
    .from(creatorPlatformConnections)
    .where(
      and(
        eq(creatorPlatformConnections.creatorAccountId, creatorAccountId),
        eq(creatorPlatformConnections.platform, 'tiktok'),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getTikTokConnectionStatus(demoMode: boolean): Promise<TikTokConnectionStatusResponse> {
  const cfg = getTikTokOAuthConfig();
  const row = await getActiveTikTokConnectionRow();

  let status: PublicConnectionStatus;
  if (!cfg.configured) {
    status = 'credentials_missing';
  } else if (!row || row.status === 'disconnected') {
    status = 'disconnected';
  } else if (row.status === 'error') {
    status = 'error';
  } else if (
    row.expiresAt &&
    row.expiresAt.getTime() < Date.now() &&
    row.status === 'connected'
  ) {
    status = 'expired';
  } else if (row.status === 'connected') {
    status = 'connected';
  } else {
    status = row.status as PublicConnectionStatus;
  }

  const setupInstructions = !cfg.configured
    ? 'Add TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, and TIKTOK_REDIRECT_URI to your .env file, then register the redirect URI in the TikTok Developer Portal.'
    : null;

  return {
    platform: 'tiktok',
    status,
    credentialsConfigured: cfg.configured,
    credentialsMissing: cfg.missing,
    demoMode,
    connection:
      row && row.status !== 'disconnected'
        ? {
            id: row.id,
            platformUsername: row.platformUsername,
            platformUserId: row.platformUserId,
            scopes: row.scopes ?? [],
            connectedAt: row.connectedAt?.toISOString() ?? null,
            expiresAt: row.expiresAt?.toISOString() ?? null,
            lastError: row.lastError,
          }
        : row?.lastError
          ? {
              id: row.id,
              platformUsername: row.platformUsername,
              platformUserId: row.platformUserId,
              scopes: row.scopes ?? [],
              connectedAt: row.connectedAt?.toISOString() ?? null,
              expiresAt: row.expiresAt?.toISOString() ?? null,
              lastError: row.lastError,
            }
          : null,
    setupInstructions,
  };
}

export async function upsertTikTokConnection(input: {
  creatorAccountId: string;
  platformUserId: string;
  platformUsername: string | null;
  accessToken: string;
  refreshToken: string | null;
  scopes: string[];
  expiresAt: Date;
}): Promise<CreatorPlatformConnection> {
  const now = new Date();
  const values = {
    creatorAccountId: input.creatorAccountId,
    platform: 'tiktok' as Platform,
    platformUserId: input.platformUserId,
    platformUsername: input.platformUsername,
    accessTokenEncrypted: encryptToken(input.accessToken),
    refreshTokenEncrypted: input.refreshToken ? encryptToken(input.refreshToken) : null,
    scopes: input.scopes,
    expiresAt: input.expiresAt,
    connectedAt: now,
    disconnectedAt: null,
    status: 'connected' as const,
    lastError: null,
    updatedAt: now,
  };

  const existing = await getTikTokConnectionRow(input.creatorAccountId);
  if (existing) {
    const [updated] = await db
      .update(creatorPlatformConnections)
      .set(values)
      .where(eq(creatorPlatformConnections.id, existing.id))
      .returning();
    await db
      .update(creatorAccounts)
      .set({ connectionStatus: 'oauth_connected', updatedAt: now })
      .where(eq(creatorAccounts.id, input.creatorAccountId));
    return updated!;
  }

  const [created] = await db.insert(creatorPlatformConnections).values(values).returning();
  await db
    .update(creatorAccounts)
    .set({ connectionStatus: 'oauth_connected', updatedAt: now })
    .where(eq(creatorAccounts.id, input.creatorAccountId));
  return created!;
}

export async function markConnectionError(
  creatorAccountId: string,
  message: string,
): Promise<void> {
  const existing = await getTikTokConnectionRow(creatorAccountId);
  const now = new Date();
  if (existing) {
    await db
      .update(creatorPlatformConnections)
      .set({ status: 'error', lastError: message, updatedAt: now })
      .where(eq(creatorPlatformConnections.id, existing.id));
    return;
  }
  await db.insert(creatorPlatformConnections).values({
    creatorAccountId,
    platform: 'tiktok',
    status: 'error',
    lastError: message,
    updatedAt: now,
  });
}

export async function disconnectTikTok(creatorAccountId: string): Promise<{
  disconnected: boolean;
  alreadyDisconnected: boolean;
}> {
  const row = await getTikTokConnectionRow(creatorAccountId);
  if (!row || row.status === 'disconnected') {
    return { disconnected: true, alreadyDisconnected: true };
  }

  const now = new Date();
  await db
    .update(creatorPlatformConnections)
    .set({
      status: 'disconnected',
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      expiresAt: null,
      disconnectedAt: now,
      lastError: null,
      updatedAt: now,
    })
    .where(eq(creatorPlatformConnections.id, row.id));

  await db
    .update(creatorAccounts)
    .set({ connectionStatus: 'import_only', updatedAt: now })
    .where(eq(creatorAccounts.id, creatorAccountId));

  return { disconnected: true, alreadyDisconnected: false };
}

/** Server-side only — never expose to API responses. */
export async function getDecryptedAccessToken(creatorAccountId: string): Promise<string | null> {
  const row = await getTikTokConnectionRow(creatorAccountId);
  if (!row?.accessTokenEncrypted || row.status !== 'connected') return null;
  return decryptToken(row.accessTokenEncrypted);
}

/** Server-side only — never expose to API responses. */
export async function getDecryptedRefreshToken(creatorAccountId: string): Promise<string | null> {
  const row = await getTikTokConnectionRow(creatorAccountId);
  if (!row?.refreshTokenEncrypted || row.status !== 'connected') return null;
  return decryptToken(row.refreshTokenEncrypted);
}
