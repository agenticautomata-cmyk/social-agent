export * from './constants.js';
export { classifyDiscoveryEmail, looksLikeSubscriptionConfirmation, isBlockedConfirmationEmail } from './classify.js';
export {
  extractUrlsFromText,
  extractUrlsFromHtml,
  pickConfirmationLink,
  extractVerificationCode,
  sanitizeUrlForDisplay,
  domainFromEmail,
  domainFromUrl,
  rootDomain,
} from './extract.js';
export {
  validateConfirmationUrl,
  assertPublicHost,
  isAllowedConfirmationDestination,
  safeConfirmSubscriptionLink,
  type SafeFetchResult,
  type SafeFetchBlockReason,
} from './safe-fetch.js';
export {
  listDiscoverySubscriptions,
  getDiscoverySubscription,
  createDiscoverySubscription,
  findMatchingSignup,
  findActiveSubscriptionForSender,
  findBlockedSender,
  updateDiscoverySubscription,
  markSubscriptionNewsletterReceived,
  type DiscoverySubscriptionRecord,
} from './store.js';
export {
  processSubscriptionConfirmationEmail,
  markSubscriptionVerifiedManually,
  dismissSubscriptionReview,
  blockSubscriptionSender,
  type ConfirmationProcessInput,
  type ConfirmationProcessResult,
} from './process-confirmation.js';
