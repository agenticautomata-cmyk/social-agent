import { env } from '../env.js';
import { TIKTOK_OAUTH_REDIRECT_URI_CANONICAL } from './constants.js';

export type TikTokClientKeyMode = 'sandbox' | 'production' | 'unknown';

export type TikTokOAuthConfig = {
  configured: boolean;
  clientKey: string | null;
  redirectUri: string | null;
  /** Redirect URI sent to TikTok (after normalization). */
  effectiveRedirectUri: string | null;
  clientKeyMode: TikTokClientKeyMode;
  clientKeyModeSource: 'TIKTOK_CLIENT_MODE' | 'client_key_prefix' | 'unknown';
  missing: string[];
};

function detectClientKeyMode(clientKey: string | null): {
  mode: TikTokClientKeyMode;
  source: TikTokOAuthConfig['clientKeyModeSource'];
} {
  const envMode = env.TIKTOK_CLIENT_MODE?.trim().toLowerCase();
  if (envMode === 'sandbox' || envMode === 'production') {
    return { mode: envMode, source: 'TIKTOK_CLIENT_MODE' };
  }
  if (!clientKey) return { mode: 'unknown', source: 'unknown' };
  // TikTok sandbox client keys are issued with an `sb` prefix.
  if (clientKey.startsWith('sb')) return { mode: 'sandbox', source: 'client_key_prefix' };
  return { mode: 'production', source: 'client_key_prefix' };
}

export function maskTikTokClientKey(clientKey: string): string {
  if (clientKey.length <= 6) return `${clientKey.slice(0, 2)}***`;
  return `${clientKey.slice(0, 4)}***${clientKey.slice(-2)}`;
}

function isLocalRedirectUri(uri: string): boolean {
  try {
    const host = new URL(uri).hostname;
    return host === 'localhost' || host === '127.0.0.1';
  } catch {
    return false;
  }
}

/**
 * Normalize redirect URI for TikTok OAuth (exact string match required by Login Kit).
 * - trim / strip quotes
 * - force https for kckellie.com hosts
 * - map benson.kckellie.com → api.kckellie.com (common misconfiguration)
 * - remove trailing slash on path
 */
export function normalizeTikTokRedirectUri(raw: string | undefined | null): string | null {
  if (!raw?.trim()) return null;
  let value = raw.trim().replace(/^['"]|['"]$/g, '');
  if (!value) return null;

  try {
    const parsed = new URL(value);
    if (parsed.hostname === 'benson.kckellie.com') {
      parsed.hostname = 'api.kckellie.com';
    }
    if (parsed.hostname.endsWith('kckellie.com') && parsed.protocol === 'http:') {
      parsed.protocol = 'https:';
    }
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Resolve redirect URI for authorize + token exchange.
 * Local dev may use localhost from .env; production always uses the canonical API callback.
 */
export function resolveTikTokRedirectUri(): string | null {
  const fromEnv = normalizeTikTokRedirectUri(env.TIKTOK_REDIRECT_URI);
  if (fromEnv && isLocalRedirectUri(fromEnv)) {
    return fromEnv;
  }
  const clientKey = env.TIKTOK_CLIENT_KEY?.trim();
  if (clientKey) {
    return TIKTOK_OAUTH_REDIRECT_URI_CANONICAL;
  }
  return fromEnv;
}

export function getTikTokOAuthConfig(): TikTokOAuthConfig {
  const clientKey = env.TIKTOK_CLIENT_KEY?.trim() || null;
  const clientSecret = env.TIKTOK_CLIENT_SECRET?.trim() || null;
  const redirectUri = resolveTikTokRedirectUri();
  const { mode, source } = detectClientKeyMode(clientKey);
  const missing: string[] = [];
  if (!clientKey) missing.push('TIKTOK_CLIENT_KEY');
  if (!clientSecret) missing.push('TIKTOK_CLIENT_SECRET');
  if (!redirectUri) missing.push('TIKTOK_REDIRECT_URI');
  return {
    configured: missing.length === 0,
    clientKey,
    redirectUri: normalizeTikTokRedirectUri(env.TIKTOK_REDIRECT_URI) ?? redirectUri,
    effectiveRedirectUri: redirectUri,
    clientKeyMode: mode,
    clientKeyModeSource: source,
    missing,
  };
}

export function getTikTokClientSecret(): string | null {
  return env.TIKTOK_CLIENT_SECRET?.trim() || null;
}
