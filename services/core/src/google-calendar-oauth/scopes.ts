/**
 * Must match Google Cloud OAuth consent configuration exactly.
 * @see https://developers.google.com/identity/protocols/oauth2/scopes#calendar
 */
export const GOOGLE_CALENDAR_APP_CREATED_SCOPE =
  'https://www.googleapis.com/auth/calendar.app.created' as const;

export const GOOGLE_CALENDAR_FREEBUSY_SCOPE =
  'https://www.googleapis.com/auth/calendar.freebusy' as const;

/** Scopes requested during Calendar OAuth — no Gmail, no calendar.events/readonly. */
export const GOOGLE_CALENDAR_OAUTH_SCOPES = [
  GOOGLE_CALENDAR_APP_CREATED_SCOPE,
  GOOGLE_CALENDAR_FREEBUSY_SCOPE,
] as const;

export const GOOGLE_CALENDAR_REQUIRED_SCOPES = [...GOOGLE_CALENDAR_OAUTH_SCOPES] as const;

export function googleCalendarScopesString(): string {
  return GOOGLE_CALENDAR_OAUTH_SCOPES.join(' ');
}

export function parseGrantedGoogleCalendarScopes(scopeString?: string | null): string[] {
  if (!scopeString?.trim()) return [];
  return scopeString.trim().split(/\s+/).filter(Boolean);
}

export function hasRequiredGoogleCalendarScopes(granted: string[]): boolean {
  return GOOGLE_CALENDAR_REQUIRED_SCOPES.every((scope) => granted.includes(scope));
}

export function hasGoogleCalendarFreebusyScope(granted: string[]): boolean {
  return granted.includes(GOOGLE_CALENDAR_FREEBUSY_SCOPE);
}

export function hasGoogleCalendarAppCreatedScope(granted: string[]): boolean {
  return granted.includes(GOOGLE_CALENDAR_APP_CREATED_SCOPE);
}

export function missingRequiredGoogleCalendarScopes(granted: string[]): string[] {
  return GOOGLE_CALENDAR_REQUIRED_SCOPES.filter((scope) => !granted.includes(scope));
}

/** True when Gmail scopes are present but Calendar export scopes are not. */
export function isGmailOnlyGoogleAuth(granted: string[]): boolean {
  const hasGmail = granted.some((s) => s.includes('gmail'));
  return hasGmail && !hasRequiredGoogleCalendarScopes(granted);
}
