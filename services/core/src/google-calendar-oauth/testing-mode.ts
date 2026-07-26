import { env } from '../env.js';

/** Days until refresh tokens expire when the OAuth app is in Google Cloud "Testing" status. */
export const GOOGLE_OAUTH_TESTING_REFRESH_TOKEN_TTL_DAYS = 7;

export type GoogleOAuthPublishingStatus = 'testing' | 'production';

export function getGoogleOAuthPublishingStatus(): GoogleOAuthPublishingStatus {
  const raw = env.GOOGLE_OAUTH_PUBLISHING_STATUS?.trim().toLowerCase();
  return raw === 'production' ? 'production' : 'testing';
}

export function computeRefreshTokenExpiresAt(connectedAt: Date): Date | null {
  if (getGoogleOAuthPublishingStatus() !== 'testing') return null;
  return new Date(connectedAt.getTime() + GOOGLE_OAUTH_TESTING_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function buildTestingModeRefreshTokenWarnings(input: {
  connectedAt: Date | null;
  refreshTokenExpiresAt: Date | null;
}): string[] {
  if (getGoogleOAuthPublishingStatus() !== 'testing') return [];
  if (!input.connectedAt || !input.refreshTokenExpiresAt) {
    return [
      'Google OAuth app is in Testing mode. Offline refresh tokens expire after 7 days until the app is published to Production in Google Cloud Console.',
    ];
  }

  const msLeft = input.refreshTokenExpiresAt.getTime() - Date.now();
  const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
  if (daysLeft <= 0) {
    return [
      'Google Calendar refresh token has expired (Testing-mode 7-day limit). Reconnect at Calendar settings.',
      'Publish the OAuth app to Production in Google Cloud Console to receive non-expiring refresh tokens.',
    ];
  }
  if (daysLeft <= 2) {
    return [
      `Google Calendar refresh token expires in ${daysLeft} day(s) (Testing-mode 7-day limit). Reconnect soon or publish the OAuth app to Production.`,
    ];
  }
  return [
    `Google OAuth app is in Testing mode. Calendar refresh token expires ${input.refreshTokenExpiresAt.toLocaleDateString('en-US', { timeZone: 'America/Chicago' })} (${daysLeft} days). Publish to Production in Google Cloud Console for long-lived tokens.`,
  ];
}

export const GOOGLE_OAUTH_TESTING_TO_PRODUCTION_STEPS =
  'Google Cloud Console → APIs & Services → OAuth consent screen → Publish app → move from Testing to In production (verify app if required). Test users can then authorize without the 7-day refresh-token expiry.';
