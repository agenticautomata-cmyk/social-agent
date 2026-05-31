/**
 * TikTok OAuth scopes — Phase B requests these; TikTok may not grant all.
 * See docs/tiktok-oauth-scopes.md and TIKTOK_OAUTH_PHASE_B_RESULTS.md.
 */

/** Scopes requested during authorization (Login Kit). */
export const TIKTOK_OAUTH_REQUESTED_SCOPES = [
  'user.info.basic',
  'video.list',
] as const;

export function requestedScopesString(): string {
  return TIKTOK_OAUTH_REQUESTED_SCOPES.join(',');
}

export function parseGrantedScopes(scopeHeader: string | undefined | null): string[] {
  if (!scopeHeader?.trim()) return [];
  return scopeHeader.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
}
