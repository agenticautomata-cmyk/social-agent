/**
 * Structured synthesis from web research + provenance. Never fabricates emails
 * or marks third-party affiliate listings as official compensation.
 */

import OpenAI from 'openai';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { env } from '../env.js';
import type { WebResearchResult } from '../web-research/index.js';
import { sanitizeContactCandidate } from './contact-rules.js';
import { claimFrom } from './dossier.js';
import type {
  ClaimedFact,
  ClaimLabel,
  NewsItem,
  OfficialBusinessInfo,
  OpportunityContact,
  PartnershipProgram,
  ProgramType,
  ResearchCitation,
} from './types.js';

const ContactSchema = z.object({
  name: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  organization: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  contactFormUrl: z.string().nullable().optional(),
  sourceUrl: z.string().nullable().optional(),
  sourceType: z.enum(['official', 'directory', 'news', 'email', 'article', 'other']).optional(),
  scope: z.enum(['local', 'corporate', 'agency', 'generic']).optional(),
  relevanceReason: z.string().nullable().optional(),
  publishedOnSource: z.boolean().optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
});

const ProgramSchema = z.object({
  name: z.string().nullable().optional(),
  programType: z.enum([
    'creator',
    'influencer',
    'ambassador',
    'affiliate',
    'referral',
    'press_media',
    'local_partnership',
    'community_partnership',
    'hosted_experience',
    'gifting_seeding',
    'event_media_access',
  ]),
  officialUrl: z.string().nullable().optional(),
  eligibility: z.string().nullable().optional(),
  applicationMethod: z.string().nullable().optional(),
  compensation: z.string().nullable().optional(),
  compensationFromOfficialSource: z.boolean().optional(),
  fromThirdPartyAffiliateNetworkOnly: z.boolean().optional(),
  geographicLimitations: z.string().nullable().optional(),
  status: z.enum(['active', 'inactive', 'unknown']).optional(),
  sourceUrl: z.string().nullable().optional(),
});

const SynthesisSchema = z.object({
  officialName: z.string().nullable().optional(),
  parentCompany: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  locationPage: z.string().nullable().optional(),
  streetAddress: z.string().nullable().optional(),
  cityStateZip: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  hours: z.string().nullable().optional(),
  openingDate: z.string().nullable().optional(),
  grandOpening: z.string().nullable().optional(),
  appointmentsRequired: z.string().nullable().optional(),
  offerings: z.array(z.string()).optional(),
  socials: z.record(z.string()).optional(),
  mapLink: z.string().nullable().optional(),
  fieldLabels: z.record(z.enum(['verified', 'partially_verified', 'unverified_lead', 'conflicting', 'not_found', 'blocked'])).optional(),
  contacts: z.array(ContactSchema).default([]),
  programs: z.array(ProgramSchema).default([]),
  news: z
    .array(
      z.object({
        title: z.string(),
        url: z.string(),
        factSummary: z.string(),
      }),
    )
    .default([]),
  missingOrConflicting: z.array(z.string()).default([]),
  brandPositioning: z.string().nullable().optional(),
  paywallOrAuthBlocked: z.boolean().optional(),
});

export type SynthesisBundle = {
  business: OfficialBusinessInfo;
  contacts: OpportunityContact[];
  programs: PartnershipProgram[];
  news: NewsItem[];
  missingOrConflicting: string[];
  brandPositioning: string | null;
  paywallOrAuthBlocked: boolean;
};

function cite(url: string | null | undefined, title: string | null, sourceType: ResearchCitation['sourceType']): ResearchCitation[] {
  if (!url) return [];
  return [{ url, title, retrievedAt: new Date().toISOString(), sourceType }];
}

function labelFor(
  field: string,
  value: string | null | undefined,
  labels: Record<string, ClaimLabel> | undefined,
  fallback: ClaimLabel,
): ClaimLabel {
  if (!value) return 'not_found';
  return labels?.[field] ?? fallback;
}

