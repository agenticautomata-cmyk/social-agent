import { getGoogleCalendarClientSecret, getGoogleCalendarOAuthConfig } from './config.js';
import {
  createGoogleCalendarOAuthState,
  verifyGoogleCalendarOAuthState,
} from './oauth-state.js';
import {
  googleCalendarScopesString,
  hasRequiredGoogleCalendarScopes,
  hasGoogleCalendarFreebusyScope,
  missingRequiredGoogleCalendarScopes,
  parseGrantedGoogleCalendarScopes,
} from './scopes.js';
import { markGoogleCalendarConnectionError, upsertGoogleCalendarConnection } from './connections.js';

const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export type GoogleCalendarOAuthStartResult =
  | { mode: 'redirect'; authorizationUrl: string; state: string }
  | {
      mode: 'error';
      code: 'credentials_missing';
      message: string;
      missing: string[];
    };

export async function buildGoogleCalendarOAuthStart(): Promise<GoogleCalendarOAuthStartResult> {
  const cfg = getGoogleCalendarOAuthConfig();
  const redirectUri = cfg.effectiveRedirectUri;
  if (!cfg.configured || !cfg.clientId || !redirectUri) {
    return {
      mode: 'error',
      code: 'credentials_missing',
      message: 'Google Calendar OAuth credentials are not configured yet.',
      missing: cfg.missing,
    };
  }

  const state = createGoogleCalendarOAuthState();
  const url = new URL(GOOGLE_AUTHORIZE_URL);
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', googleCalendarScopesString());
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);
  url.searchParams.set('include_granted_scopes', 'true');

  return { mode: 'redirect', authorizationUrl: url.toString(), state };
}

export type GoogleCalendarOAuthCallbackResult =
  | { ok: true; email: string }
  | { ok: false; error: string };

export async function handleGoogleCalendarOAuthCallback(params: {
  code?: string | null;
  state?: string | null;
  error?: string | null;
  error_description?: string | null;
}): Promise<GoogleCalendarOAuthCallbackResult> {
  const cfg = getGoogleCalendarOAuthConfig();
  const redirectUri = cfg.effectiveRedirectUri;

  if (!cfg.configured || !cfg.clientId || !redirectUri) {
    return { ok: false, error: 'Google Calendar OAuth credentials are not configured yet.' };
  }

  if (params.error) {
    const msg = params.error_description ?? params.error;
    await markGoogleCalendarConnectionError(msg);
    return { ok: false, error: msg };
  }

  if (!params.code || !params.state) {
    return { ok: false, error: 'Missing authorization code or state' };
  }

  const secret = getGoogleCalendarClientSecret();
  if (!secret) {
    return { ok: false, error: 'Google Calendar OAuth credentials are not configured yet.' };
  }

  let statePayload;
  try {
    statePayload = verifyGoogleCalendarOAuthState(params.state);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid OAuth state';
    return { ok: false, error: msg };
  }
  void statePayload;

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
      await markGoogleCalendarConnectionError(errMsg);
      return { ok: false, error: errMsg };
    }

    const grantedScopes = parseGrantedGoogleCalendarScopes(tokenJson.scope);
    if (!hasRequiredGoogleCalendarScopes(grantedScopes)) {
      const missing = missingRequiredGoogleCalendarScopes(grantedScopes).join(', ');
      const errMsg = `Google Calendar connection missing required scopes: ${missing}. Reconnect and approve Calendar access.`;
      await markGoogleCalendarConnectionError(errMsg);
      return { ok: false, error: errMsg };
    }

    if (!tokenJson.refresh_token) {
      const existing = await import('./connections.js').then((m) => m.getGoogleCalendarConnectionRow());
      if (!existing?.refreshTokenEncrypted) {
        const errMsg =
          'Google did not return a refresh token. Disconnect and reconnect with prompt=consent using the configured test account.';
        await markGoogleCalendarConnectionError(errMsg);
        return { ok: false, error: errMsg };
      }
    }

    const expiresAt = tokenJson.expires_in
      ? new Date(Date.now() + tokenJson.expires_in * 1000)
      : null;

    await upsertGoogleCalendarConnection({
      email: null,
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token ?? null,
      expiresAt,
      scopes: grantedScopes,
      availabilityEnabled: hasGoogleCalendarFreebusyScope(grantedScopes),
    });

    const { verifyGoogleCalendarApiAccess } = await import('./verify.js');
    const verified = await verifyGoogleCalendarApiAccess();
    if (!verified.ok) {
      await markGoogleCalendarConnectionError(verified.error);
      return { ok: false, error: verified.error };
    }

    return { ok: true, email: verified.accountLabel };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Google Calendar OAuth callback failed';
    await markGoogleCalendarConnectionError(msg);
    return { ok: false, error: msg };
  }
}
