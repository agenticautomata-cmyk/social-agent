export const GMAIL_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'openid',
] as const;

export const GMAIL_REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
] as const;

export function gmailScopesString(): string {
  return GMAIL_OAUTH_SCOPES.join(' ');
}

export function parseGrantedGmailScopes(scopeString?: string | null): string[] {
  if (!scopeString?.trim()) return [];
  return scopeString.trim().split(/\s+/).filter(Boolean);
}

export function hasRequiredGmailScopes(granted: string[]): boolean {
  return GMAIL_REQUIRED_SCOPES.every((scope) => granted.includes(scope));
}

export function missingRequiredGmailScopes(granted: string[]): string[] {
  return GMAIL_REQUIRED_SCOPES.filter((scope) => !granted.includes(scope));
}
