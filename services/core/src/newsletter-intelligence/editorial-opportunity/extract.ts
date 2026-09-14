import { createHash } from 'node:crypto';
import { normalizeBusinessKey } from '../../creator-interest/normalize.js';
import {
  classifyEditorialContentType,
  detectEditorialDevelopmentSignals,
  hasPlausibleCreatorAngle,
  isPersistableEditorialOpportunity,
} from './classifier.js';
import { calculateEditorialUrgency } from './urgency.js';
import type {
  ArticleAccessStatus,
  EditorialEvidence,
  EditorialOpportunityCandidate,
  EditorialDevelopmentType,
} from './types.js';

const OPENED_SENTENCE_RE =
  /([A-Z][A-Za-z0-9&.'\-\s]{1,60}?)\s+(?:opened|opens|is opening|will open)\s+(?:its|a|the|their)?\s*(?:new\s+)?[^.!?\n]{0,120}/gi;

const RETAILER_OPENED_RE =
  /(?:retailer|boutique|store|shop|restaurant|hotel|cafe|bakery)\s+([A-Z][A-Za-z0-9&.'\-\s]{1,50}?)\s+(?:\[[^\]]*\]\s*)?opened\s+(?:its|a|the|their)?\s*([^.!?\n]{5,120})/gi;

const NAMED_OPENED_RE =
  /\b([A-Z][A-Za-z0-9&.'\-]*(?:\s+[A-Z][A-Za-z0-9&.'\-]*){0,4})\s+(?:opened|opens)\s+(?:its|a|the|their)\s+([^.!?\n]{8,140})/g;

const DATE_RE =
  /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2}(?:,?\s+\d{4})?\b|\b\d{4}-\d{2}-\d{2}\b/gi;

const LOCATION_HINT_RE =
  /\b((?:Country Club )?Plaza|Power & Light|Westport|Crossroads|River Market|Overland Park|Lenexa|Olathe|Prairie Village|Kansas City(?:,?\s*(?:MO|KS))?)/i;

const SPECULATIVE_NAME_RE =
  /\b(?:what(?:'s| is) (?:next|the clubhouse)|spaces? remain|empty storefronts?|could be next)\b/i;

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function parseLooseDate(raw: string | null, fallbackYear?: number): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\./g, '').trim();
  // Sept. 3 / Sep 3 → assume current/fallback year
  const mdy = cleaned.match(
    /^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:,?\s+(\d{4}))?$/i,
  );
  if (mdy) {
    const months: Record<string, string> = {
      jan: '01',
      january: '01',
      feb: '02',
      february: '02',
      mar: '03',
      march: '03',
      apr: '04',
      april: '04',
      may: '05',
      jun: '06',
      june: '06',
      jul: '07',
      july: '07',
      aug: '08',
      august: '08',
      sep: '09',
      sept: '09',
      september: '09',
      oct: '10',
      october: '10',
      nov: '11',
      november: '11',
      dec: '12',
      december: '12',
    };
    const mon = months[mdy[1]!.toLowerCase()];
    const day = mdy[2]!.padStart(2, '0');
    const year = mdy[3] ?? String(fallbackYear ?? new Date().getFullYear());
    if (!mon) return null;
    return `${year}-${mon}-${day}`;
  }
  const iso = Date.parse(cleaned);
  if (!Number.isNaN(iso)) return new Date(iso).toISOString().slice(0, 10);
  return null;
}

function pickDateNear(text: string, receivedAt?: Date): string | null {
  const matches = text.match(DATE_RE);
  if (!matches?.length) return null;
  return parseLooseDate(matches[0]!, receivedAt?.getFullYear());
}

function locationFrom(text: string): { location: string | null; address: string | null } {
  const addr = text.match(/\b\d{3,5}\s+[A-Za-z0-9 .'-]+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Broadway|Parkway|Pkwy)\b/i);
  const loc = text.match(LOCATION_HINT_RE);
  return {
    location: loc ? normalizeWhitespace(loc[0]) : null,
    address: addr ? normalizeWhitespace(addr[0]) : null,
  };
}

function defaultAngles(developmentType: EditorialDevelopmentType, location: string | null): string[] {
  const angles = ['new store spotlight', 'local what’s new coverage', 'shopping review'];
  if (location) angles.splice(1, 0, `${location} update`);
  if (/first_to_market|retail|opening/i.test(developmentType)) {
    angles.push('store tour', 'styling experience');
  }
  if (/restaurant|menu/i.test(developmentType)) {
    angles.push('first look dining', 'menu highlight');
  }
  return [...new Set(angles)].slice(0, 6);
}

function whyItMatters(input: {
  businessName: string;
  developmentType: EditorialDevelopmentType;
  location: string | null;
  firstToMarket: boolean;
}): string {
  const loc = input.location ?? 'Kansas City';
  if (input.firstToMarket) {
    return `${input.businessName} is a first-to-market arrival in ${loc}, giving KCKellie a timely local retail/storytelling angle without needing an invitation.`;
  }
  return `${input.businessName} is a local business development in ${loc} that can support creator coverage, relationship outreach prep, or a what’s-new post — review before any outreach.`;
}

function normalizeDevelopmentForDedupe(developmentType: string): string {
  if (
    /opening|first_to_market|coming_soon|grand_opening|soft_opening|new_location|new_retail|restaurant_launch|hotel_opening|attraction_opening|business_opening|reopening|tenant_announcement/i.test(
      developmentType,
    )
  ) {
    return 'opening_family';
  }
  return developmentType;
}

export function buildEditorialDedupeIdentity(input: {
  businessName: string;
  location: string | null;
  developmentType: string;
  openingOrAnnouncementDate: string | null;
  canonicalArticleUrl: string | null;
  address: string | null;
}): string {
  const raw = [
    normalizeBusinessKey(input.businessName),
    normalizeBusinessKey(input.location ?? ''),
    normalizeDevelopmentForDedupe(input.developmentType),
    input.openingOrAnnouncementDate ?? '',
    // Prefer address over volatile article URL so multi-source openings merge.
    normalizeBusinessKey(input.address ?? ''),
    // Include host+path only when no address — still merge same article.
    input.address ? '' : (input.canonicalArticleUrl ?? ''),
  ].join('|');
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

function isWeakBusinessName(name: string): boolean {
  const n = name.trim();
  if (n.length < 3 || n.length > 60) return true;
  if (/^(the|a|an|this|that|it|they|luxury|new|local)$/i.test(n)) return true;
  if (SPECULATIVE_NAME_RE.test(n)) return true;
  if (/^(opening|store|shop|retailer|restaurant|plaza|clubhouse)$/i.test(n)) return true;
  if (/\b(what|which|how many|spaces remain)\b/i.test(n)) return true;
  return false;
}

function candidateFromMatch(input: {
  businessName: string;
  rest: string;
  fullText: string;
  subject: string;
  canonicalArticleUrl: string | null;
  emailSource: string | null;
  publicationDate: string | null;
  articleAccess: ArticleAccessStatus;
  receivedAt?: Date;
  evidenceSource: 'email' | 'article';
}): EditorialOpportunityCandidate | null {
  const businessName = normalizeWhitespace(input.businessName.replace(/\[|\]/g, ''));
  if (isWeakBusinessName(businessName)) return null;

  const signalText = `${input.subject}\n${businessName} opened ${input.rest}\n${input.fullText}`;
  const signals = detectEditorialDevelopmentSignals(signalText);
  const firstToMarket = signals.some((s) => s.developmentType === 'first_to_market');
  const developmentType: EditorialDevelopmentType =
    signals[0]?.developmentType ??
    (/\bstore|shop|boutique|retail/i.test(input.rest) ? 'new_retail_opening' : 'business_opening');

  const contentType = classifyEditorialContentType({
    text: signalText,
    subject: input.subject,
    articleBlocked: input.articleAccess === 'blocked' || input.articleAccess === 'subscription_required',
  });
  if (!isPersistableEditorialOpportunity(contentType)) return null;
  if (
    !hasPlausibleCreatorAngle({
      contentType,
      text: signalText,
      localMarket: true,
    })
  ) {
    return null;
  }

  const { location, address } = locationFrom(`${input.rest}\n${input.fullText}`);
  const openingOrAnnouncementDate = pickDateNear(`${input.rest} ${input.fullText}`, input.receivedAt);
  const excerpt = normalizeWhitespace(`${businessName} ${input.rest}`).slice(0, 280);
  const evidence: EditorialEvidence[] = [
    { excerpt, source: input.evidenceSource, field: 'opening_statement' },
  ];
  if (firstToMarket) {
    evidence.push({
      excerpt: 'first-to-market',
      source: input.evidenceSource,
      field: 'relevance_signal',
    });
  }

  const urgency = calculateEditorialUrgency({
    openingOrAnnouncementDate,
    publicationDate: input.publicationDate,
    developmentType,
  });

  const summary = normalizeWhitespace(
    `${businessName} — ${developmentType.replace(/_/g, ' ')}${location ? ` at ${location}` : ''}${
      openingOrAnnouncementDate ? ` (${openingOrAnnouncementDate})` : ''
    }.`,
  );

  const dedupeIdentity = buildEditorialDedupeIdentity({
    businessName,
    location,
    developmentType,
    openingOrAnnouncementDate,
    canonicalArticleUrl: input.canonicalArticleUrl,
    address,
  });

  return {
    businessName,
    developmentType,
    contentType,
    summary,
    location,
    address,
    market: location && /kansas city|plaza|overland|lenexa|olathe/i.test(location) ? 'Kansas City metro' : 'Kansas City metro',
    openingOrAnnouncementDate,
    canonicalArticleUrl: input.canonicalArticleUrl,
    emailSource: input.emailSource,
    publicationDate: input.publicationDate,
    evidence,
    whyItMatters: whyItMatters({ businessName, developmentType, location, firstToMarket }),
    suggestedAngles: defaultAngles(developmentType, location),
    suggestedNextAction:
      'Identify the official local or corporate PR/marketing contact; check for a legitimate creator, press, or affiliate program; prepare a personalized pitch for human review. Do not send outreach automatically.',
    urgency,
    confidence: Math.min(
      0.92,
      0.55 + (signals[0]?.weight ?? 2) * 0.06 + (openingOrAnnouncementDate ? 0.08 : 0),
    ),
    verificationState:
      input.articleAccess === 'fetched'
        ? 'article_supported'
        : input.evidenceSource === 'email'
          ? 'email_supported'
          : 'unverified',
    contactDiscoveryStatus: 'not_started',
    dedupeIdentity,
    articleAccess: input.articleAccess,
    calendarEligible: false,
    autoOutreach: false,
  };
}

/**
 * Extract distinct business-development opportunities from email and/or article text.
 * Does not invent businesses from speculative headline questions.
 */
export function extractEditorialOpportunities(input: {
  subject: string;
  emailText: string;
  articleText?: string | null;
  canonicalArticleUrl?: string | null;
  emailSource?: string | null;
  publicationDate?: string | null;
  articleAccess?: ArticleAccessStatus;
  receivedAt?: Date;
}): EditorialOpportunityCandidate[] {
  const articleAccess = input.articleAccess ?? (input.articleText ? 'fetched' : 'email_evidence_only');
  const sources: Array<{ text: string; source: 'email' | 'article' }> = [
    { text: input.emailText, source: 'email' },
  ];
  if (input.articleText?.trim()) {
    sources.push({ text: input.articleText, source: 'article' });
  }

  const byKey = new Map<string, EditorialOpportunityCandidate>();

  for (const src of sources) {
    const text = src.text;
    // Skip pure speculative headline-only extraction.
    if (SPECULATIVE_NAME_RE.test(input.subject) && !/\bopened\b|\bopens\b|\bnow open\b/i.test(text)) {
      continue;
    }

    const patterns = [RETAILER_OPENED_RE, NAMED_OPENED_RE, OPENED_SENTENCE_RE];
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const businessName = match[1] ?? '';
        const rest = match[2] ?? match[0] ?? '';
        // Avoid capturing leading role words as the business name.
        if (/^(luxury|women'?s|clothing|accessories|retailer|restaurant|local)\b/i.test(businessName)) {
          continue;
        }
        // Prefer proper names; drop sentence-leading junk like "Local retailer Harbor Lane".
        const cleanedName = businessName
          .replace(/^(?:Local\s+)?(?:retailer|boutique|store|shop|restaurant|hotel|cafe|bakery)\s+/i, '')
          .trim();
        if (!cleanedName || isWeakBusinessName(cleanedName)) continue;

        const candidate = candidateFromMatch({
          businessName: cleanedName,
          rest,
          fullText: text,
          subject: input.subject,
          canonicalArticleUrl: input.canonicalArticleUrl ?? null,
          emailSource: input.emailSource ?? null,
          publicationDate: input.publicationDate ?? null,
          articleAccess,
          receivedAt: input.receivedAt,
          evidenceSource: src.source,
        });
        if (!candidate) continue;
        const key = normalizeBusinessKey(candidate.businessName) + '|' + (candidate.location ?? '');
        const existing = byKey.get(key);
        if (!existing || candidate.confidence > existing.confidence) {
          byKey.set(key, candidate);
        }
      }
    }
  }

  return [...byKey.values()];
}
