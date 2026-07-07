import { and, eq } from 'drizzle-orm';
import { db } from '../db.js';
import {
  creatorAccounts,
  creatorPlatformConnections,
  type CreatorPlatformConnection,
  type Platform,
} from '../schema.js';
import { getOrCreateAccount } from '../creator-analytics/import.js';
import { decryptToken, encryptToken } from '../tiktok-oauth/token-crypto.js';
import { getMetaOAuthConfig } from './config.js';
import { META_OAUTH_READ_SCOPES } from './scopes.js';
import { getAnalyticsConnectorSettings } from '../analytics-connectors/settings.js';

const DEFAULT_IG_USERNAME = 'kelliekc';
const DEFAULT_FB_USERNAME = 'kellie-page';

export type PublicConnectionStatus =
  | 'connected'
  | 'disconnected'
  | 'expired'
  | 'error'
  | 'credentials_missing';

export type MetaConnectionStatusResponse = {
  facebook: {
    platform: 'facebook';
    status: PublicConnectionStatus;
    connection: {
      id: string;
      platformUsername: string | null;
      platformUserId: string | null;
      connectedAt: string | null;
      expiresAt: string | null;
      lastError: string | null;
    } | null;
  };
  instagram: {
    platform: 'instagram';
    status: PublicConnectionStatus;
    connection: {
      id: string;
      platformUsername: string | null;
      platformUserId: string | null;
      connectedAt: string | null;
      expiresAt: string | null;
      lastError: string | null;
    } | null;
  };
  credentialsConfigured: boolean;
  credentialsMissing: string[];
  demoMode: boolean;
  setupInstructions: string | null;
  connectorSettings: {
    facebook: { enabled: boolean };
    instagram: { enabled: boolean };
  };
};

export async function resolveDefaultInstagramAccountId(): Promise<string> {
  return getOrCreateAccount('instagram', DEFAULT_IG_USERNAME);
}

export async function resolveDefaultFacebookAccountId(): Promise<string> {
  return getOrCreateAccount('facebook', DEFAULT_FB_USERNAME);
}