export function applySynthesisJson(
  parsed: z.infer<typeof SynthesisSchema>,
  webCitations: ResearchCitation[],
): SynthesisBundle {
  const labels = parsed.fieldLabels ?? {};
  const primaryCite = webCitations[0];
  const fallbackCites = webCitations;

  const fact = (field: string, value: string | null | undefined, sourceType: ResearchCitation['sourceType'] = 'other') =>
    claimFrom(
      value ?? null,
      labelFor(field, value, labels, value ? 'unverified_lead' : 'not_found'),
      value && primaryCite ? cite(primaryCite.url, primaryCite.title, sourceType) : fallbackCites.slice(0, 1),
    );

  const business: OfficialBusinessInfo = {
    officialName: fact('officialName', parsed.officialName, 'official'),
    parentCompany: fact('parentCompany', parsed.parentCompany, 'official'),
    category: fact('category', parsed.category, 'official'),
    website: fact('website', parsed.website, 'official'),
    locationPage: fact('locationPage', parsed.locationPage, 'official'),
    streetAddress: fact('streetAddress', parsed.streetAddress, 'official'),
    cityStateZip: fact('cityStateZip', parsed.cityStateZip, 'official'),
    phone: fact('phone', parsed.phone, 'official'),
    hours: fact('hours', parsed.hours, 'official'),
    openingDate: fact('openingDate', parsed.openingDate, 'news'),
    grandOpening: fact('grandOpening', parsed.grandOpening, 'news'),
    appointmentsRequired: fact('appointmentsRequired', parsed.appointmentsRequired, 'official'),
    offerings: {
      value: parsed.offerings?.length ? parsed.offerings : null,
      label: parsed.offerings?.length
        ? labelFor('offerings', 'x', labels, 'unverified_lead')
        : 'not_found',
      citations: fallbackCites.slice(0, 1),
    },
    socials: {
      value: parsed.socials && Object.keys(parsed.socials).length ? parsed.socials : null,
      label: parsed.socials && Object.keys(parsed.socials).length
        ? labelFor('socials', 'x', labels, 'partially_verified')
        : 'not_found',
      citations: fallbackCites.slice(0, 1),
    },
    mapLink: fact('mapLink', parsed.mapLink, 'directory'),
  };

  const contacts = parsed.contacts
    .map((c) =>
      sanitizeContactCandidate({
        name: c.name,
        title: c.title,
        organization: c.organization,
        email: c.email,
        phone: c.phone,
        contactFormUrl: c.contactFormUrl,
        sourceUrl: c.sourceUrl,
        sourceType: c.sourceType,
        scope: c.scope,
        relevanceReason: c.relevanceReason,
        publishedEmails: c.publishedOnSource && c.email ? [c.email] : [],
        confidence: c.confidence,
        claimedVerified: Boolean(c.publishedOnSource && c.sourceType === 'official'),
      }),
    )
    .filter((c): c is OpportunityContact => c != null);

  const programs: PartnershipProgram[] = parsed.programs.map((p) => {
    const thirdPartyOnly = Boolean(p.fromThirdPartyAffiliateNetworkOnly);
    const compensationOfficial = Boolean(p.compensationFromOfficialSource) && !thirdPartyOnly;
    const verification: ClaimLabel = thirdPartyOnly
      ? 'unverified_lead'
      : p.officialUrl
        ? 'partially_verified'
        : p.name
          ? 'unverified_lead'
          : 'not_found';
    return {
      id: randomUUID(),
      name: p.name ?? null,
      programType: p.programType as ProgramType,
      officialUrl: p.officialUrl ?? null,
      eligibility: p.eligibility ?? null,
      applicationMethod: p.applicationMethod ?? null,
      compensation: compensationOfficial ? p.compensation ?? null : thirdPartyOnly ? null : p.compensation ?? null,
      compensationOfficial,
      geographicLimitations: p.geographicLimitations ?? null,
      status: p.status ?? 'unknown',
      retrievedAt: new Date().toISOString(),
      verificationStatus: verification,
      citations: cite(p.sourceUrl ?? p.officialUrl, p.name ?? null, thirdPartyOnly ? 'other' : 'official'),
      notes: thirdPartyOnly
        ? 'Listed on a third-party affiliate network only — do not treat as official creator compensation.'
        : null,
    };
  });

  // Keep creator vs affiliate separate even if similarly named.
  const seenTypes = new Set<string>();
  for (const p of programs) {
    seenTypes.add(p.programType);
  }

  const news: NewsItem[] = parsed.news.map((n) => ({
    title: n.title,
    url: n.url,
    retrievedAt: new Date().toISOString(),
    factSummary: n.factSummary,
    isStrategySuggestion: false as const,
  }));

  return {
    business,
    contacts,
    programs,
    news,
    missingOrConflicting: parsed.missingOrConflicting,
    brandPositioning: parsed.brandPositioning ?? null,
    paywallOrAuthBlocked: Boolean(parsed.paywallOrAuthBlocked),
  };
}

