/**
 * Builds a pitch brief from the source registry.
 *
 * This is the join that did not exist. The research track produced facts and the
 * drafting track produced pitches, and nothing carried a fact from one to the other —
 * the pitch writer was fed a truncated `content_items` listing instead. Everything a
 * pitch asserts now originates in `partnership_source_facts`, with the URL it was read
 * from attached.
 */

import { and, eq, isNull, sql } from 'drizzle-orm';

import { db } from '../db.js';
import { partnershipSourceFacts, partnershipSources } from '../schema.js';
import { businessKeyFor } from '../partnership-contracts/business-key.js';
import {
  officialInboxStateForLocalPart,
  type ContactEvidenceState,
} from '../partnership-contracts/contact-evidence.js';
import type { CompensationComponent } from '../partnership-contracts/compensation.js';
import type { PitchEvidenceItem } from './compose.js';

export type BusinessFacts = {
  businessName: string;
  businessKey: string;
  /** Upcoming dated moments, newest first. The "why now" comes from here. */
  events: Array<{
    title: string;
    date: string | null;
    dateText: string | null;
    timeText: string | null;
    venue: string | null;
    summary: string | null;
    detailUrl: string | null;
    recurring: boolean;
    sourceUrl: string;
    observedAt: string;
  }>;
  /** Published contacts with the label the business itself used. */
  contacts: Array<{
    email: string;
    publishedLabel: string | null;
    localPart: string;
    evidenceState: ContactEvidenceState;
    sourceUrl: string;
    observedAt: string;
  }>;
  /** Published packages and offers. These are products, not offers to Kellie. */
  offers: Array<{ name: string; detail: string | null; sourceUrl: string }>;
};

type FactRow = typeof partnershipSourceFacts.$inferSelect & {
  sourceName: string;
  sourceAuthority: string;
};

