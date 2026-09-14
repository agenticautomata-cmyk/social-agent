import { searchWeb } from '../web-research/index.js';
import {
  classifyResearchToolOutcome,
  isResearchFailureProse,
} from './instagram-visual/event-quality-gate.js';
import type { CuratorVerificationStatus, EventResearchResult, ParsedRoundupEvent } from './types.js';

function pickStatus(input: {
  hasOfficial: boolean;
  hasPartial: boolean;
  hasConflict: boolean;
  isPast: boolean;
  toolOutcome: string;
}): CuratorVerificationStatus {
  if (input.isPast) return 'EXPIRED';
  // not_found / error / insufficient_evidence must never upgrade verification
  if (
    input.toolOutcome === 'not_found' ||
    input.toolOutcome === 'error' ||
    input.toolOutcome === 'insufficient_evidence' ||
    input.toolOutcome === 'blocked'
  ) {
    if (input.hasConflict) return 'CONFLICTED';
    return 'SOCIAL_LEAD';
  }
  if (input.hasConflict) return 'CONFLICTED';
  if (input.hasOfficial && input.toolOutcome === 'confirmed') return 'VERIFIED';
  if (input.hasPartial && input.toolOutcome === 'partially_confirmed') return 'PARTIALLY_VERIFIED';
  if (input.hasOfficial) return 'VERIFIED';
  if (input.hasPartial) return 'PARTIALLY_VERIFIED';
  return 'SOCIAL_LEAD';
}

