import { normalizeTitleTokens } from './dedupe.js';
import { collectNormalizedDatesFromText, recoverDatesNearTitle } from './date-normalize.js';
import type { ExtractedNewsletterItem, EntityType, OccurrenceType } from './types.js';

const EVENT_SIGNAL =
  /\b(?:ribbon cutting|grand opening|opening|opens? to the public|concert|festival|market|workshop|tasting|show|performance|event|tickets?|rsvp|pop[- ]?up|fair|happy hour|now open)\b/i;

const STRONG_EVENT =
  /\b(?:ribbon cutting|grand opening|opens? to the public|concert|festival|workshop|tasting|performance|fair|happy hour|pop[- ]?up)\b/i;

const EVENTISH_TITLE =
  /\b(?:night|show|concert|festival|market|opening|walk|smash|feast|workshop|tasting|gala|fundraiser)\b/i;

const NEWS_PAST =
  /\b(?:voted|approved|backed (?:a |the )?proposal|is relocating|opened its|plans? to transform|won'?t be (?:a )?dated event)\b/i;

const CHROME =
  /\b(?:unsubscribe|view (?:this )?(?:email|post) (?:in (?:your )?)?(?:browser|web)|manage preferences|privacy policy|thanks for reading|subscribe for free|view in browser)\b/i;

const SECTION_HEADER =
  /^(?:now open|opening soon|closings?|openings?|this week|upcoming events|new openings|closings and openings)$/i;

const RETAIL_SALES =
  /\bbest sellers?\b|\bjust for you\b|\b\d{1,3}%\s*off\b|\bshop now\b|\badd to cart\b|\bfree shipping\b|\bsitewide sale\b/i;

const SECURITY =
  /\bemail address verification\b|\bverify your email\b|\bpassword reset\b|\bsecurity (?:alert|code)\b|\bconfirm your (?:email|account)\b/i;

const CLOCK_RE = /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i;
const ADDRESS_RE =
  /\b(\d{2,5}\s+[A-Za-z0-9.]+(?:\s+[A-Za-z.]+){0,4}\s+(?:St|Street|Rd|Road|Blvd|Boulevard|Pkwy|Parkway|Ave|Avenue|Dr|Drive|Ln|Lane|Ter|Terrace|Way)\.?)\b/i;
const AT_VENUE_RE = /\bat\s+([A-Z][A-Za-z0-9'’& -]{2,60}?)(?:\s+on\b|\s+from\b|,|\.|$)/;
const CITY_RE =
  /\b(Kansas City|Overland Park|Olathe|Lenexa|Shawnee|Leawood|Prairie Village|Independence|Lee'?s Summit|Mission|Westport)\b/i;

const MAX_OCCURRENCES = 20;

export function looksLikeHtmlDocument(text: string): boolean {
  const head = text.slice(0, 4000);
  return /<\/?[a-z][\s\S]*>/i.test(text.slice(0, 2000)) && /<!doctype|<html|<body|<table|<div|<p[\s>]/i.test(head);
}

export function htmlToNewsletterText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[^\S\n]+/g, ' ')
    .trim();
}

export function newsletterPlainText(bodyText: string, bodyHtml = ''): string {
  const trimmed = (bodyText ?? '').trim();
  const html = (bodyHtml ?? '').trim();
  if (trimmed && looksLikeHtmlDocument(trimmed)) return htmlToNewsletterText(trimmed).slice(0, 14000);
  if (trimmed) return trimmed.slice(0, 14000);
  if (html) return htmlToNewsletterText(html).slice(0, 14000);
  return '';
}

export function newsletterOccurrenceKey(item: Pick<ExtractedNewsletterItem, 'title' | 'startDate' | 'endDate'>): string {
  return `${normalizeTitleTokens(item.title)}|${item.startDate ?? ''}|${item.endDate ?? ''}`;
}

export function mergeNewsletterOccurrenceItems(
  primary: ExtractedNewsletterItem[],
  extra: ExtractedNewsletterItem[],
): ExtractedNewsletterItem[] {
  const keys = new Set(primary.map((item) => newsletterOccurrenceKey(item)));
  const out = [...primary];
  for (const item of extra) {
    const key = newsletterOccurrenceKey(item);
    if (keys.has(key)) continue;
    keys.add(key);
    out.push(item);
  }
  return out;
}

function stripTrackingUrls(text: string): string {
  return text
    .replace(/\[\s*https?:\/\/[^\]]+\]/gi, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function clockFromBlock(block: string): string | null {
  if (/\bhours\s*:/i.test(block)) {
    const nearDate = block.match(
      /(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?[^.]{0,48}?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/i,
    );
    if (!nearDate) return null;
    return normalizeClock(nearDate[1]!, nearDate[2], nearDate[3]!);
  }
  const clock = CLOCK_RE.exec(block);
  if (!clock) return null;
  return normalizeClock(clock[1]!, clock[2], clock[3]!);
}

function normalizeClock(rawHour: string, rawMinute: string | undefined, meridiem: string): string {
  let hour = Number(rawHour);
  const minute = rawMinute ?? '00';
  const pm = meridiem.toLowerCase().includes('p');
  if (pm && hour < 12) hour += 12;
  if (!pm && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${minute.padStart(2, '0')}`;
}

function inferOccurrenceType(block: string): OccurrenceType {
  if (/\bribbon cutting|grand opening|opens? to the public|opening\b/i.test(block)) return 'opening';
  if (/\bconcert|show|performance\b/i.test(block)) return 'concert';
  if (/\bfestival\b/i.test(block)) return 'festival';
  if (/\bmarket\b/i.test(block)) return 'market';
  if (/\bworkshop\b/i.test(block)) return 'workshop';
  if (/\btasting\b/i.test(block)) return 'tasting';
  return 'general_event';
}

function inferEntityType(block: string): EntityType {
  if (/\brestaurant|kitchen|cafe|coffee|bakery|bar|brew|pho|pizza|dining\b/i.test(block)) return 'restaurant';
  if (/\bmarket|store|shop|retail|outlet\b/i.test(block)) return 'retailer';
  if (/\bzoo|aquarium|museum|park\b/i.test(block)) return 'attraction';
  if (/\bvenue|theater|theatre\b/i.test(block)) return 'event_venue';
  return 'local_business';
}

function titleFromBlock(block: string): string | null {
  const physical = stripTrackingUrls(block).split(/\n/).map((line) => line.trim()).filter(Boolean)[0] ?? '';
  const sentence = physical.split(/(?<=[.!?])\s+/)[0]?.trim() ?? physical;
  const cleaned = sentence.replace(/\s+/g, ' ').trim();
  if (!cleaned || SECTION_HEADER.test(cleaned) || CHROME.test(cleaned)) return null;
  const beforeComma = cleaned.split(',')[0]?.trim() ?? cleaned;
  const beforeRemains = beforeComma.replace(
    /\s+(?:remains open|is opening|opens|open|returns|runs|is featuring|will have|plans? a).*$/i,
    '',
  );
  const named = beforeRemains
    .replace(/^(?:don't miss|join us for|this weekend:?)\s+/i, '')
    .replace(/\s+coming saturday!?$/i, '')
    .replace(
      /\s+(?:on\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\.?$/i,
      '',
    )
    .replace(
      /\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}.*$/i,
      '',
    )
    .trim();
  if (!named || named.length < 3 || named.length > 80) return null;
  if (SECTION_HEADER.test(named) || /^(?:your|the)\s+aug/i.test(named)) return null;
  if (/^list of\b/i.test(named)) return null;
  if (
    /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow)$/i.test(
      named,
    )
  ) {
    return null;
  }
  if (
    /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i.test(
      named,
    )
  ) {
    return null;
  }
  if (
    /^(?:when|where|hours):?$/i.test(named) ||
    /tickets remain|you(?:'|’)ve won|absolutely adorable|let you know you(?:'|’)ve won/i.test(
      named,
    )
  ) {
    return null;
  }
  if (/^(?:the|a|an)\s+.+\b(?:voted|approved|backed|relocating)\b/i.test(named)) {
    return null;
  }
  return named;
}

function splitBlocks(plain: string): string[] {
  const paragraphs = plain
    .split(/\n{2,}/)
    .flatMap((chunk) => chunk.split(/\n+/))
    .map((line) => stripTrackingUrls(line).replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 8);
  const blocks: string[] = [];
  for (const line of paragraphs) {
    if (line.length > 420 && /\.\s+[A-Z]/.test(line)) {
      blocks.push(...line.split(/(?<=\.)\s+(?=[A-Z])/).map((part) => part.trim()).filter(Boolean));
    } else {
      blocks.push(line);
    }
  }
  return blocks;
}

function isControlEmail(subject: string, plain: string): boolean {
  const blob = `${subject}\n${plain}`;
  if (SECURITY.test(blob)) return true;
  if (RETAIL_SALES.test(blob) && !EVENT_SIGNAL.test(blob)) return true;
  return false;
}

export function extractDatedOccurrencesFromPlainText(input: {
  subject?: string;
  bodyText: string;
  bodyHtml?: string;
  emailSentAt?: Date | string | null;
}): ExtractedNewsletterItem[] {
  const subject = input.subject ?? '';
  const plain = newsletterPlainText(input.bodyText, input.bodyHtml ?? '');
  if (!plain || isControlEmail(subject, plain)) return [];

  const working = stripTrackingUrls(plain);
  const items: ExtractedNewsletterItem[] = [];
  const seen = new Set<string>();

  const lines = splitBlocks(working);
  const windows: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    windows.push(lines[i]!);
    if (lines[i + 1]) windows.push(`${lines[i]}\n${lines[i + 1]}`);
  }

  for (const block of windows) {
    if (items.length >= MAX_OCCURRENCES) break;
    if (CHROME.test(block) || SECTION_HEADER.test(block)) continue;
    if (NEWS_PAST.test(block) && !STRONG_EVENT.test(block)) continue;
    if (!EVENT_SIGNAL.test(block) && !STRONG_EVENT.test(block) && !AT_VENUE_RE.test(block)) continue;

    const title = titleFromBlock(block);
    if (!title) continue;
    if (
      !STRONG_EVENT.test(block) &&
      !EVENTISH_TITLE.test(title) &&
      !EVENTISH_TITLE.test(block) &&
      !(AT_VENUE_RE.test(block) && title.split(/\s+/).length <= 8)
    ) {
      continue;
    }

    const recovered = recoverDatesNearTitle({
      title,
      description: block,
      bodyText: block,
      emailSentAt: input.emailSentAt,
    });
    const explicitDates = collectNormalizedDatesFromText(block, input.emailSentAt);
    if (!recovered.startDate) continue;
    if (explicitDates.length === 0 && !recovered.endDate) continue;
    const startDate =
      explicitDates.length > 0 && !explicitDates.includes(recovered.startDate)
        ? explicitDates[0]!
        : recovered.startDate;
    const endDate =
      recovered.endDate &&
      (explicitDates.length === 0 ||
        explicitDates.includes(recovered.endDate) ||
        recovered.endDate !== startDate)
        ? recovered.endDate
        : null;

    const startTime = clockFromBlock(block);
    const city = CITY_RE.exec(block)?.[1] ?? null;
    const streetAddress = ADDRESS_RE.exec(block)?.[1] ?? null;
    const venue = AT_VENUE_RE.exec(block)?.[1]?.trim() ?? null;

    const item: ExtractedNewsletterItem = {
      entityName: title,
      entityType: inferEntityType(block),
      occurrenceType: inferOccurrenceType(block),
      title,
      description: block.slice(0, 400),
      startDate,
      endDate,
      startTime,
      endTime: null,
      timezone: 'America/Chicago',
      venue,
      streetAddress,
      city,
      state: city ? 'MO' : null,
      zipCode: null,
      neighborhood: null,
      price: null,
      isFree: null,
      ageRestriction: null,
      rsvpRequired: null,
      reservationLink: null,
      ticketLink: null,
      officialWebsite: null,
      officialSocialLink: null,
      phone: null,
      organizer: null,
      sourceUrl: null,
      confidence: 0.62,
      layer: 'occurrence',
    };
    const key = newsletterOccurrenceKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }

  return items;
}