export async function loadBusinessFacts(businessName: string): Promise<BusinessFacts> {
  const rows = (await db
    .select({
      id: partnershipSourceFacts.id,
      sourceId: partnershipSourceFacts.sourceId,
      factKind: partnershipSourceFacts.factKind,
      factKey: partnershipSourceFacts.factKey,
      factValue: partnershipSourceFacts.factValue,
      representsBusiness: partnershipSourceFacts.representsBusiness,
      sourceUrl: partnershipSourceFacts.sourceUrl,
      excerpt: partnershipSourceFacts.excerpt,
      observedAt: partnershipSourceFacts.observedAt,
      supersededAt: partnershipSourceFacts.supersededAt,
      createdAt: partnershipSourceFacts.createdAt,
      sourceName: partnershipSources.name,
      sourceAuthority: partnershipSources.authorityLevel,
    })
    .from(partnershipSourceFacts)
    .innerJoin(partnershipSources, eq(partnershipSources.id, partnershipSourceFacts.sourceId))
    .where(
      and(
        isNull(partnershipSourceFacts.supersededAt),
        sql`lower(${partnershipSourceFacts.representsBusiness}) = lower(${businessName})`,
      ),
    )) as unknown as FactRow[];

  const facts: BusinessFacts = {
    businessName,
    businessKey: businessKeyFor(businessName),
    events: [],
    contacts: [],
    offers: [],
  };

  for (const row of rows) {
    const value = (row.factValue ?? {}) as Record<string, unknown>;
    if (row.factKind === 'event') {
      facts.events.push({
        title: str(value.title) ?? '',
        date: str(value.date),
        dateText: str(value.dateText),
        timeText: str(value.timeText),
        venue: str(value.category),
        summary: str(value.summary),
        detailUrl: str(value.detailUrl),
        recurring: value.recurring === true,
        sourceUrl: row.sourceUrl,
        observedAt: row.observedAt.toISOString(),
      });
    } else if (row.factKind === 'contact') {
      const email = str(value.email);
      if (!email) continue;
      const localPart = str(value.localPart) ?? email.split('@')[0]!;
      const label = str(value.publishedLabel);
      facts.contacts.push({
        email,
        publishedLabel: label,
        localPart,
        // The page published this address under a label on the business's own site,
        // which is official evidence. The label decides role inbox vs general inbox.
        evidenceState: evidenceStateForPublishedContact({
          localPart,
          publishedLabel: label,
          authority: row.sourceAuthority,
        }),
        sourceUrl: row.sourceUrl,
        observedAt: row.observedAt.toISOString(),
      });
    } else if (row.factKind === 'offer') {
      facts.offers.push({
        name: str(value.name) ?? '',
        detail: str(value.detail),
        sourceUrl: row.sourceUrl,
      });
    }
  }

  facts.events.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
  return facts;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * An address published on the business's own site under a media/press/partnerships
 * label is a verified role inbox. The same address with no label, or a label like
 * "House Keeping", is at best a general inbox — and a wrong-department inbox should
 * never be presented as a partnerships contact.
 */
export function evidenceStateForPublishedContact(input: {
  localPart: string;
  publishedLabel: string | null;
  authority: string;
}): ContactEvidenceState {
  if (input.authority !== 'official_first_party' && input.authority !== 'official_affiliated') {
    return 'inferred_unverified';
  }
  const label = input.publishedLabel?.toLowerCase() ?? '';
  const partnershipLabels = [
    'media',
    'press',
    'public relations',
    'pr',
    'marketing',
    'partnerships',
    'partnership',
  ];
  if (partnershipLabels.includes(label)) return 'verified_role_inbox';
  // Fall back to the local part when the page gave no usable label.
  if (!label) return officialInboxStateForLocalPart(input.localPart);
  return 'official_general_inbox';
}

/** The best contact for a partnership pitch, or null when none is usable. */
export function bestPartnershipContact(
  facts: BusinessFacts,
): BusinessFacts['contacts'][number] | null {
  const rank: Record<ContactEvidenceState, number> = {
    verified_named_decision_maker: 5,
    verified_role_inbox: 4,
    official_general_inbox: 3,
    official_contact_form: 2,
    inferred_unverified: 1,
    unknown: 0,
  };
  // Sales and housekeeping inboxes are official but wrong. A pitch to housekeeping is
  // not a near miss, it is a mistake.
  const wrongDepartment = new Set(['sales', 'house keeping', 'housekeeping', 'careers', 'catering']);
  const usable = facts.contacts.filter(
    (c) => !wrongDepartment.has(c.publishedLabel?.toLowerCase() ?? ''),
  );
  if (usable.length === 0) return null;
  return usable.sort((a, b) => rank[b.evidenceState] - rank[a.evidenceState])[0]!;
}

/**
 * Picks the "why now".
 *
 * Prefers the soonest upcoming dated event, because a specific date is what makes a
 * pitch concrete. A recurring series is a weaker hook than a one-off — "the ballet is
 * here on the 5th" is a reason to write; "there is music every Friday" is not news.
 */
export function pickWhyNow(
  facts: BusinessFacts,
  now = new Date(),
): {
  headline: string;
  description: string;
  date: string | null;
  sourceUrl: string;
} | null {
  const today = now.toISOString().slice(0, 10);
  const upcoming = facts.events.filter((e) => e.date !== null && e.date >= today);
  if (upcoming.length === 0) return null;

  // A one-off beats a recurring series: "the ballet is here on the 5th" is news, "there
  // is music every Friday" is not. Among one-offs on the same date, prefer the one with
  // a named outside collaborator, which is the more distinctive story.
  const oneOffs = upcoming.filter((e) => !e.recurring);
  const pool = oneOffs.length > 0 ? oneOffs : upcoming;
  const soonest = pool[0]!.date;
  const sameDay = pool.filter((e) => e.date === soonest);
  const chosen =
    sameDay.sort((a, b) => distinctiveness(b) - distinctiveness(a))[0] ?? pool[0]!;

  const when = chosen.dateText ?? chosen.date;
  const where = chosen.venue ? ` at ${chosen.venue}` : '';
  return {
    headline: `${chosen.title}${where} on ${when}`,
    description: `${chosen.title}${where} on ${when}${
      chosen.summary ? ` — ${chosen.summary}` : ''
    }`,
    date: chosen.date,
    sourceUrl: chosen.detailUrl ?? chosen.sourceUrl,
  };
}

/**
 * Rough measure of how newsworthy an event is. A performance by a named company or a
 * one-time showcase is a stronger reason to pitch a hotel than a drop-in class.
 */
function distinctiveness(event: BusinessFacts['events'][number]): number {
  const text = `${event.title} ${event.summary ?? ''}`;
  let score = 0;
  // A named organisation appearing at the property is a real occasion.
  if (/\b(?:ballet|symphony|orchestra|philharmonic|museum|gallery|festival|premiere|showcase|opening)\b/i.test(text)) {
    score += 3;
  }
  if (/\bfree to the public\b/i.test(text)) score += 1;
  // A drop-in class recurs in spirit even when listed as a single date.
  if (/\b(?:class|workshop|yoga|flow|meetup|club)\b/i.test(text)) score -= 2;
  if ((event.summary?.length ?? 0) > 120) score += 1;
  return score;
}

/** Sourced evidence items for the brief. Every one carries the URL it came from. */
export function buildEvidenceItems(facts: BusinessFacts, limit = 4): PitchEvidenceItem[] {
  const items: PitchEvidenceItem[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const event of facts.events.filter((e) => (e.date ?? '9999') >= today).slice(0, limit)) {
    items.push({
      fact: `${facts.businessName} is hosting ${event.title}${
        event.dateText ? ` on ${event.dateText}` : ''
      }${event.venue ? ` at ${event.venue}` : ''}`,
      sourceUrl: event.detailUrl ?? event.sourceUrl,
      observedAt: event.observedAt,
    });
  }

  const contact = bestPartnershipContact(facts);
  if (contact) {
    items.push({
      fact: `${facts.businessName} publishes ${contact.email}${
        contact.publishedLabel ? ` under the label "${contact.publishedLabel}"` : ''
      } on its own site`,
      sourceUrl: contact.sourceUrl,
      observedAt: contact.observedAt,
    });
  }

  return items;
}

/**
 * The compensation Benson recommends requesting for a hosted hotel concept.
 *
 * Deliberately conservative and explicit. This is a recommendation to Kellie, never a
 * claim about what the business has offered — nothing here has been offered.
 */
export function recommendedHostedStayRequest(input: {
  estimatedRoomRateUsd: number | null;
  includeDiningCredit: boolean;
}): CompensationComponent[] {
  const components: CompensationComponent[] = [
    {
      kind: 'complimentary_room',
      amountUsd: input.estimatedRoomRateUsd,
      detail: 'one complimentary night',
    },
  ];
  if (input.includeDiningCredit) {
    components.push({
      kind: 'dining_credit',
      amountUsd: null,
      detail: 'a dining credit at the property restaurant so the food can be part of the story',
    });
  }
  return components;
}
