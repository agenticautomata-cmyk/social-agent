import { getGmailClientSecret, getGmailOAuthConfig } from './config.js';
import { createGmailOAuthState, verifyGmailOAuthState } from './oauth-state.js';
import {
  gmailScopesString,
  hasRequiredGmailScopes,
  missingRequiredGmailScopes,
  parseGrantedGmailScopes,
} from './scopes.js';
import { markGmailConnectionError, upsertGmailConnection } from './connections.js';

const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

export type GmailOAuthStartResult =
  | { mode: 'redirect'; authorizationUrl: string; state: string }
  | {
      mode: 'error';
      code: 'credentials_missing';
      message: string;
      missing: string[];
    };

export async function buildGmailOAuthStart(): Promise<GmailOAuthStartResult> {
  const cfg = getGmailOAuthConfig();
  const redirectUri = cfg.effectiveRedirectUri;
  if (!cfg.configured || !cfg.clientId || !redirectUri) {
    return {
      mode: 'error',
      code: 'credentials_missing',
      message: 'Gmail OAuth credentials are not configured yet.',
      missing: cfg.missing,
    };
  }

  const state = createGmailOAuthState();
  const url = new URL(GOOGLE_AUTHORIZE_URL);
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', gmailScopesString());
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);

  return { mode: 'redirect', authorizationUrl: url.toString(), state };
}

export type GmailOAuthCallbackResult =
  | { ok: true; email: string }
  | { ok: false; error: string };

export async function handleGmailOAuthCallback(params: {
  code?: string | null;
  state?: string | null;
  error?: string | null;
  error_description?: string | null;
}): Promise<GmailOAuthCallbackResult> {
  const cfg = getGmailOAuthConfig();
  const redirectUri = cfg.effectiveRedirectUri;

  if (!cfg.configured || !cfg.clientId || !redirectUri) {
    return { ok: false, error: 'Gmail OAuth credentials are not configured yet.' };
  }

  if (params.error) {
    const msg = params.error_description ?? params.error;
    await markGmailConnectionError(msg);
    return { ok: false, error: msg };
  }

  if (!params.code || !params.state) {
    return { ok: false, error: 'Missing authorization code or state' };
  }

  const secret = getGmailClientSecret();
  if (!secret) {
    return { ok: false, error: 'Gmail OAuth credentials are not configured yet.' };
  }

  try {
    verifyGmailOAuthState(params.state);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid OAuth state';
    return { ok: false, error: msg };
  }

  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: secret,
        redirect_uri: redirectUri,
        code: params.code,
        grant_type: 'authorization_code',
      }),
    });

    const tokenJson = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenRes.ok || !tokenJson.access_token) {
      const errMsg = tokenJson.error_description ?? tokenJson.error ?? 'Token exchange failed';
      await markGmailConnectionError(errMsg);
      return { ok: false, error: errMsg };
    }

    const userRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const userJson = (await userRes.json()) as { email?: string; error?: { message?: string } };
    const email = userJson.email?.trim();
    if (!userRes.ok || !email) {
      const errMsg = userJson.error?.message ?? 'Could not read Gmail account email';
      await markGmailConnectionError(errMsg);
      return { ok: false, error: errMsg };
    }

    const grantedScopes = parseGrantedGmailScopes(tokenJson.scope);
    if (!hasRequiredGmailScopes(grantedScopes)) {
      const missing = missingRequiredGmailScopes(grantedScopes).join(', ');
      const errMsg = `Gmail connection missing required scopes: ${missing}. Reconnect and approve send + read access.`;
      await markGmailConnectionError(errMsg);
      return { ok: false, error: errMsg };
    }

    const expiresAt = tokenJson.expires_in
      ? new Date(Date.now() + tokenJson.expires_in * 1000)
      : null;

    await upsertGmailConnection({
      email,
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token ?? null,
      expiresAt,
      scopes: grantedScopes,
    });

    return { ok: true, email };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Gmail OAuth callback failed';
    await markGmailConnectionError(msg);
    return { ok: false, error: msg };
  }
}
