export { getTikTokOAuthConfig, getTikTokClientSecret, type TikTokOAuthConfig } from './config.js';
export {
  encryptToken,
  decryptToken,
  redactTokenRef,
} from './token-crypto.js';
export { createOAuthState, verifyOAuthState } from './oauth-state.js';
export {
  TIKTOK_OAUTH_REQUESTED_SCOPES,
  requestedScopesString,
  parseGrantedScopes,
} from './scopes.js';
export {
  resolveDefaultTikTokCreatorAccountId,
  getTikTokConnectionStatus,
  getTikTokConnectionRow,
  upsertTikTokConnection,
  disconnectTikTok,
  markConnectionError,
  getDecryptedAccessToken,
  type TikTokConnectionStatusResponse,
  type PublicConnectionStatus,
} from './connections.js';
export {
  buildOAuthStart,
  handleOAuthCallback,
  TikTokOAuthCredentialsError,
  type OAuthStartResult,
  type OAuthCallbackResult,
} from './oauth.js';
