import {
  formatDate as formatDateImport,
  formatDateTime as formatDateTimeImport,
} from './datetime';

export const SPONSOR_CONTACT_STATUSES = [
  'lead',
  'ready_to_contact',
  'scheduled',
  'sent',
  'replied',
  'follow_up_needed',
  'not_interested',
  'converted',
] as const;

export type SponsorContactStatus = (typeof SPONSOR_CONTACT_STATUSES)[number];

export type SponsorContactRecord = {
  id: string;
  businessName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  tiktok: string | null;
  category: string | null;
  notes: string | null;
  sponsorFitScore: number | null;
  sourceOpportunityId: string | null;
  status: SponsorContactStatus;
  contactVerificationStatus?: string;
  mergedIntoId?: string | null;
  canonicalBusinessId?: string | null;
  lastContactedAt: string | null;
  nextFollowUpAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MediaKitRecord = {
  id: string;
  name: string;
  description: string | null;
  targetAudience: string | null;
  fileUrl: string | null;
  originalFilename: string | null;
  mimeType: string | null;
  fileSize: number | null;
  storageFilename: string | null;
  version: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EmailTemplateRecord = {
  id: string;
  name: string;
  type: string;
  subject: string;
  body: string;
  active: boolean;
};

export type OutreachEmailRecord = {
  id: string;
  sponsorContactId: string;
  mediaKitId: string | null;
  templateId: string | null;
  subject: string;
  body: string;
  scheduledSendAt: string | null;
  status: string;
  approvalRequired: boolean;
  approvedAt: string | null;
  previewedAt: string | null;
  sentAt: string | null;
  failureReason: string | null;
  draftedBy?: 'benson' | 'kellie' | 'template' | null;
  bensonDraftContext?: Record<string, unknown> | null;
  approvalNotifiedAt?: string | null;
  gmailThreadId?: string | null;
  sendProvider?: string | null;
  createdAt: string;
  updatedAt: string;
  sponsorBusinessName?: string;
  sponsorEmail?: string | null;
  sponsorContactName?: string | null;
  hasContactEmail?: boolean;
  contactConfidence?: {
    tier: 'high' | 'medium' | 'low' | 'none';
    label: string;
    usable: boolean;
  };
  isDuplicateContact?: boolean;
  /** See services/core/src/sponsor-outreach/recipient-safety.ts — approve/send must be disabled when blocked. */
  recipientSafety?: {
    sendable: boolean;
    blocked: boolean;
    blocks: Array<{ code: string; message: string }>;
    summary: string | null;
    syntheticFixture: boolean;
  };
  mediaKitName?: string | null;
  templateName?: string | null;
  sendAttempts?: Array<{
    id: string;
    attemptedAt: string;
    status: string;
    provider: string;
    providerMessageId?: string | null;
    recipient?: string | null;
    subject?: string | null;
    errorMessage: string | null;
  }>;
};

export type OutreachSendConfig = {
  mode: 'live' | 'simulate';
  liveEnabled: boolean;
  liveReady: boolean;
  provider: string | null;
  missingForLive: string[];
  fromEmail: string | null;
  replyTo: string | null;
  gmailConnected?: boolean;
  demoMode?: boolean;
};

export function formatFitScore(score: number | null): string {
  if (score == null) return '—';
  return `${Math.round(score * 100)}%`;
}

export function formatDate(value: string | null): string {
  return formatDateImport(value);
}

export function formatDateTime(value: string | null): string {
  return formatDateTimeImport(value);
}

export function statusLabel(status: string): string {
  return status.replace(/_/g, ' ');
}
