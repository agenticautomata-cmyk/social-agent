import { getOrCreateAccount } from '../creator-analytics/import.js';
import { getTikTokClientSecret, getTikTokOAuthConfig, maskTikTokClientKey } from './config.js';
import { TIKTOK_OAUTH_REDIRECT_URI_CANONICAL } from './constants.js';
import { createOAuthState, verifyOAuthState } from './oauth-state.js';
import { parseGrantedScopes, requestedScopesList, requestedScopesString } from './scopes.js';
import {
  alignTikTokConnectionToAccount,
  getDecryptedRefreshToken,
  getTikTokConnectionRow,
  markConnectionError,
  resolveActiveTikTokCreatorAccountId,
  upsertTikTokConnection,
} from './connections.js';
import { redactTokenRef } from './token-crypto.js';

const TIKTOK_AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const TIKTOK_USER_INFO_URL = 'https://open.tiktokapis.com/v2/user/info/';

export class TikTokOAuthCredentialsError extends Error {
  readonly code = 'credentials_missing' as const;
  readonly missing: string[];

  constructor(missing: string[]) {
    super('TikTok API credentials are not configured yet.');
    this.name = 'TikTokOAuthCredentialsError';
    this.missing = missing;
  }
}

export type OAuthStartResult =
  | { mode: 'redirect'; authorizationUrl: string; state: string }
  | { mode: 'error'; code: 'credentials_missing'; message: string; missing: string[] };

export type OAuthDebugUrlResult = {
  ok: boolean;
  authorizationUrl: string | null;
  oauthBaseUrl: string;
  redirectUri: string | null;
  effectiveRedirectUri: string | null;
  redirectUriMatchesCanonical: boolean;
  scopes: string;
  scopeList: string[];
  clientKeyMasked: string | null;
  clientKeyPresent: boolean;
  clientSecretPresent: boolean;
  envMode: 'sandbox' | 'production' | 'unknown';
  envModeSource: 'TIKTOK_CLIENT_MODE' | 'client_key_prefix' | 'unknown';
  missing: string[];
  canonicalRedirectUri: string;
};

export function buildOAuthAuthorizeUrl(input: {
  clientKey: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(TIKTOK_AUTHORIZE_URL);
  url.searchParams.set('client_key', input.clientKey);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', requestedScopesString());
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('state', input.state);
  return url.toString();
}

export async function buildOAuthDebugUrl(): Promise<OAuthDebugUrlResult> {
  const cfg = getTikTokOAuthConfig();
  const secretPresent = Boolean(getTikTokClientSecret());
  const scopeList = requestedScopesList();
  const scopes = requestedScopesString();
  const effectiveRedirectUri = cfg.effectiveRedirectUri;
  const redirectUriMatchesCanonical =
    effectiveRedirectUri === TIKTOK_OAUTH_REDIRECT_URI_CANONICAL;

  if (!cfg.configured || !cfg.clientKey || !effectiveRedirectUri) {
    return {
      ok: false,
      authorizationUrl: null,
      oauthBaseUrl: TIKTOK_AUTHORIZE_URL,
      redirectUri: cfg.redirectUri,
      effectiveRedirectUri,
      redirectUriMatchesCanonical,
      scopes,
      scopeList,
      clientKeyMasked: cfg.clientKey ? maskTikTokClientKey(cfg.clientKey) : null,
      clientKeyPresent: Boolean(cfg.clientKey),
      clientSecretPresent: secretPresent,
      envMode: cfg.clientKeyMode,
      envModeSource: cfg.clientKeyModeSource,
      missing: cfg.missing,
      canonicalRedirectUri: TIKTOK_OAUTH_REDIRECT_URI_CANONICAL,
    };
  }

  const creatorAccountId = await resolveActiveTikTokCreatorAccountId();
  const state = createOAuthState(creatorAccountId);
  const authorizationUrl = buildOAuthAuthorizeUrl({
    clientKey: cfg.clientKey,
    redirectUri: effectiveRedirectUri,
    state,
  });

  return {
    ok: true,
    authorizationUrl,
    oauthBaseUrl: TIKTOK_AUTHORIZE_URL,
    redirectUri: cfg.redirectUri,
    effectiveRedirectUri,
    redirectUriMatchesCanonical,
    scopes,
    scopeList,
    clientKeyMasked: maskTikTokClientKey(cfg.clientKey),
    clientKeyPresent: true,
    clientSecretPresent: secretPresent,
    envMode: cfg.clientKeyMode,
    envModeSource: cfg.clientKeyModeSource,
    missing: cfg.missing,
    canonicalRedirectUri: TIKTOK_OAUTH_REDIRECT_URI_CANONICAL,
  };
}

export async function buildOAuthStart(): Promise<OAuthStartResult> {
  const cfg = getTikTokOAuthConfig();
  const redirectUri = cfg.effectiveRedirectUri;
  if (!cfg.configured || !cfg.clientKey || !redirectUri) {
    return {
      mode: 'error',
      code: 'credentials_missing',
      message: 'TikTok API credentials are not configured yet.',
      missing: cfg.missing,
    };
  }

  const creatorAccountId = await resolveActiveTikTokCreatorAccountId();
  const state = createOAuthState(creatorAccountId);
  const authorizationUrl = buildOAuthAuthorizeUrl({
    clientKey: cfg.clientKey,
    redirectUri,
    state,
  });

  console.log('[tiktok-oauth] authorize redirect URL:', authorizationUrl);

  return { mode: 'redirect', authorizationUrl, state };
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  open_id?: string;
  scope?: string;
  error?: string;
  error_description?: string;
  message?: string;
};

type UserInfoResponse = {
  data?: {
    user?: {
      open_id?: string;
      union_id?: string;
      avatar_url?: string;
      display_name?: string;
      username?: string;
    };
  };
  error?: { code?: string; message?: string };
};

export type OAuthCallbackResult =
  | { ok: true; username: string | null; openId: string }
  | { ok: false; error: string };

export type RefreshTokenResult = { ok: true } | { ok: false; error: string };

/** Refresh an expired access token using the stored refresh token. */
export async function refreshTikTokConnection(
  creatorAccountId?: string,
): Promise<RefreshTokenResult> {
  const cfg = getTikTokOAuthConfig();
  if (!cfg.configured || !cfg.clientKey) {
    return { ok: false, error: 'TikTok API credentials are not configured yet.' };
  }

  const accountId = creatorAccountId ?? (await resolveActiveTikTokCreatorAccountId());
  const row = await getTikTokConnectionRow(accountId);
  if (!row || row.status !== 'connected') {
    return { ok: false, error: 'TikTok is not connected' };
  }

  const refreshToken = await getDecryptedRefreshToken(accountId);
  if (!refreshToken) {
    return { ok: false, error: 'No TikTok refresh token stored — reconnect required' };
  }

  const secret = getTikTokClientSecret();
  if (!secret) {
    return { ok: false, error: 'TikTok API credentials are not configured yet.' };
  }

  try {
    const tokenRes = await fetch(TIKTOK_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: cfg.clientKey,
        client_secret: secret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
    });

    const tokenJson = (await tokenRes.json()) as TokenResponse;
    if (!tokenRes.ok || !tokenJson.access_token) {
      const errMsg =
        tokenJson.error_description ??
        tokenJson.message ??
        tokenJson.error ??
        `Token refresh failed (${tokenRes.status})`;
      console.warn('[tiktok-oauth] token refresh failed:', errMsg);
      await markConnectionError(accountId, errMsg);
      return { ok: false, error: errMsg };
    }

    console.log(
      '[tiktok-oauth] token refresh ok, access_token:',
      redactTokenRef(tokenJson.access_token),
    );

    const scopes = parseGrantedScopes(tokenJson.scope);
    const effectiveScopes = scopes.length > 0 ? scopes : (row.scopes ?? []);

    const expiresAt = new Date(Date.now() + (tokenJson.expires_in ?? 24 * 3600) * 1000);

    await upsertTikTokConnection({
      creatorAccountId: accountId,
      platformUserId: row.platformUserId ?? 'unknown',
      platformUsername: row.platformUsername,
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token ?? refreshToken,
      scopes: effectiveScopes,
      expiresAt,
    });

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Token refresh failed';
    console.warn('[tiktok-oauth] refresh error:', msg);
    await markConnectionError(accountId, msg);
    return { ok: false, error: msg };
  }
}

