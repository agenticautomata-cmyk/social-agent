import { env } from '../env.js';

/**
 * Default Login Kit scopes for Benson sandbox connect.
 * Requesting Display API scopes (`video.list`, profile/stats) before those
 * products are enabled on the TikTok app causes authorize to fail with a
 * generic "redirect_uri" error and never hits Benson's callback.
 *
 * Override with TIKTOK_OAUTH_SCOPES (comma-separated) once TikTok API /
 * Display scopes are enabled on the same Sandbox app.
 */
export const TIKTOK_OAUTH_DEFAULT_SCOPES = ['user.info.basic'] as const;

/** @deprecated use requestedScopesList() — kept for callers expecting a const tuple */
export const TIKTOK_OAUTH_REQUESTED_SCOPES = TIKTOK_OAUTH_DEFAULT_SCOPES;

export function requestedScopesString(): string {
  const override = env.TIKTOK_OAUTH_SCOPES?.trim();
  if (override) return override;
  return TIKTOK_OAUTH_DEFAULT_SCOPES.join(',');
}

export function requestedScopesList(): string[] {
  return requestedScopesString()
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseGrantedScopes(scopeHeader: string | undefined | null): string[] {
  if (!scopeHeader?.trim()) return [];
  return scopeHeader.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
}
