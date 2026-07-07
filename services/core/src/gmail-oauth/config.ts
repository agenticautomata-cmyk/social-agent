import { env } from '../env.js';
import { GMAIL_OAUTH_REDIRECT_URI_CANONICAL } from './constants.js';

export type GmailOAuthConfig = {
  configured: boolean;
  clientId: string | null;
  redirectUri: string | null;
  effectiveRedirectUri: string | null;
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

export function resolveGmailRedirectUri(): string | null {
  const fromEnv = env.GMAIL_REDIRECT_URI?.trim() || null;
  if (fromEnv && isLocalRedirectUri(fromEnv)) return fromEnv;
  if (env.GMAIL_CLIENT_ID?.trim()) return GMAIL_OAUTH_REDIRECT_URI_CANONICAL;
  return fromEnv;
}

export function getGmailClientSecret(): string | null {
  return env.GMAIL_CLIENT_SECRET?.trim() || null;
}

export function getGmailOAuthConfig(): GmailOAuthConfig {
  const clientId = env.GMAIL_CLIENT_ID?.trim() || null;
  const redirectUri = env.GMAIL_REDIRECT_URI?.trim() || null;
  const effectiveRedirectUri = resolveGmailRedirectUri();
  const missing: string[] = [];
  if (!clientId) missing.push('GMAIL_CLIENT_ID');
  if (!env.GMAIL_CLIENT_SECRET?.trim()) missing.push('GMAIL_CLIENT_SECRET');
  if (!effectiveRedirectUri) missing.push('GMAIL_REDIRECT_URI');
  return {
    configured: missing.length === 0,
    clientId,
    redirectUri,
    effectiveRedirectUri,
    missing,
  };
}
