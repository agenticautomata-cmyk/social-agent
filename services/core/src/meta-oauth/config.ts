import { env } from '../env.js';
import { META_OAUTH_REDIRECT_URI_CANONICAL } from './constants.js';

export type MetaOAuthConfig = {
  configured: boolean;
  appId: string | null;
  redirectUri: string | null;
  effectiveRedirectUri: string | null;
  pageId: string | null;
  missing: string[];
};

function isLocalRedirectUri(uri: string): boolean {
  try {
    const host = new URL(uri).hostname;
    return host === 'localhost' || host === '127.0.0.1';
  } catch {
    return false;
  }
}

export function resolveMetaRedirectUri(): string | null {
  const fromEnv = env.META_REDIRECT_URI?.trim() || null;
  if (fromEnv && isLocalRedirectUri(fromEnv)) {
    return fromEnv;
  }
  if (env.IG_APP_ID?.trim()) {
    return META_OAUTH_REDIRECT_URI_CANONICAL;
  }
  return fromEnv;
}

export function getMetaAppSecret(): string | null {
  return env.IG_APP_SECRET ?? null;
}

export function getMetaOAuthConfig(): MetaOAuthConfig {
  const appId = env.IG_APP_ID?.trim() || null;
  const redirectUri = env.META_REDIRECT_URI?.trim() || null;
  const effectiveRedirectUri = resolveMetaRedirectUri();
  const pageId = env.META_PAGE_ID ?? null;
  const missing: string[] = [];
  if (!appId) missing.push('IG_APP_ID');
  if (!env.IG_APP_SECRET?.trim()) missing.push('IG_APP_SECRET');
  if (!effectiveRedirectUri) missing.push('META_REDIRECT_URI');
  return {
    configured: missing.length === 0,
    appId,
    redirectUri,
    effectiveRedirectUri,
    pageId,
    missing,
  };
}
