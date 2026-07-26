export function sanitizeGoogleCalendarError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('insufficient') && lower.includes('scope')) {
    return 'Calendar setup could not complete with the granted scopes. Benson will retry using the dedicated calendar only.';
  }
  if (lower.includes('invalid_grant') || lower.includes('revoked')) {
    return 'Google Calendar authorization expired. Reconnect on Calendar settings.';
  }
  return 'Google Calendar setup could not complete. Benson will retry automatically.';
}
