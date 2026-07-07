/** Read-only Meta OAuth scopes — no publish or manage permissions. */
export const META_OAUTH_READ_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'instagram_basic',
  'instagram_manage_insights',
] as const;

export function metaScopesString(): string {
  return META_OAUTH_READ_SCOPES.join(',');
}
