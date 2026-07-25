import { searchWeb } from '../web-research/index.js';
import type { InventoryItem } from '../inventory/normalize.js';
import type { SponsorContactRecord } from './contacts.js';
import { updateSponsorContact } from './contacts.js';

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const JUNK_EMAIL_PATTERNS = [
  /noreply@/i,
  /no-reply@/i,
  /donotreply@/i,
  /example\.(com|org|net)$/i,
  /sentry\.io$/i,
  /wixpress\.com$/i,
  /facebook\.com$/i,
  /instagram\.com$/i,
  /tiktok\.com$/i,
  /twitter\.com$/i,
  /youtube\.com$/i,
  /google\.com$/i,
  /cloudflare\.com$/i,
];

function isUsableEmail(email: string): boolean {
  const lower = email.toLowerCase();
  if (lower.length > 80) return false;
  return !JUNK_EMAIL_PATTERNS.some((pattern) => pattern.test(lower));
}

export function extractEmailsFromText(text: string | null | undefined): string[] {
  if (!text?.trim()) return [];
  const matches = text.match(EMAIL_REGEX) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of matches) {
    const email = raw.toLowerCase();
    if (seen.has(email) || !isUsableEmail(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

function collectOpportunityText(item: InventoryItem): string {
  return [
    item.title,
    item.summary,
    item.whyItMatters,
    item.businessName,
    item.venue,
    item.address,
    item.locationName,
    item.neighborhood,
    item.sourceUrl,
    JSON.stringify(item.metadata ?? {}),
  ]
    .filter(Boolean)
    .join('\n');
}

function pickBestEmail(candidates: string[]): string | null {
  const partnership = candidates.find((e) =>
    /partner|press|media|marketing|info|hello|contact|events|sponsor|collab/i.test(e),
  );
  return partnership ?? candidates[0] ?? null;
}

export async function researchSponsorContact(input: {
  businessName: string;
  category?: string | null;
  location?: string | null;
  website?: string | null;
}): Promise<{
  email: string | null;
  website: string | null;
  contactName: string | null;
  source: 'web_search' | null;
}> {
  const location = input.location ?? 'Kansas City, MO';
  const query = [
    `"${input.businessName}"`,
    location,
    'contact email OR partnerships OR marketing',
    input.category ? `${input.category} business` : null,
  ]
    .filter(Boolean)
    .join(' ');

  const result = await searchWeb(
    query,
    'Find a real contact email for partnership or media inquiries at this Kansas City business. Prefer marketing@, partnerships@, info@, or a named contact. Also note their official website URL if different from the listing. Return JSON-like lines: EMAIL: ... WEBSITE: ... CONTACT: ... If none found, say EMAIL: not found.',
  );

  if (!result.ok || !result.summary) {
    return { email: null, website: null, contactName: null, source: null };
  }

  const emails = extractEmailsFromText(result.summary);
  const email = pickBestEmail(emails);

  let website: string | null = null;
  const websiteMatch = result.summary.match(/WEBSITE:\s*(https?:\/\/[^\s]+)/i);
  if (websiteMatch?.[1]) {
    website = websiteMatch[1].replace(/[.,;)]+$/, '');
  } else {
    const citation = result.citations.find((c) => !c.url.includes('facebook.com'));
    website = citation?.url ?? null;
  }

  let contactName: string | null = null;
  const contactMatch = result.summary.match(/CONTACT:\s*([^\n]+)/i);
  if (contactMatch?.[1] && !contactMatch[1].toLowerCase().includes('not found')) {
    contactName = contactMatch[1].trim().slice(0, 80);
  }

  return {
    email,
    website,
    contactName,
    source: email || website ? 'web_search' : null,
  };
}

export async function enrichSponsorContact(input: {
  contact: SponsorContactRecord;
  opportunity: InventoryItem | null;
  allowWebSearch?: boolean;
}): Promise<SponsorContactRecord> {
  const { contact, opportunity } = input;
  let email = contact.email?.trim() ?? null;
  let website = contact.website?.trim() ?? null;
  let contactName = contact.contactName?.trim() ?? null;

  if (!email && opportunity) {
    const fromText = extractEmailsFromText(collectOpportunityText(opportunity));
    email = pickBestEmail(fromText);
  }

  if (!email && input.allowWebSearch !== false) {
    const researched = await researchSponsorContact({
      businessName: contact.businessName,
      category: contact.category ?? opportunity?.category ?? null,
      location: opportunity?.neighborhood ?? opportunity?.locationName ?? 'Kansas City',
      website,
    });
    email = researched.email ?? email;
    if (!website && researched.website) website = researched.website;
    if (!contactName && researched.contactName) contactName = researched.contactName;
  }

  const patch: Parameters<typeof updateSponsorContact>[1] = {};
  if (email && email !== contact.email) patch.email = email;
  if (website && website !== contact.website) patch.website = website;
  if (contactName && contactName !== contact.contactName) patch.contactName = contactName;

  if (Object.keys(patch).length === 0) return contact;
  const updated = await updateSponsorContact(contact.id, patch);
  return updated ?? contact;
}
