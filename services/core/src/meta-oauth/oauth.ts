import { getMetaAppSecret, getMetaOAuthConfig } from './config.js';
import { createMetaOAuthState, verifyMetaOAuthState } from './oauth-state.js';
import { metaScopesString } from './scopes.js';
import {
  markMetaConnectionError,
  resolveDefaultFacebookAccountId,
  resolveDefaultInstagramAccountId,
  upsertMetaConnections,
} from './connections.js';
import { getAnalyticsConnectorSettings } from '../analytics-connectors/settings.js';

const META_AUTHORIZE_URL = 'https://www.facebook.com/v21.0/dialog/oauth';
const GRAPH = 'https://graph.facebook.com/v21.0';

export type MetaOAuthStartResult =
  | { mode: 'redirect'; authorizationUrl: string; state: string }
  | {
      mode: 'error';
      code: 'credentials_missing' | 'connectors_disabled';
      message: string;
      missing: string[];
    };

export async function buildMetaOAuthStart(): Promise<MetaOAuthStartResult> {
  const settings = await getAnalyticsConnectorSettings();
  if (!settings.facebook.enabled && !settings.instagram.enabled) {
    return {
      mode: 'error',
      code: 'connectors_disabled',
      message:
        'Facebook and Instagram are turned off in analytics settings. Enable them when business accounts are ready.',
      missing: [],
    };
  }

  const cfg = getMetaOAuthConfig();
  const redirectUri = cfg.effectiveRedirectUri;
  if (!cfg.configured || !cfg.appId || !redirectUri) {
    return {
      mode: 'error',
      code: 'credentials_missing',
      message: 'Meta API credentials are not configured yet.',
      missing: cfg.missing,
    };
  }

  const [instagramAccountId, facebookAccountId] = await Promise.all([
    resolveDefaultInstagramAccountId(),
    resolveDefaultFacebookAccountId(),
  ]);
  const state = createMetaOAuthState(instagramAccountId, facebookAccountId);
  const url = new URL(META_AUTHORIZE_URL);
  url.searchParams.set('client_id', cfg.appId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', metaScopesString());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);

  return { mode: 'redirect', authorizationUrl: url.toString(), state };
}

export type MetaOAuthCallbackResult =
  | { ok: true; pageName: string; igUsername: string | null }
  | { ok: false; error: string };

export async function handleMetaOAuthCallback(params: {
  code?: string | null;
  state?: string | null;
  error?: string | null;
  error_description?: string | null;
}): Promise<MetaOAuthCallbackResult> {
  const cfg = getMetaOAuthConfig();
  const redirectUri = cfg.effectiveRedirectUri;
  const [instagramAccountId, facebookAccountId] = await Promise.all([
    resolveDefaultInstagramAccountId(),
    resolveDefaultFacebookAccountId(),
  ]);

  if (!cfg.configured || !cfg.appId || !redirectUri) {
    return { ok: false, error: 'Meta API credentials are not configured yet.' };
  }

  if (params.error) {
    const msg = params.error_description ?? params.error;
    await markMetaConnectionError(instagramAccountId, facebookAccountId, msg);
    return { ok: false, error: msg };
  }

  if (!params.code || !params.state) {
    return { ok: false, error: 'Missing authorization code or state' };
  }

  const secret = getMetaAppSecret();
  if (!secret) {
    return { ok: false, error: 'Meta API credentials are not configured yet.' };
  }

  try {
    verifyMetaOAuthState(params.state);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid OAuth state';
    return { ok: false, error: msg };
  }

  try {
    const tokenUrl = new URL(`${GRAPH}/oauth/access_token`);
    tokenUrl.searchParams.set('client_id', cfg.appId);
    tokenUrl.searchParams.set('client_secret', secret);
    tokenUrl.searchParams.set('redirect_uri', redirectUri);
    tokenUrl.searchParams.set('code', params.code);

    const shortRes = await fetch(tokenUrl);
    const shortJson = (await shortRes.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: { message?: string };
    };
    if (!shortRes.ok || !shortJson.access_token) {
      const errMsg = shortJson.error?.message ?? `Token exchange failed (${shortRes.status})`;
      await markMetaConnectionError(instagramAccountId, facebookAccountId, errMsg);
      return { ok: false, error: errMsg };
    }

    const longUrl = new URL(`${GRAPH}/oauth/access_token`);
    longUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longUrl.searchParams.set('client_id', cfg.appId);
    longUrl.searchParams.set('client_secret', secret);
    longUrl.searchParams.set('fb_exchange_token', shortJson.access_token);

    const longRes = await fetch(longUrl);
    const longJson = (await longRes.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: { message?: string };
    };
    const userToken = longJson.access_token ?? shortJson.access_token;
    const tokenExpiresAt = longJson.expires_in
      ? new Date(Date.now() + longJson.expires_in * 1000)
      : shortJson.expires_in
        ? new Date(Date.now() + shortJson.expires_in * 1000)
        : null;

    const pagesUrl = new URL(`${GRAPH}/me/accounts`);
    pagesUrl.searchParams.set(
      'fields',
      'id,name,access_token,instagram_business_account{id,username}',
    );
    pagesUrl.searchParams.set('access_token', userToken);

    const pagesRes = await fetch(pagesUrl);
    const pagesJson = (await pagesRes.json()) as {
      data?: Array<{
        id: string;
        name: string;
        access_token: string;
        instagram_business_account?: { id: string; username?: string };
      }>;
      error?: { message?: string };
    };

    if (!pagesRes.ok || !pagesJson.data?.length) {
      const errMsg = pagesJson.error?.message ?? 'No Facebook Pages found for this account';
      await markMetaConnectionError(instagramAccountId, facebookAccountId, errMsg);
      return { ok: false, error: errMsg };
    }

    const page =
      (cfg.pageId ? pagesJson.data.find((p) => p.id === cfg.pageId) : null) ??
      pagesJson.data[0]!;

    const ig = page.instagram_business_account;

    await upsertMetaConnections({
      instagramAccountId,
      facebookAccountId,
      pageId: page.id,
      pageName: page.name,
      pageAccessToken: page.access_token,
      igBusinessId: ig?.id ?? null,
      igUsername: ig?.username ?? null,
      tokenExpiresAt,
    });

    return { ok: true, pageName: page.name, igUsername: ig?.username ?? null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Meta OAuth callback failed';
    await markMetaConnectionError(instagramAccountId, facebookAccountId, msg);
    return { ok: false, error: msg };
  }
}
