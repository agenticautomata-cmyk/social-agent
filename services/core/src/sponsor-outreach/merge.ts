import type { InventoryItem } from '../inventory/normalize.js';
import type { EmailTemplate } from '../schema.js';
import { KELLIE_NAME } from './constants.js';
import { getCreatorContactChannels } from '../creator-info/index.js';

export type MergeContext = {
  businessName: string;
  contactName: string;
  category: string;
  kellieName: string;
  bensonRecommendation: string;
  mediaKitName?: string;
  mediaKitUrl?: string;
  eventName?: string;
  eventDate?: string;
  location?: string;
  contactEmail?: string;
  sponsorsEmail?: string;
  mediaEmail?: string;
  collabsEmail?: string;
  bookingEmail?: string;
};

export function buildMergeContext(input: {
  businessName: string;
  contactName?: string | null;
  category?: string | null;
  bensonRecommendation?: string | null;
  mediaKitName?: string | null;
  mediaKitUrl?: string | null;
  opportunity?: InventoryItem | null;
}): MergeContext {
  const opp = input.opportunity;
  const channels = Object.fromEntries(getCreatorContactChannels().map((c) => [c.id, c.email])) as Record<string, string>;
  return {
    businessName: input.businessName,
    contactName: input.contactName?.trim() || 'there',
    category: input.category?.replace(/_/g, ' ') || 'local business',
    kellieName: KELLIE_NAME,
    bensonRecommendation:
      input.bensonRecommendation?.trim() ||
      opp?.whyItMatters ||
      'Benson flagged this as a strong sponsor-friendly match for your KC audience.',
    mediaKitName: input.mediaKitName ?? '',
    mediaKitUrl: input.mediaKitUrl ?? '(media kit attached)',
    eventName: opp?.title ?? input.businessName,
    eventDate: opp?.eventDate ?? '',
    location: opp?.venue ?? opp?.locationName ?? opp?.neighborhood ?? 'Kansas City',
    contactEmail: channels.contact ?? '',
    sponsorsEmail: channels.sponsors ?? '',
    mediaEmail: channels.media ?? '',
    collabsEmail: channels.collabs ?? '',
    bookingEmail: channels.booking ?? '',
  };
}

const MERGE_MAP: Record<string, keyof MergeContext | 'mediaKitName' | 'mediaKitUrl' | 'eventName' | 'eventDate' | 'location'> = {
  business_name: 'businessName',
  contact_name: 'contactName',
  category: 'category',
  kellie_name: 'kellieName',
  benson_recommendation: 'bensonRecommendation',
  media_kit_name: 'mediaKitName',
  media_kit_url: 'mediaKitUrl',
  event_name: 'eventName',
  event_date: 'eventDate',
  location: 'location',
  contact_email: 'contactEmail',
  sponsors_email: 'sponsorsEmail',
  media_email: 'mediaEmail',
  collabs_email: 'collabsEmail',
  booking_email: 'bookingEmail',
};

function snakeToCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function applyMergeFields(template: string, context: MergeContext): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, rawKey: string) => {
    const key = rawKey.toLowerCase();
    const mapped = MERGE_MAP[key];
    if (mapped) {
      const value = context[mapped as keyof MergeContext];
      return value != null ? String(value) : '';
    }
    const camel = snakeToCamel(key) as keyof MergeContext;
    const value = context[camel];
    return value != null ? String(value) : '';
  });
}

export function renderTemplate(
  template: Pick<EmailTemplate, 'subject' | 'body'>,
  context: MergeContext,
): { subject: string; body: string } {
  return {
    subject: applyMergeFields(template.subject, context),
    body: applyMergeFields(template.body, context),
  };
}
