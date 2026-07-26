import { searchWeb } from '../web-research/index.js';
import type { CuratorVerificationStatus, EventResearchResult, ParsedRoundupEvent } from './types.js';

function pickStatus(input: {
  hasOfficial: boolean;
  hasPartial: boolean;
  hasConflict: boolean;
  isPast: boolean;
}): CuratorVerificationStatus {
  if (input.isPast) return 'EXPIRED';
  if (input.hasConflict) return 'CONFLICTED';
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

  const research = await searchWeb(
    `Find official organizer page, venue page, ticket/registration link, date/time, address, cost, age restrictions, and cancellation info for: ${query}. Do NOT treat Instagram curator posts as official confirmation.`,
    'Prioritize official organizer websites, venue sites, Eventbrite/Ticketmaster, and verified business social pages. Cite URLs. Note any conflicts with the social lead details. Kansas City metro only.',
    { context: 'background' },
  );

  const summary = research.summary ?? '';
  const citations = research.citations ?? [];
  const lower = summary.toLowerCase();

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
  const hasPartial = Boolean(research.ok && summary.length > 80 && citations.length > 0);
  const hasConflict = conflicts.length > 0;

  return {
    verificationStatus: pickStatus({ hasOfficial, hasPartial, hasConflict, isPast }),
    officialOrganizerUrl,
    officialVenueUrl,
    ticketUrl,
    officialSocialUrl,
    verifiedDate: extractField(summary, 'date') ?? input.event.eventDate,
    verifiedTime: extractField(summary, 'time') ?? input.event.eventTime,
    verifiedVenue: extractField(summary, 'venue') ?? input.event.venue,
    verifiedAddress: extractField(summary, 'address'),
    verifiedCost: extractField(summary, 'cost') ?? input.event.price,
    verifiedAgeRestriction: extractField(summary, 'age') ?? input.event.ageRestriction,
    parkingInfo: extractField(summary, 'parking'),
    filmingNotes: extractField(summary, 'film'),
    cancellationNotes: /cancel/i.test(lower) ? summary.slice(0, 300) : null,
    contactInfo: extractField(summary, 'contact'),
    conflicts,
    summary: summary.slice(0, 1200) || null,
    citations,
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