export async function researchCuratorEventLead(input: {
  event: ParsedRoundupEvent;
  curatorHandle: string;
  postUrl: string;
}): Promise<EventResearchResult> {
  const query = [
    input.event.eventName,
    input.event.venue,
    input.event.neighborhood,
    'Kansas City event',
    input.event.eventDate ?? '',
  ]
    .filter(Boolean)
    .join(' — ');

  let research: Awaited<ReturnType<typeof searchWeb>>;
  try {
    research = await searchWeb(
      `Find official organizer page, venue page, ticket/registration link, date/time, address, cost, age restrictions, and cancellation info for: ${query}. Do NOT treat Instagram curator posts as official confirmation.`,
      'Prioritize official organizer websites, venue sites, Eventbrite/Ticketmaster, and verified business social pages. Cite URLs. Note any conflicts with the social lead details. Kansas City metro only.',
      { context: 'background' },
    );
  } catch {
    return {
      verificationStatus: 'SOCIAL_LEAD',
      officialOrganizerUrl: null,
      officialVenueUrl: null,
      ticketUrl: null,
      officialSocialUrl: null,
      verifiedDate: input.event.eventDate,
      verifiedTime: input.event.eventTime,
      verifiedVenue: input.event.venue,
      verifiedAddress: null,
      verifiedCost: input.event.price,
      verifiedAgeRestriction: input.event.ageRestriction,
      parkingInfo: null,
      filmingNotes: null,
      cancellationNotes: null,
      contactInfo: null,
      conflicts: [],
      summary: null,
      citations: [],
      toolOutcome: 'error',
    };
  }

  const rawSummary = research.summary ?? '';
  const citations = research.citations ?? [];
  const toolOutcome = classifyResearchToolOutcome({
    ok: research.ok,
    summary: rawSummary,
    citations: citations.length,
    hasOfficial: false,
    hasConflict: false,
  });

  // Failure / not_found prose never becomes public summary or upgrades fields
  if (
    toolOutcome === 'not_found' ||
    toolOutcome === 'error' ||
    toolOutcome === 'insufficient_evidence' ||
    isResearchFailureProse(rawSummary)
  ) {
    return {
      verificationStatus: 'SOCIAL_LEAD',
      officialOrganizerUrl: null,
      officialVenueUrl: null,
      ticketUrl: null,
      officialSocialUrl: null,
      verifiedDate: input.event.eventDate,
      verifiedTime: input.event.eventTime,
      verifiedVenue: input.event.venue,
      verifiedAddress: null,
      verifiedCost: input.event.price,
      verifiedAgeRestriction: input.event.ageRestriction,
      parkingInfo: null,
      filmingNotes: null,
      cancellationNotes: null,
      contactInfo: null,
      conflicts: [],
      summary: null,
      citations: [],
      toolOutcome,
    };
  }

  const lower = rawSummary.toLowerCase();

  const officialOrganizerUrl =
    citations.find((c) => /eventbrite|org|foundation|association|\.gov/i.test(c.url))?.url ?? null;
  const ticketUrl =
    citations.find((c) => /ticket|eventbrite|universe|seatgeek|axs/i.test(c.url))?.url ?? null;
  const officialVenueUrl =
    citations.find((c) => /venue|hall|center|theatre|theater|museum|park/i.test(c.url))?.url ?? null;
  const officialSocialUrl =
    citations.find((c) => /instagram\.com|facebook\.com/i.test(c.url) && !c.url.includes(input.curatorHandle))
      ?.url ?? null;

  const conflicts: string[] = [];
  if (/cancelled|canceled|postponed/i.test(lower)) {
    conflicts.push('Official source mentions cancellation or postponement');
  }
  if (input.event.eventDate && /different date|rescheduled/i.test(lower)) {
    conflicts.push('Official source may list a different date');
  }

  const isPast =
    Boolean(input.event.eventDate) && new Date(input.event.eventDate!) < new Date(new Date().toDateString());

  const hasOfficial = Boolean(officialOrganizerUrl || ticketUrl || officialVenueUrl);
  const hasPartial = Boolean(research.ok && rawSummary.length > 80 && citations.length > 0);
  const hasConflict = conflicts.length > 0;

  const finalOutcome = classifyResearchToolOutcome({
    ok: research.ok,
    summary: rawSummary,
    citations: citations.length,
    hasOfficial,
    hasConflict,
  });

  return {
    verificationStatus: pickStatus({
      hasOfficial,
      hasPartial,
      hasConflict,
      isPast,
      toolOutcome: finalOutcome,
    }),
    officialOrganizerUrl,
    officialVenueUrl,
    ticketUrl,
    officialSocialUrl,
    verifiedDate: extractField(rawSummary, 'date') ?? input.event.eventDate,
    verifiedTime: extractField(rawSummary, 'time') ?? input.event.eventTime,
    verifiedVenue: extractField(rawSummary, 'venue') ?? input.event.venue,
    verifiedAddress: extractField(rawSummary, 'address'),
    verifiedCost: extractField(rawSummary, 'cost') ?? input.event.price,
    verifiedAgeRestriction: extractField(rawSummary, 'age') ?? input.event.ageRestriction,
    parkingInfo: extractField(rawSummary, 'parking'),
    filmingNotes: extractField(rawSummary, 'film'),
    cancellationNotes: /cancel/i.test(lower) ? rawSummary.slice(0, 300) : null,
    contactInfo: extractField(rawSummary, 'contact'),
    conflicts,
    summary: rawSummary.slice(0, 1200) || null,
    citations,
    toolOutcome: finalOutcome,
  };
}

function extractField(summary: string, kind: string): string | null {
  const patterns: Record<string, RegExp> = {
    date: /\b(?:date|when)[:\s]+([^\n.]{4,40})/i,
    time: /\b(?:time|hours)[:\s]+([^\n.]{4,40})/i,
    venue: /\b(?:venue|location)[:\s]+([^\n.]{4,60})/i,
    address: /\b(?:address)[:\s]+([^\n.]{8,80})/i,
    cost: /\b(?:cost|price|ticket|admission)[:\s]+([^\n.]{3,40})/i,
    age: /\b(?:age|21\+|18\+)[:\s]*([^\n.]{2,30})/i,
    parking: /\b(?:parking)[:\s]+([^\n.]{4,60})/i,
    film: /\b(?:film|photo|recording)[:\s]+([^\n.]{4,80})/i,
    contact: /\b(?:contact|email|phone)[:\s]+([^\n.]{4,60})/i,
  };
  const m = summary.match(patterns[kind] ?? /$^/);
  return m?.[1]?.trim() ?? null;
}