export async function synthesizeOpportunityResearch(input: {
  businessName: string;
  location: string | null;
  summary: string | null;
  provenance: { articleUrls: string[]; emailSource: string | null };
  webResults: Array<{ key: string; result: WebResearchResult }>;
}): Promise<SynthesisBundle> {
  const citations: ResearchCitation[] = [];
  for (const wr of input.webResults) {
    for (const c of wr.result.citations ?? []) {
      citations.push({
        url: c.url,
        title: c.title,
        retrievedAt: new Date().toISOString(),
        sourceType: /press|news|substack|pitch|kansascity/i.test(c.url) ? 'news' : 'other',
      });
    }
  }

  const fallback = heuristicSynthesis(input, citations);
  if (!env.OPENAI_API_KEY) return fallback;

  const summaries = input.webResults.map((w) => ({
    key: w.key,
    ok: w.result.ok,
    skipped: w.result.skipped ?? false,
    error: w.result.error ?? null,
    summary: w.result.summary,
    citations: w.result.citations,
  }));

  try {
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: env.BENSON_ASK_MODEL,
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 2500,
      messages: [
        {
          role: 'system',
          content: `You extract opportunity research for a Kansas City creator assistant.
Rules:
- Use ONLY facts present in the provided web research / provenance. Never invent emails, phones, hours, or programs.
- Extract official website URLs from markdown links like [site](https://...) when present.
- Never guess email addresses from name patterns (first.last@...).
- Never mark inferred emails verified. publishedOnSource=true only when the email appears on an official page in the evidence.
- Prefer official first-party sources over directories; if they conflict, keep official and note conflict.
- Directory phones/hours are allowed as unverified_lead / partially_verified with a note — do not drop them.
- Affiliate network listings alone do NOT prove official creator compensation — set fromThirdPartyAffiliateNetworkOnly=true and leave compensationOfficial false.
- Keep creator/influencer programs separate from affiliate programs.
- If a source is paywalled/login-walled, set paywallOrAuthBlocked=true and do not invent the content.
- For unknown fields use null and fieldLabels not_found.
- news[].factSummary must be factual only (not strategy).
Respond JSON matching the schema keys.`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            businessName: input.businessName,
            location: input.location,
            summary: input.summary,
            provenance: input.provenance,
            webResearch: summaries,
          }),
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return fallback;
    const parsed = SynthesisSchema.parse(JSON.parse(content));
    return mergeSynthesis(applySynthesisJson(parsed, citations), fallback);
  } catch (err) {
    console.warn('[opportunity-research] synthesize failed:', err instanceof Error ? err.message : err);
    return fallback;
  }
}

