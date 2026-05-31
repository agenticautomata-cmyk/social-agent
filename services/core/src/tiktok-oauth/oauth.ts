import { getTikTokClientSecret, getTikTokOAuthConfig } from './config.js';
import { createOAuthState, verifyOAuthState } from './oauth-state.js';
import { parseGrantedScopes, requestedScopesString, TIKTOK_OAUTH_REQUESTED_SCOPES } from './scopes.js';
import {
  markConnectionError,
  resolveDefaultTikTokCreatorAccountId,
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

export async function buildOAuthStart(): Promise<OAuthStartResult> {
  const cfg = getTikTokOAuthConfig();
  if (!cfg.configured || !cfg.clientKey || !cfg.redirectUri) {
    return {
      mode: 'error',
      code: 'credentials_missing',
      message: 'TikTok API credentials are not configured yet.',
      missing: cfg.missing,
    };
  }

  const creatorAccountId = await resolveDefaultTikTokCreatorAccountId();
  const state = createOAuthState(creatorAccountId);
  const url = new URL(TIKTOK_AUTHORIZE_URL);
  url.searchParams.set('client_key', cfg.clientKey);
  url.searchParams.set('scope', requestedScopesString());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', cfg.redirectUri);
  url.searchParams.set('state', state);

  return { mode: 'redirect', authorizationUrl: url.toString(), state };
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

export async function handleOAuthCallback(params: {
  code?: string | null;
  state?: string | null;
  error?: string | null;
  error_description?: string | null;
}): Promise<OAuthCallbackResult> {
  const cfg = getTikTokOAuthConfig();
  if (!cfg.configured || !cfg.clientKey || !cfg.redirectUri) {
    return { ok: false, error: 'TikTok API credentials are not configured yet.' };
  }

  if (params.error) {
    const msg = params.error_description ?? params.error;
    const accountId = await resolveDefaultTikTokCreatorAccountId();
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
        redirect_uri: cfg.redirectUri,
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
    const effectiveScopes = scopes.length > 0 ? scopes : [...TIKTOK_OAUTH_REQUESTED_SCOPES];

    const expiresAt = new Date(
      Date.now() + (tokenJson.expires_in ?? 24 * 3600) * 1000,
    );

    await upsertTikTokConnection({
      creatorAccountId,
      platformUserId: openId,
      platformUsername: username,
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token ?? null,
      scopes: effectiveScopes,
      expiresAt,
    });

    return { ok: true, username, openId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OAuth callback failed';
    console.warn('[tiktok-oauth] callback error:', msg);
    await markConnectionError(creatorAccountId, msg);
    return { ok: false, error: msg };
  }
}
