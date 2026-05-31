export {
  KELLIE_NAME,
  SPONSOR_CONTACT_STATUSES,
  OUTREACH_EMAIL_STATUSES,
  TEMPLATE_TYPES,
  type SponsorContactStatus,
  type OutreachEmailStatus,
  type TemplateType,
} from './constants.js';
export {
  listSponsorContacts,
  getSponsorContact,
  getSponsorContactBySourceOpportunity,
  createSponsorContact,
  createSponsorFromOpportunity,
  updateSponsorContact,
  loadInventoryItemById,
  type SponsorContactRecord,
  type SponsorContactUpdate,
} from './contacts.js';
export {
  listMediaKits,
  getMediaKit,
  createMediaKit,
  updateMediaKit,
  type MediaKitRecord,
  type MediaKitInput,
} from './media-kits.js';
export {
  listEmailTemplates,
  getEmailTemplate,
  getEmailTemplateByType,
  type EmailTemplateRecord,
} from './templates.js';
export {
  buildMergeContext,
  applyMergeFields,
  renderTemplate,
  type MergeContext,
} from './merge.js';
export {
  listOutreachEmails,
  getOutreachEmail,
  listSendAttempts,
  createOutreachDraft,
  renderOutreachFromTemplate,
  previewOutreachEmail,
  updateOutreachDraft,
  scheduleOutreachEmail,
  approveOutreachEmail,
  cancelOutreachEmail,
  simulateSendOutreachEmail,
  enrichOutreachEmails,
  type OutreachEmailRecord,
  type OutreachEmailWithMeta,
  type OutreachSendAttemptRecord,
} from './outreach.js';
export { sendOutreachEmail, getOutreachSendConfig, type OutreachSendMode } from './send.js';
export type { OutreachSendConfig } from './email-providers/index.js';
export type { EmailProvider, EmailSendPayload, EmailSendResult } from './email-providers/types.js';
export { ResendEmailProvider, GmailSendAsProvider } from './email-providers/index.js';