async function getConnectionRow(
  creatorAccountId: string,
  platform: Platform,
): Promise<CreatorPlatformConnection | null> {
  const rows = await db
    .select()
    .from(creatorPlatformConnections)
    .where(
      and(
        eq(creatorPlatformConnections.creatorAccountId, creatorAccountId),
        eq(creatorPlatformConnections.platform, platform),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

function mapStatus(
  cfg: ReturnType<typeof getMetaOAuthConfig>,
  row: CreatorPlatformConnection | null,
): PublicConnectionStatus {
  if (!cfg.configured) return 'credentials_missing';
  if (!row || row.status === 'disconnected') return 'disconnected';
  if (row.status === 'error') return 'error';
  if (row.expiresAt && row.expiresAt.getTime() < Date.now() && row.status === 'connected') {
    return 'expired';
  }
  if (row.status === 'connected') return 'connected';
  return row.status as PublicConnectionStatus;
}

function mapConnection(row: CreatorPlatformConnection | null) {
  if (!row || (row.status === 'disconnected' && !row.lastError)) return null;
  return {
    id: row.id,
    platformUsername: row.platformUsername,
    platformUserId: row.platformUserId,
    connectedAt: row.connectedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    lastError: row.lastError,
  };
}

export async function getMetaConnectionStatus(demoMode: boolean): Promise<MetaConnectionStatusResponse> {
  const cfg = getMetaOAuthConfig();
  const [igAccountId, fbAccountId] = await Promise.all([
    resolveDefaultInstagramAccountId(),
    resolveDefaultFacebookAccountId(),
  ]);
  const [igRow, fbRow] = await Promise.all([
    getConnectionRow(igAccountId, 'instagram'),
    getConnectionRow(fbAccountId, 'facebook'),
  ]);

  const setupInstructions = !cfg.configured
    ? 'Add IG_APP_ID, IG_APP_SECRET, and META_REDIRECT_URI to your .env file, then register the redirect URI in the Meta Developer Portal.'
    : null;

  const connectorSettings = await getAnalyticsConnectorSettings();

  return {
    facebook: {
      platform: 'facebook',
      status: mapStatus(cfg, fbRow),
      connection: mapConnection(fbRow),
    },
    instagram: {
      platform: 'instagram',
      status: mapStatus(cfg, igRow),
      connection: mapConnection(igRow),
    },
    credentialsConfigured: cfg.configured,
    credentialsMissing: cfg.missing,
    demoMode,
    setupInstructions,
    connectorSettings: {
      facebook: { enabled: connectorSettings.facebook.enabled },
      instagram: { enabled: connectorSettings.instagram.enabled },
    },
  };
}

async function upsertPlatformConnection(input: {
  creatorAccountId: string;
  platform: Platform;
  platformUserId: string;
  platformUsername: string | null;
  accessToken: string;
  expiresAt: Date | null;
  metadata?: Record<string, unknown>;
}): Promise<CreatorPlatformConnection> {
  const now = new Date();
  const values = {
    creatorAccountId: input.creatorAccountId,
    platform: input.platform,
    platformUserId: input.platformUserId,
    platformUsername: input.platformUsername,
    accessTokenEncrypted: encryptToken(input.accessToken),
    refreshTokenEncrypted: null,
    scopes: [...META_OAUTH_READ_SCOPES],
    expiresAt: input.expiresAt,
    connectedAt: now,
    disconnectedAt: null,
    status: 'connected' as const,
    lastError: null,
    metadata: (input.metadata ?? {}) as object,
    updatedAt: now,
  };

  const existing = await getConnectionRow(input.creatorAccountId, input.platform);
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

export async function upsertMetaConnections(input: {
  instagramAccountId: string;
  facebookAccountId: string;
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  igBusinessId: string | null;
  igUsername: string | null;
  tokenExpiresAt: Date | null;
}): Promise<void> {
  await upsertPlatformConnection({
    creatorAccountId: input.facebookAccountId,
    platform: 'facebook',
    platformUserId: input.pageId,
    platformUsername: input.pageName,
    accessToken: input.pageAccessToken,
    expiresAt: input.tokenExpiresAt,
    metadata: { linkedIgBusinessId: input.igBusinessId },
  });

  if (input.igBusinessId) {
    await upsertPlatformConnection({
      creatorAccountId: input.instagramAccountId,
      platform: 'instagram',
      platformUserId: input.igBusinessId,
      platformUsername: input.igUsername,
      accessToken: input.pageAccessToken,
      expiresAt: input.tokenExpiresAt,
      metadata: { facebookPageId: input.pageId },
    });
  }
}

export async function markMetaConnectionError(
  instagramAccountId: string,
  facebookAccountId: string,
  message: string,
): Promise<void> {
  const now = new Date();
  for (const [accountId, platform] of [
    [instagramAccountId, 'instagram'],
    [facebookAccountId, 'facebook'],
  ] as const) {
    const existing = await getConnectionRow(accountId, platform);
    if (existing) {
      await db
        .update(creatorPlatformConnections)
        .set({ status: 'error', lastError: message, updatedAt: now })
        .where(eq(creatorPlatformConnections.id, existing.id));
    } else {
      await db.insert(creatorPlatformConnections).values({
        creatorAccountId: accountId,
        platform,
        status: 'error',
        lastError: message,
        updatedAt: now,
      });
    }
  }
}

export async function disconnectMeta(): Promise<{ disconnected: boolean }> {
  const [igAccountId, fbAccountId] = await Promise.all([
    resolveDefaultInstagramAccountId(),
    resolveDefaultFacebookAccountId(),
  ]);
  const now = new Date();
  for (const [accountId, platform] of [
    [igAccountId, 'instagram'],
    [fbAccountId, 'facebook'],
  ] as const) {
    const row = await getConnectionRow(accountId, platform);
    if (!row) continue;
    await db
      .update(creatorPlatformConnections)
      .set({
        status: 'disconnected',
        accessTokenEncrypted: null,
        refreshTokenEncrypted: null,
        expiresAt: null,
        disconnectedAt: now,
        updatedAt: now,
      })
      .where(eq(creatorPlatformConnections.id, row.id));
    await db
      .update(creatorAccounts)
      .set({ connectionStatus: 'import_only', updatedAt: now })
      .where(eq(creatorAccounts.id, accountId));
  }
  return { disconnected: true };
}

export async function getDecryptedMetaToken(
  creatorAccountId: string,
  platform: 'instagram' | 'facebook',
): Promise<string | null> {
  const row = await getConnectionRow(creatorAccountId, platform);
  if (!row?.accessTokenEncrypted || row.status !== 'connected') return null;
  return decryptToken(row.accessTokenEncrypted);
}
