import { env } from '../env.js';
import { GOOGLE_CALENDAR_OAUTH_REDIRECT_URI_CANONICAL } from './constants.js';

export type GoogleCalendarOAuthConfig = {
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

/** Reuses Gmail OAuth app credentials — Calendar authorization is a separate flow. */
export function resolveGoogleCalendarRedirectUri(): string | null {
  const fromEnv = env.GOOGLE_CALENDAR_REDIRECT_URI?.trim() || env.GMAIL_REDIRECT_URI?.trim() || null;
  if (fromEnv && isLocalRedirectUri(fromEnv)) return fromEnv;
  const clientId = env.GOOGLE_CALENDAR_CLIENT_ID?.trim() || env.GMAIL_CLIENT_ID?.trim();
  if (clientId) return GOOGLE_CALENDAR_OAUTH_REDIRECT_URI_CANONICAL;
  return fromEnv;
}

export function getGoogleCalendarClientSecret(): string | null {
  return env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() || env.GMAIL_CLIENT_SECRET?.trim() || null;
}

export function getGoogleCalendarClientId(): string | null {
  return env.GOOGLE_CALENDAR_CLIENT_ID?.trim() || env.GMAIL_CLIENT_ID?.trim() || null;
}

export function getGoogleCalendarOAuthConfig(): GoogleCalendarOAuthConfig {
  const clientId = getGoogleCalendarClientId();
  const redirectUri = env.GOOGLE_CALENDAR_REDIRECT_URI?.trim() || env.GMAIL_REDIRECT_URI?.trim() || null;
  const effectiveRedirectUri = resolveGoogleCalendarRedirectUri();
  const missing: string[] = [];
  if (!clientId) missing.push('GMAIL_CLIENT_ID or GOOGLE_CALENDAR_CLIENT_ID');
  if (!getGoogleCalendarClientSecret()) missing.push('GMAIL_CLIENT_SECRET or GOOGLE_CALENDAR_CLIENT_SECRET');
  if (!effectiveRedirectUri) missing.push('GOOGLE_CALENDAR_REDIRECT_URI or GMAIL_REDIRECT_URI');
  return {
    configured: missing.length === 0,
    clientId,
    redirectUri,
    effectiveRedirectUri,
    missing,
  };
}
