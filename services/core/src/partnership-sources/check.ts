/**
 * Runs a check against one registered source.
 *
 * The extractor is chosen by the source's URL, because extraction is inherently
 * page-specific — there is no generic "get the events" for arbitrary HTML, and
 * pretending otherwise is how the previous system ended up promoting article headlines
 * into the contacts table. A source with no extractor is honest about it rather than
 * silently reporting success.
 */

import {
  extractCrossroadsEvents,
  extractLabelledContacts,
  extractTribeEvents,
  upcomingEvents,
  type ExtractedContact,
  type ExtractedEvent,
} from './extract.js';
import { fetchSourcePage } from './fetch.js';
import { classifyCheckOutcome, type CheckFrequency, type SourceHealthState } from './health.js';
import {
  recordSourceCheck,
  recordSourceFact,
  type PartnershipSourceRow,
} from './registry.js';

export type SourceCheckResult = {
  sourceId: string;
  sourceName: string;
  health: SourceHealthState;
  factsRecorded: number;
  factsChanged: number;
  explanation: string;
};

type Extractor = {
  /** Below this record count the page has almost certainly been restructured. */
  expectedMinimumRecords: number | null;
  /** True when zero records is a documented normal state for this source. */
  emptyIsNormal: boolean;
  run: (
    html: string,
    source: PartnershipSourceRow,
    now: Date,
  ) => Array<{
    factKind: string;
    factKey: string;
    factValue: Record<string, unknown>;
    excerpt: string | null;
  }>;
};

function eventsExtractor(
  parse: (html: string, now: Date) => ExtractedEvent[],
): Extractor {
  return {
    expectedMinimumRecords: 1,
    emptyIsNormal: false,
    run: (html, source, now) => {
      const events = upcomingEvents(parse(html, now), now);
      return events.map((event: ExtractedEvent) => ({
        factKind: 'event',
        // Title plus date is stable across re-checks, so a weekly series produces one
        // fact per occurrence rather than one fact that keeps overwriting itself.
        factKey: `event:${event.title.toLowerCase()}:${event.resolvedDate ?? event.dateText ?? 'undated'}`,
        factValue: {
          title: event.title,
          category: event.category,
          dateText: event.dateText,
          date: event.resolvedDate,
          timeText: event.timeText,
          recurring: event.recurring,
          detailUrl: event.detailUrl,
          summary: event.excerpt,
        },
        excerpt: event.excerpt,
      }));
    },
  };
}

function contactsExtractor(): Extractor {
  return {
    expectedMinimumRecords: 1,
    emptyIsNormal: false,
    run: (html, source) => {
      const contacts = extractLabelledContacts(html);
      return contacts.map((contact: ExtractedContact) => ({
        factKind: 'contact',
        factKey: `contact:${contact.email}`,
        factValue: {
          email: contact.email,
          publishedLabel: contact.label,
          localPart: contact.localPart,
          representsBusiness: source.representsBusiness,
        },
        excerpt: contact.label ? `Published under the label "${contact.label}".` : null,
      }));
    },
  };
}

/**
 * URL-keyed extractors. Only the pages that have actually been read and understood are
 * here; anything else reports `no_extractor` rather than a fake success.
 */
const EXTRACTORS: Record<string, Extractor> = {
  'https://crossroadshotelkc.com/events/': eventsExtractor((html, now) =>
    extractCrossroadsEvents(html, now),
  ),
  'https://crossroadshotelkc.com/contact-2/': contactsExtractor(),
  // The Raphael runs The Events Calendar, which has entirely different markup and a
  // machine-readable date attribute.
  'https://raphaelkc.com/event-calendar/': eventsExtractor((html) => extractTribeEvents(html)),
};

export function hasExtractor(url: string): boolean {
  return url in EXTRACTORS;
}

