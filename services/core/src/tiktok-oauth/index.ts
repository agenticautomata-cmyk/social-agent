export {
  getTikTokOAuthConfig,
  getTikTokClientSecret,
  maskTikTokClientKey,
  type TikTokOAuthConfig,
  type TikTokClientKeyMode,
} from './config.js';
export { TIKTOK_OAUTH_REDIRECT_URI_CANONICAL } from './constants.js';
export {
  encryptToken,
  decryptToken,
  redactTokenRef,
} from './token-crypto.js';
export { createOAuthState, verifyOAuthState } from './oauth-state.js';
export {
  TIKTOK_OAUTH_REQUESTED_SCOPES,
  TIKTOK_OAUTH_DEFAULT_SCOPES,
  requestedScopesString,
  requestedScopesList,
  parseGrantedScopes,
} from './scopes.js';
export {
  resolveDefaultTikTokCreatorAccountId,
  resolveActiveTikTokCreatorAccountId,
  getActiveTikTokConnectionRow,
  alignTikTokConnectionToAccount,
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
  buildOAuthAuthorizeUrl,
  buildOAuthDebugUrl,
  buildOAuthStart,
  handleOAuthCallback,
  refreshTikTokConnection,
  TikTokOAuthCredentialsError,
  type OAuthStartResult,
  type OAuthCallbackResult,
  type OAuthDebugUrlResult,
  type RefreshTokenResult,
} from './oauth.js';