/** Deterministic extraction for tests / LLM-unavailable paths. */
export function heuristicSynthesis(
  input: {
    businessName: string;
    location: string | null;
    summary: string | null;
    provenance: { articleUrls: string[]; emailSource: string | null };
    webResults: Array<{ key: string; result: WebResearchResult }>;
  },
  citations: ResearchCitation[],
): SynthesisBundle {
  const blob = [
    ...input.webResults.map((w) => w.result.summary ?? ''),
    ...input.webResults.flatMap((w) => (w.result.citations ?? []).map((c) => `${c.title ?? ''} ${c.url}`)),
  ].join('\n');

  const markdownUrls = [...blob.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[2]!);
  const bareUrls = blob.match(/https?:\/\/[^\s)"'\]]+/g) ?? [];
  const citationUrls = input.webResults.flatMap((w) => (w.result.citations ?? []).map((c) => c.url));
  const allUrls = [...new Set([...markdownUrls, ...bareUrls, ...citationUrls].map((u) => u.replace(/[.,;]+$/, '')))];

  const nameTokens = input.businessName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
  const scoreOfficial = (url: string): number => {
    try {
      const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
      if (/substack|facebook|instagram|tiktok|yelp|cylex|yellowpages|bizjournals|maps\.google|openai/i.test(host)) {
        return -5;
      }
      let score = 0;
      if (nameTokens.length && nameTokens.every((t) => host.includes(t))) score += 8;
      const compact = nameTokens.join('');
      if (compact.length > 4 && host.replace(/[^a-z0-9]/g, '').includes(compact)) score += 10;
      if (nameTokens.some((t) => host.includes(t))) score += 4;
      if (/store|location|locator|shops|boutiques/i.test(url)) score += 2;
      if (/contact|press|media|partner|creator|influencer/i.test(url)) score += 2;
      return score;
    } catch {
      return -10;
    }
  };

  const rankedUrls = [...allUrls].sort((a, b) => scoreOfficial(b) - scoreOfficial(a));
  const homepage =
    rankedUrls.find((u) => {
      try {
        const parsed = new URL(u);
        return scoreOfficial(u) >= 4 && (parsed.pathname === '/' || parsed.pathname === '');
      } catch {
        return false;
      }
    }) ?? null;
  const officialSite =
    homepage ??
    rankedUrls.find((u) => scoreOfficial(u) >= 4 && !/contact|press|media|login|cart|account/i.test(u)) ??
    rankedUrls.find((u) => scoreOfficial(u) >= 4) ??
    null;
  const locationPage =
    rankedUrls.find((u) => scoreOfficial(u) >= 2 && /store|location|locator|shops|plaza/i.test(u)) ?? null;
  const formUrl =
    rankedUrls.find((u) => /contact|press|media|partner|creator|influencer/i.test(u) && scoreOfficial(u) >= 0) ??
    null;

  const phoneMatch = blob.match(/\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  const hoursMatch =
    blob.match(/(?:operating hours|hours)[:\s]+([\s\S]{10,160}?)(?:\n\n|Please note|For more|$)/i) ??
    blob.match(/((?:Monday|Mon)[^\n]{0,40}(?:AM|PM)[^\n]{0,80})/i);
  const addrMatch = blob.match(
    /\d{2,5}\s+[A-Za-z0-9 .'-]+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Broadway|Lane|Ln|Drive|Dr)\b[^,\n]*/i,
  );
  const zipMatch = blob.match(/\b([A-Za-z .]+,\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?)\b/);

  const directoryPhone = phoneMatch && /cylex|yelp|yellowpages|directory/i.test(blob);
  const socials: Record<string, string> = {};
  for (const u of allUrls) {
    if (/instagram\.com/i.test(u)) socials.instagram = u;
    if (/facebook\.com/i.test(u)) socials.facebook = u;
    if (/tiktok\.com/i.test(u)) socials.tiktok = u;
    if (/linkedin\.com/i.test(u)) socials.linkedin = u;
  }

  const contacts = [
    sanitizeContactCandidate({
      name: null,
      title: formUrl ? 'Press / contact form' : phoneMatch ? 'Store phone' : null,
      organization: input.businessName,
      email: null,
      phone: phoneMatch?.[0] ?? null,
      contactFormUrl: formUrl,
      sourceUrl: formUrl ?? officialSite ?? citationUrls[0] ?? null,
      sourceType: formUrl || officialSite ? 'official' : directoryPhone ? 'directory' : 'other',
      scope: formUrl ? 'corporate' : 'local',
      relevanceReason: formUrl
        ? 'Official contact/press form retained when no public email exists'
        : phoneMatch
          ? directoryPhone
            ? 'Public phone from directory source — confirm against official page'
            : 'Public phone found in research summary'
          : 'No public contact path extracted',
      publishedEmails: [],
      confidence: directoryPhone ? 'low' : 'medium',
    }),
  ].filter((c): c is OpportunityContact => c != null && Boolean(c.phone || c.contactFormUrl));

  const citeOfficial = officialSite
    ? cite(officialSite, 'Official website', 'official')
    : citations.slice(0, 1);

  return {
    business: {
      officialName: claimFrom(input.businessName, 'partially_verified', citations),
      parentCompany: claimFrom(null, 'not_found'),
      category: claimFrom(null, 'not_found'),
      website: claimFrom(officialSite, officialSite ? 'partially_verified' : 'not_found', citeOfficial),
      locationPage: claimFrom(
        locationPage,
        locationPage ? 'unverified_lead' : 'not_found',
        locationPage ? cite(locationPage, 'Location page', 'official') : [],
      ),
      streetAddress: claimFrom(
        addrMatch?.[0]?.trim() ?? null,
        addrMatch ? (directoryPhone ? 'unverified_lead' : 'partially_verified') : 'not_found',
        citations.slice(0, 1),
      ),
      cityStateZip: claimFrom(
        zipMatch?.[1] ?? input.location,
        zipMatch || input.location ? 'partially_verified' : 'not_found',
        citations,
      ),
      phone: claimFrom(
        phoneMatch?.[0] ?? null,
        phoneMatch ? (directoryPhone ? 'unverified_lead' : 'partially_verified') : 'not_found',
        citations.slice(0, 1),
        directoryPhone ? 'Directory-sourced phone — confirm on official page' : null,
      ),
      hours: claimFrom(
        hoursMatch?.[1]?.replace(/\s+/g, ' ').trim().slice(0, 160) ?? null,
        hoursMatch ? (directoryPhone ? 'unverified_lead' : 'partially_verified') : 'not_found',
        citations.slice(0, 1),
      ),
      openingDate: claimFrom(null, 'not_found'),
      grandOpening: claimFrom(null, 'not_found'),
      appointmentsRequired: claimFrom(null, 'not_found'),
      offerings: { value: null, label: 'not_found', citations: [] },
      socials: {
        value: Object.keys(socials).length ? socials : null,
        label: Object.keys(socials).length ? 'partially_verified' : 'not_found',
        citations: citations.slice(0, 1),
      },
      mapLink: claimFrom(null, 'not_found'),
    },
    contacts,
    programs: [],
    news: input.provenance.articleUrls.map((url) => ({
      title: input.provenance.emailSource ?? 'Source article',
      url,
      retrievedAt: new Date().toISOString(),
      factSummary: input.summary?.slice(0, 280) ?? 'Provenance article retained from discovery.',
      isStrategySuggestion: false as const,
    })),
    missingOrConflicting: [
      !officialSite ? 'Official website not found' : null,
      !phoneMatch ? 'Public phone not found' : null,
      !formUrl ? 'Press/contact form not found' : null,
    ].filter((x): x is string => Boolean(x)),
    brandPositioning: null,
    paywallOrAuthBlocked: input.webResults.some((w) =>
      /paywall|authentication required|login/i.test(w.result.error ?? w.result.summary ?? ''),
    ),
  };
}

/** Fill null/not_found LLM fields from heuristic extraction. */
export function mergeSynthesis(primary: SynthesisBundle, baseline: SynthesisBundle): SynthesisBundle {
  const mergeClaim = <T,>(a: ClaimedFact<T>, b: ClaimedFact<T>): ClaimedFact<T> => {
    if (a.value != null && a.label !== 'not_found') return a;
    if (b.value != null && b.label !== 'not_found') return b;
    return a.label !== 'not_found' ? a : b;
  };

  return {
    business: {
      officialName: mergeClaim(primary.business.officialName, baseline.business.officialName),
      parentCompany: mergeClaim(primary.business.parentCompany, baseline.business.parentCompany),
      category: mergeClaim(primary.business.category, baseline.business.category),
      website: mergeClaim(primary.business.website, baseline.business.website),
      locationPage: mergeClaim(primary.business.locationPage, baseline.business.locationPage),
      streetAddress: mergeClaim(primary.business.streetAddress, baseline.business.streetAddress),
      cityStateZip: mergeClaim(primary.business.cityStateZip, baseline.business.cityStateZip),
      phone: mergeClaim(primary.business.phone, baseline.business.phone),
      hours: mergeClaim(primary.business.hours, baseline.business.hours),
      openingDate: mergeClaim(primary.business.openingDate, baseline.business.openingDate),
      grandOpening: mergeClaim(primary.business.grandOpening, baseline.business.grandOpening),
      appointmentsRequired: mergeClaim(
        primary.business.appointmentsRequired,
        baseline.business.appointmentsRequired,
      ),
      offerings: mergeClaim(primary.business.offerings, baseline.business.offerings),
      socials: mergeClaim(primary.business.socials, baseline.business.socials),
      mapLink: mergeClaim(primary.business.mapLink, baseline.business.mapLink),
    },
    contacts: primary.contacts.length ? primary.contacts : baseline.contacts,
    programs: primary.programs.length ? primary.programs : baseline.programs,
    news: [...baseline.news, ...primary.news.filter((n) => !baseline.news.some((b) => b.url === n.url))],
    missingOrConflicting: [...new Set([...primary.missingOrConflicting, ...baseline.missingOrConflicting])],
    brandPositioning: primary.brandPositioning ?? baseline.brandPositioning,
    paywallOrAuthBlocked: primary.paywallOrAuthBlocked || baseline.paywallOrAuthBlocked,
  };
}
