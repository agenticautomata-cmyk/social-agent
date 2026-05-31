import { env } from '../env.js';

export type TikTokOAuthConfig = {
  configured: boolean;
  clientKey: string | null;
  redirectUri: string | null;
  missing: string[];
};

export function getTikTokOAuthConfig(): TikTokOAuthConfig {
  const clientKey = env.TIKTOK_CLIENT_KEY?.trim() || null;
  const clientSecret = env.TIKTOK_CLIENT_SECRET?.trim() || null;
  const redirectUri = env.TIKTOK_REDIRECT_URI?.trim() || null;
  const missing: string[] = [];
  if (!clientKey) missing.push('TIKTOK_CLIENT_KEY');
  if (!clientSecret) missing.push('TIKTOK_CLIENT_SECRET');
  if (!redirectUri) missing.push('TIKTOK_REDIRECT_URI');
  return {
    configured: missing.length === 0,
    clientKey,
    redirectUri,
    missing,
  };
}

export function getTikTokClientSecret(): string | null {
  return env.TIKTOK_CLIENT_SECRET?.trim() || null;
}