export async function handleOAuthCallback(params: {
  code?: string | null;
  state?: string | null;
  error?: string | null;
  error_description?: string | null;
}): Promise<OAuthCallbackResult> {
  const cfg = getTikTokOAuthConfig();
  const redirectUri = cfg.effectiveRedirectUri;
  if (!cfg.configured || !cfg.clientKey || !redirectUri) {
    return { ok: false, error: 'TikTok API credentials are not configured yet.' };
  }

  if (params.error) {
    const msg = params.error_description ?? params.error;
    const accountId = await resolveActiveTikTokCreatorAccountId();
    await markConnectionError(accountId, msg);
    return { ok: false, error: msg };
  }

  if (!params.code || !params.state) {
    return { ok: false, error: 'Missing authorization code or state' };
  }

  let creatorAccountId: string;
  try {
    creatorAccountId = verifyOAuthState(params.state).creatorAccountId;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid OAuth state';
    return { ok: false, error: msg };
  }

  const secret = getTikTokClientSecret();
  if (!secret) {
    return { ok: false, error: 'TikTok API credentials are not configured yet.' };
  }

  try {
    const tokenRes = await fetch(TIKTOK_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: cfg.clientKey,
        client_secret: secret,
        code: params.code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }).toString(),
    });

    const tokenJson = (await tokenRes.json()) as TokenResponse;
    if (!tokenRes.ok || !tokenJson.access_token) {
      const errMsg =
        tokenJson.error_description ??
        tokenJson.message ??
        tokenJson.error ??
        `Token exchange failed (${tokenRes.status})`;
      console.warn('[tiktok-oauth] token exchange failed:', errMsg);
      await markConnectionError(creatorAccountId, errMsg);
      return { ok: false, error: errMsg };
    }

    console.log('[tiktok-oauth] token exchange ok, access_token:', redactTokenRef(tokenJson.access_token));

    const userRes = await fetch(
      `${TIKTOK_USER_INFO_URL}?fields=open_id,union_id,avatar_url,display_name,username`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      },
    );
    const userJson = (await userRes.json()) as UserInfoResponse;
    const user = userJson.data?.user;
    const openId = user?.open_id ?? tokenJson.open_id ?? 'unknown';
    const username = user?.username ?? null;

    const scopes = parseGrantedScopes(tokenJson.scope);
    const effectiveScopes = scopes.length > 0 ? scopes : requestedScopesList();

    const expiresAt = new Date(
      Date.now() + (tokenJson.expires_in ?? 24 * 3600) * 1000,
    );

    const liveAccountId = await getOrCreateAccount('tiktok', username ?? 'kelliekc');

    await upsertTikTokConnection({
      creatorAccountId: liveAccountId,
      platformUserId: openId,
      platformUsername: username,
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token ?? null,
      scopes: effectiveScopes,
      expiresAt,
    });
    await alignTikTokConnectionToAccount(liveAccountId);

    return { ok: true, username, openId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OAuth callback failed';
    console.warn('[tiktok-oauth] callback error:', msg);
    await markConnectionError(creatorAccountId, msg);
    return { ok: false, error: msg };
  }
}