export async function checkSource(
  source: PartnershipSourceRow,
  options: { now?: Date } = {},
): Promise<SourceCheckResult> {
  const now = options.now ?? new Date();
  const startedAt = new Date();

  if (!source.enabled) {
    return {
      sourceId: source.id,
      sourceName: source.name,
      health: 'disabled_not_applicable',
      factsRecorded: 0,
      factsChanged: 0,
      explanation: source.notes ?? 'This source is deliberately switched off.',
    };
  }

  // A path we have already recorded as disallowed is never fetched, not even to
  // re-confirm. The site owner's answer does not need re-asking every quarter.
  if (source.robotsStatus === 'disallowed') {
    await recordSourceCheck({
      sourceId: source.id,
      sourceName: source.name,
      frequency: source.checkFrequency as CheckFrequency,
      health: 'robots_refused',
      factsExtracted: 0,
      startedAt,
      httpNote: source.robotsNote,
    });
    return {
      sourceId: source.id,
      sourceName: source.name,
      health: 'robots_refused',
      factsRecorded: 0,
      factsChanged: 0,
      explanation: source.robotsNote ?? 'This path is disallowed in robots.txt.',
    };
  }

  const fetched = await fetchSourcePage(source.url, {
    configuredCrawlDelaySeconds: source.crawlDelaySeconds,
  });

  if (!fetched.ok) {
    const health: SourceHealthState = fetched.robotsDisallowed
      ? 'robots_refused'
      : classifyCheckOutcome({
          fetched: false,
          httpStatus: 'status' in fetched ? fetched.status : null,
          recordCount: 0,
        });
    await recordSourceCheck({
      sourceId: source.id,
      sourceName: source.name,
      frequency: source.checkFrequency as CheckFrequency,
      health:
        'status' in fetched && fetched.status === 404 ? 'structural_break' : health,
      factsExtracted: 0,
      startedAt,
      httpNote: fetched.reason,
      detail: fetched.reason,
    });
    return {
      sourceId: source.id,
      sourceName: source.name,
      health,
      factsRecorded: 0,
      factsChanged: 0,
      explanation: fetched.reason,
    };
  }

  const extractor = EXTRACTORS[source.url];
  if (!extractor) {
    // The page was read successfully but Benson does not know how to read this one
    // yet. Recording that honestly is better than a health state that implies data.
    await recordSourceCheck({
      sourceId: source.id,
      sourceName: source.name,
      frequency: source.checkFrequency as CheckFrequency,
      health: 'unchecked',
      factsExtracted: 0,
      startedAt,
      httpNote: `Reached successfully (HTTP ${fetched.status}) but no extractor is built for this page yet.`,
    });
    return {
      sourceId: source.id,
      sourceName: source.name,
      health: 'unchecked',
      factsRecorded: 0,
      factsChanged: 0,
      explanation: `${source.name} was reached successfully, but Benson does not yet know how to read this page, so nothing has been extracted from it.`,
    };
  }

  const facts = extractor.run(fetched.body, source, now);
  const health = classifyCheckOutcome({
    fetched: true,
    httpStatus: fetched.status,
    requiresBrowser: source.requiresPlaywright,
    recordCount: facts.length,
    expectedMinimumRecords: extractor.expectedMinimumRecords,
    emptyIsNormal: extractor.emptyIsNormal,
  });

  let changed = 0;
  if (health === 'healthy') {
    for (const fact of facts) {
      const result = await recordSourceFact({
        sourceId: source.id,
        factKind: fact.factKind,
        factKey: fact.factKey,
        factValue: fact.factValue,
        representsBusiness: source.representsBusiness,
        sourceUrl: fetched.finalUrl,
        excerpt: fact.excerpt,
      });
      if (result.changed) changed += 1;
    }
  }

  await recordSourceCheck({
    sourceId: source.id,
    sourceName: source.name,
    frequency: source.checkFrequency as CheckFrequency,
    health,
    factsExtracted: facts.length,
    startedAt,
    httpNote:
      fetched.finalUrl !== source.url
        ? `Redirected to ${fetched.finalUrl}.`
        : `HTTP ${fetched.status}.`,
  });

  return {
    sourceId: source.id,
    sourceName: source.name,
    health,
    factsRecorded: facts.length,
    factsChanged: changed,
    explanation: `${source.name}: ${health}, ${facts.length} facts (${changed} new or changed).`,
  };
}
