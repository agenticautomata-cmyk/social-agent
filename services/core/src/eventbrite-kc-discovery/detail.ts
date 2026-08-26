import { parseJsonLdPageGraph } from '../ask-benson/jsonld-events.js';
import { jsonLdEventsToOpportunities } from '../ask-benson/editorial-container.js';
import {
  fetchPageContent,
  parseEventDate,
  type ExtractedOpportunity,
} from '../ask-benson/listing-extract.js';
import {
  qualifyUrlOpportunity,
  resolveEntityFromUrl,
  type UrlQualificationResult,
} from '../ask-benson/qualify-url-opportunity.js';
import {
  extractEventbriteEventId,
  normalizeCanonicalEventUrl,
} from '../ask-benson/url-intake-dedupe.js';

export type EventbriteDetailParseResult =
  | {
      ok: true;
      eventbriteEventId: string;
      url: string;
      opportunity: ExtractedOpportunity;
      qualification: UrlQualificationResult;
      eventStartsAt: Date | null;
      hasClock: boolean;
    }
  | {
      ok: false;
      eventbriteEventId: string | null;
      url: string;
      reason: 'fetch_failed' | 'no_event_jsonld' | 'id_mismatch' | 'qualify_rejected';
      qualification?: UrlQualificationResult;
      opportunity?: ExtractedOpportunity;
    };

/**
 * Fetch a public Eventbrite `/e/...` detail page and parse via existing JSON-LD Event path.
 * Does not call OpenAI. Does not use destination-search API.
 */
export async function parseEventbriteDetailPage(
  url: string,
  opts?: { html?: string; pageTitle?: string | null },
): Promise<EventbriteDetailParseResult> {
  const eventbriteEventId = extractEventbriteEventId(url);
  const canonical = normalizeCanonicalEventUrl(url) ?? url;

  if (!eventbriteEventId) {
    return { ok: false, eventbriteEventId: null, url: canonical, reason: 'id_mismatch' };
  }

  let html = opts?.html;
  let pageTitle = opts?.pageTitle ?? null;
  if (!html) {
    const page = await fetchPageContent(canonical);
    if (!page.ok || !page.html) {
      return { ok: false, eventbriteEventId, url: canonical, reason: 'fetch_failed' };
    }
    html = page.html;
    pageTitle = page.title ?? null;
  }

  const graph = parseJsonLdPageGraph(html);
  const opportunities = jsonLdEventsToOpportunities(graph.events, canonical);
  let opportunity =
    opportunities.find((o) => extractEventbriteEventId(o.sourceUrl ?? '') === eventbriteEventId) ??
    opportunities[0];

  if (!opportunity) {
    return { ok: false, eventbriteEventId, url: canonical, reason: 'no_event_jsonld' };
  }

  opportunity = {
    ...opportunity,
    sourceUrl: canonical,
    title: opportunity.title || pageTitle || `Eventbrite ${eventbriteEventId}`,
  };

  const entity = resolveEntityFromUrl(canonical, opportunity.title);
  const qualification = qualifyUrlOpportunity({
    opp: opportunity,
    pageUrl: canonical,
    sourceUrl: canonical,
    entity,
    eventListing: true,
  });

  if (!qualification.qualified) {
    return {
      ok: false,
      eventbriteEventId,
      url: canonical,
      reason: 'qualify_rejected',
      qualification,
      opportunity,
    };
  }

  const eventStartsAt = parseEventDate(opportunity.eventDate);
  const hasClock = Boolean(opportunity.startTime && /^\d{2}:\d{2}/.test(opportunity.startTime));

  return {
    ok: true,
    eventbriteEventId,
    url: canonical,
    opportunity,
    qualification,
    eventStartsAt,
    hasClock,
  };
}
