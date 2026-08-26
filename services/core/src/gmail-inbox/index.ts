export { GmailInboxError, gmailApiFetch, headerValue, parseFromHeader } from './client.js';
export {
  fetchGmailMessageSummaries,
  fetchGmailMessageSummary,
  listGmailMessageIds,
  PRIMARY_UNREAD_QUERY,
  type GmailMessageSummary,
} from './messages.js';
export {
  countUnreadInboundMessages,
  listOutreachInboundMessages,
  markInboundMessageRead,
  syncGmailOutreachReplies,
  type GmailInboxSyncResult,
  type InboundMessageRecord,
} from './sync-replies.js';
export { getGmailInboxSyncStatus, runGmailTelegramDigest, type GmailDigestResult } from './digest.js';
export { buildDigestUnreadQuery, digestMessageCap } from './digest-query.js';
export {
  dismissDigestMessage,
  promoteDigestToFollowUp,
  promoteDigestToOpportunity,
  tryAutoHarvestDigestMessage,
  type DigestFollowUpResult,
  type DigestPromoteResult,
} from './digest-promote.js';
export {
  promoteSponsorInboxToPipeline,
  tryAutoPipelineSponsorInbox,
  type SponsorInboxPipelineResult,
} from './sponsor-inbox-pipeline.js';
export { ingestEmailMessageAsOpportunity, type EmailIngestResult } from './email-ingest.js';
export {
  ROUTING_HEADER_NAMES,
  resolveInboundChannelFromHeaders,
  isDiscoveryEmail,
  isSponsorOrBookingChannel,
  type InboundChannelResolution,
} from './resolve-channel.js';
export {
  processDiscoveryEmailMessage,
  type DiscoveryEmailProcessResult,
} from './discovery-process.js';
export {
  resolveDiscoveryNewsletterRoute,
  shouldRunNewsletterOccurrenceExtraction,
  type DiscoveryNewsletterRoute,
  type DiscoveryNewsletterRouteAction,
} from './discovery-newsletter-route.js';
export {
  classifyInboundEmail,
  classifyDiscoveryIntent,
  telegramHeadingForCategory,
  formatTelegramDigestBody,
  subscriptionConfirmationTelegramStatus,
  type EmailCategory,
  type DiscoveryIntent,
  type InboxFilterCategory,
} from './email-category.js';
export {
  listUnifiedInboxMessages,
  countUnreadByCategory,
  reclassifyRecentInboundEmail,
  type UnifiedInboxMessage,
} from './inbox-unified.js';
