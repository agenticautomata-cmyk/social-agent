/**
 * Capability-based Wix Events extraction (multi-variant).
 *
 * Supports hydration / appsWarmupData payloads used by events-viewer, including
 * ticket+RSVP companion nights (e.g. Fantasy Lounge) and classic SSR+hydration
 * listings (e.g. 18th & Vine). Public facts only — no login/RSVP/purchase.
 */

import { stripTrackingParams } from './event-listing-outcomes.js';

export type WixRegistrationAction = 'ticket' | 'rsvp' | 'register' | 'unknown';

export type WixHydratedEvent = {
  id?: string;
  title?: string;
  slug?: string;
  description?: string;
  about?: string;
  location?: {
    name?: string;
    address?: string;
    tbd?: boolean;
    fullAddress?: {
      city?: string;
      subdivision?: string;
      formattedAddress?: string;
    };
  };
  scheduling?: {
    config?: {
      startDate?: string;
      endDate?: string;
      timeZoneId?: string;
      scheduleTbd?: boolean;
      recurrences?: { status?: number; occurrences?: unknown[] };
    };
    formatted?: string;
    startDateFormatted?: string;
    startTimeFormatted?: string;
    endDateFormatted?: string;
    endTimeFormatted?: string;
  };
  mainImage?: { id?: string; url?: string };
  registration?: {
    type?: number;
    status?: number;
    restrictedTo?: number;
    initialType?: number;
    ticketing?: {
      soldOut?: boolean;
      lowestPrice?: string;
      highestPrice?: string;
      lowestTicketPriceFormatted?: string;
      highestTicketPriceFormatted?: string;
      currency?: string;
    };
  };
};

export type WixExtractedListing = {
  externalId: string | null;
  title: string;
  theme: string | null;
  baseTitle: string;
  startDate: string | null;
  startDateTime: string | null;
  endDate: string | null;
  endDateTime: string | null;
  startTimeLocal: string | null;
  endTimeLocal: string | null;
  venue: string | null;
  address: string | null;
  city: string | null;
  regionState: string | null;
  description: string | null;
  priceText: string | null;
  isFree: boolean | null;
  eventUrl: string | null;
  ticketUrl: string | null;
  rsvpUrl: string | null;
  ticketOrRsvpUrl: string | null;
  imageUrl: string | null;
  isRecurring: boolean;
  membersOnly: boolean | null;
  vettedGuests: boolean | null;
  ageRestriction: string | null;
  soldOut: boolean | null;
  actionType: WixRegistrationAction;
  companionGroupKey: string | null;
  companionExternalIds: string[];
  companionTitles: string[];
  companionEventUrls: string[];
  titleAlias: string | null;
  evidence: string[];
  method: 'wix_events_hydration' | 'semantic_html_blocks';
  verificationState: 'verified' | 'partial' | 'unresolved_date';
  needsCompanionReview: boolean;
  detailsPathPrefix: string | null;
};

export type WixExtractDiagnostics = {
  hydrationCandidates: number;
  ssrCardCandidates: number;
  acceptedNights: number;
  companionPairsLinked: number;
  duplicatesSuppressed: number;
  incompleteRender: boolean;
  detailsPathPrefix: string | null;
  renderingComplete: boolean;
};

function tryParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/gi, '/')
    .replace(/&nbsp;/gi, ' ');
}

function absoluteUrl(href: string | null | undefined, pageUrl: string): string | null {
  if (!href?.trim()) return null;
  try {
    return stripTrackingParams(new URL(href.trim(), pageUrl).href);
  } catch {
    return null;
  }
}

/** Prefer publisher wall-date text over UTC YMD from an instant (avoids CT→UTC day shift). */
export function formattedLocalDate(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const ymd = value.trim().match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (ymd) {
    const monthName = ymd[1]!.toLowerCase();
    const months: Record<string, string> = {
      january: '01',
      february: '02',
      march: '03',
      april: '04',
      may: '05',
      june: '06',
      july: '07',
      august: '08',
      september: '09',
      october: '10',
      november: '11',
      december: '12',
    };
    const mm = months[monthName];
    if (!mm) return null;
    return `${ymd[3]}-${mm}-${String(ymd[2]).padStart(2, '0')}`;
  }
  return null;
}

function isoToDateParts(iso: string | null | undefined): {
  date: string | null;
  dateTime: string | null;
} {
  if (!iso?.trim()) return { date: null, dateTime: null };
  const value = iso.trim();
  const m = value.match(
    /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?/i,
  );
  if (!m) return { date: null, dateTime: null };
  const date = m[1]!;
  if (m[2]) return { date, dateTime: value };
  return { date, dateTime: null };
}

function parseClockToHms(text: string | null | undefined): string | null {
  if (!text?.trim()) return null;
  const m = text.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2]!;
  const ap = (m[3] ?? '').toUpperCase();
  if (ap === 'PM' && hour < 12) hour += 12;
  if (ap === 'AM' && hour === 12) hour = 0;
  if (!ap && hour > 23) return null;
  return `${String(hour).padStart(2, '0')}:${minute}:00`;
}

export function splitWixThemeTitle(title: string): { baseTitle: string; theme: string | null } {
  const trimmed = title.trim();
  const m = trimmed.match(/^(.*?)(?:\s*[-–—]\s*|\s+)Theme:\s*(.+)$/i);
  if (m) {
    return { baseTitle: m[1]!.trim().replace(/[-–—]\s*$/, '').trim(), theme: m[2]!.trim() };
  }
  return { baseTitle: trimmed, theme: null };
}

function normalizeBaseTitle(title: string): string {
  return splitWixThemeTitle(title)
    .baseTitle.toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function inferWixActionType(ev: WixHydratedEvent): WixRegistrationAction {
  const desc = `${ev.description ?? ''} ${ev.about ?? ''} ${ev.title ?? ''}`;
  const reg = ev.registration;
  const type = reg?.type ?? reg?.initialType;
  const hasTicketPrice = Boolean(
    reg?.ticketing?.lowestPrice ||
      reg?.ticketing?.lowestTicketPriceFormatted ||
      reg?.ticketing?.highestPrice,
  );
  if (/members?\s+only\s+ticket/i.test(desc) || (/buy\s+tickets?/i.test(desc) && type === 2)) {
    return 'ticket';
  }
  if (/members?\s+only\s+rsvp/i.test(desc) || (/\brsvp\b/i.test(desc) && type === 1 && !hasTicketPrice)) {
    return 'rsvp';
  }
  if (type === 2 || hasTicketPrice) return 'ticket';
  if (type === 1) return 'rsvp';
  if (type === 3 || type === 4) return 'register';
  return 'unknown';
}

export function extractPublicRestrictions(text: string | null | undefined): {
  membersOnly: boolean | null;
  vettedGuests: boolean | null;
  ageRestriction: string | null;
} {
  if (!text?.trim()) {
    return { membersOnly: null, vettedGuests: null, ageRestriction: null };
  }
  const membersOnly = /members?\s+only/i.test(text) ? true : null;
  const vettedGuests = /vetted/i.test(text) ? true : null;
  let ageRestriction: string | null = null;
  if (/\b21\s*\+/i.test(text) || /\bages?\s*21\b/i.test(text) || /\bmust be 21\b/i.test(text)) {
    ageRestriction = '21+';
  } else if (/\b18\s*\+/i.test(text) || /\bages?\s*18\b/i.test(text)) {
    ageRestriction = '18+';
  }
  return { membersOnly, vettedGuests, ageRestriction };
}

/**
 * Merge sold-out across ticket+RSVP companions for one night.
 *
 * Prefer ticket-action inventory when present (night sold out iff every ticket
 * companion is sold out). Otherwise sold out only if ALL companions with a known
 * soldOut flag are sold out — so either companion still available keeps the night open.
 */
export function mergeCompanionSoldOut(
  companions: Array<{ actionType: WixRegistrationAction; soldOut: boolean | null }>,
): boolean | null {
  const ticketKnown = companions
    .filter((c) => c.actionType === 'ticket' && typeof c.soldOut === 'boolean')
    .map((c) => c.soldOut as boolean);
  if (ticketKnown.length > 0) {
    return ticketKnown.every((v) => v);
  }
  const known = companions
    .map((c) => c.soldOut)
    .filter((v): v is boolean => typeof v === 'boolean');
  if (known.length === 0) return null;
  return known.every((v) => v);
}

/**
 * Locate `"events":[{...}]` arrays whose objects look like Wix Events records.
 */
export function extractWixEventsHydration(html: string): WixHydratedEvent[] {
  const found: WixHydratedEvent[] = [];
  const re = /"events"\s*:\s*\[/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const start = html.indexOf('[', match.index);
    if (start < 0) continue;
    let depth = 0;
    let end = -1;
    for (let i = start; i < Math.min(html.length, start + 800_000); i += 1) {
      const ch = html[i];
      if (ch === '[') depth += 1;
      else if (ch === ']') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) continue;
    const arr = tryParseJson<unknown[]>(html.slice(start, end + 1));
    if (!Array.isArray(arr) || arr.length === 0) continue;
    const asEvents = arr.filter((row): row is WixHydratedEvent => {
      if (!row || typeof row !== 'object') return false;
      const rec = row as WixHydratedEvent;
      return Boolean(rec.title && (rec.scheduling || rec.location || rec.slug));
    });
    if (asEvents.length === 0) continue;
    for (const ev of asEvents) found.push(ev);
    if (found.length >= 200) break;
  }
  // Stable order by start then title — ignore visual reorder.
  found.sort((a, b) => {
    const as = a.scheduling?.config?.startDate ?? '';
    const bs = b.scheduling?.config?.startDate ?? '';
    if (as !== bs) return as.localeCompare(bs);
    return String(a.title ?? '').localeCompare(String(b.title ?? ''));
  });
  return found;
}

export function detectWixDetailsPathPrefix(html: string, pageUrl: string): string {
  const counts = new Map<string, number>();
  const hrefRe = /\/(event-details(?:-[a-z0-9-]+)?)\/[a-z0-9-]+/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html)) !== null) {
    const prefix = m[1]!.toLowerCase();
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  }
  if (counts.size > 0) {
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  }
  const settings = html.match(/"detailsPagePath"\s*:\s*"([^"]+)"/);
  if (settings?.[1]) {
    const path = settings[1].replace(/^\/+|\/+$/g, '');
    if (/^details/i.test(path)) return `event-${path}`;
    if (/^event-/i.test(path)) return path;
  }
  // Last resort matches the historically verified 18th & Vine style.
  try {
    void new URL(pageUrl);
  } catch {
    /* ignore */
  }
  return 'event-details-registration';
}

function buildDetailUrl(
  origin: string,
  prefix: string,
  slug: string | null | undefined,
): string | null {
  if (!slug?.trim() || !origin) return null;
  return stripTrackingParams(`${origin}/${prefix}/${slug.trim()}`);
}

function localDateTime(
  date: string | null,
  timeFormatted: string | null | undefined,
): string | null {
  if (!date) return null;
  const hms = parseClockToHms(timeFormatted);
  if (!hms) return date;
  return `${date}T${hms}`;
}

function nightGroupKey(input: {
  startDateTime: string | null;
  startDate: string | null;
  venue: string | null;
  baseTitle: string;
}): string {
  const when = input.startDateTime ?? input.startDate ?? 'undated';
  const venue = (input.venue ?? '').toLowerCase().trim();
  return `wix-night:${when}|${venue}|${normalizeBaseTitle(input.baseTitle)}`;
}

type RawWixRow = WixExtractedListing & { _rawId: string | null };

function hydrateToRows(
  hydrated: WixHydratedEvent[],
  pageUrl: string,
  detailsPrefix: string,
): RawWixRow[] {
  const origin = (() => {
    try {
      return new URL(pageUrl).origin;
    } catch {
      return '';
    }
  })();

  return hydrated
    .map((ev) => {
      const title = String(ev.title ?? '').trim();
      if (!title) return null;
      const { baseTitle, theme } = splitWixThemeTitle(title);
      const startIso = ev.scheduling?.config?.startDate ?? null;
      const endIso = ev.scheduling?.config?.endDate ?? null;
      const start = isoToDateParts(startIso);
      const end = isoToDateParts(endIso);
      const localStart = formattedLocalDate(ev.scheduling?.startDateFormatted ?? null);
      const localEnd = formattedLocalDate(ev.scheduling?.endDateFormatted ?? null);
      const startDate = localStart ?? start.date;
      const endDate = localEnd ?? end.date;
      const startTimeLocal = ev.scheduling?.startTimeFormatted?.trim() || null;
      const endTimeLocal = ev.scheduling?.endTimeFormatted?.trim() || null;
      const startDateTime = localDateTime(startDate, startTimeLocal) ?? start.dateTime;
      const endDateTime = localDateTime(endDate, endTimeLocal) ?? end.dateTime;
      const slug = ev.slug?.trim() || null;
      const eventUrl = buildDetailUrl(origin, detailsPrefix, slug);
      const actionType = inferWixActionType(ev);
      const desc = (ev.description ?? ev.about ?? '').trim() || null;
      const restrictions = extractPublicRestrictions(desc);
      const soldOut =
        typeof ev.registration?.ticketing?.soldOut === 'boolean'
          ? ev.registration.ticketing.soldOut
          : null;
      const priceText =
        ev.registration?.ticketing?.lowestTicketPriceFormatted ??
        ev.registration?.ticketing?.lowestPrice ??
        null;
      const recurrenceStatus = ev.scheduling?.config?.recurrences?.status;
      const isRecurring = typeof recurrenceStatus === 'number' && recurrenceStatus > 0;
      const ticketUrl = actionType === 'ticket' ? eventUrl : null;
      const rsvpUrl = actionType === 'rsvp' ? eventUrl : null;
      const row: RawWixRow = {
        _rawId: ev.id ?? null,
        externalId: ev.id ?? null,
        title: theme ? `${baseTitle} — Theme: ${theme}` : title,
        theme,
        baseTitle,
        startDate,
        startDateTime,
        endDate,
        endDateTime,
        startTimeLocal,
        endTimeLocal,
        venue: ev.location?.name?.trim() || null,
        address:
          ev.location?.fullAddress?.formattedAddress?.trim() ||
          ev.location?.address?.trim() ||
          null,
        city: ev.location?.fullAddress?.city?.trim() || null,
        regionState: ev.location?.fullAddress?.subdivision?.trim() || null,
        description: desc,
        priceText,
        isFree: null,
        eventUrl,
        ticketUrl,
        rsvpUrl,
        ticketOrRsvpUrl: eventUrl,
        imageUrl: ev.mainImage?.url ?? null,
        isRecurring,
        membersOnly: restrictions.membersOnly,
        vettedGuests: restrictions.vettedGuests,
        ageRestriction: restrictions.ageRestriction,
        soldOut,
        actionType,
        companionGroupKey: null,
        companionExternalIds: ev.id ? [ev.id] : [],
        companionTitles: [title],
        companionEventUrls: eventUrl ? [eventUrl] : [],
        titleAlias: null,
        evidence: [
          'wix_events_hydration',
          ev.id ? `wix_event_id:${ev.id}` : 'wix_event_id:missing',
          `details_path:${detailsPrefix}`,
          startDate ? `start:${startDate}` : 'start:unresolved',
          startTimeLocal ? `start_time_local:${startTimeLocal}` : 'start_time:unresolved',
          `action:${actionType}`,
          isRecurring ? 'recurring:true' : 'recurring:false',
          theme ? `theme:${theme}` : 'theme:none',
        ],
        method: 'wix_events_hydration',
        verificationState: 'partial',
        needsCompanionReview: false,
        detailsPathPrefix: detailsPrefix,
      };
      if (!row.startDate && !row.startDateTime) row.verificationState = 'unresolved_date';
      else if (row.eventUrl || row.startDate) row.verificationState = 'verified';
      return row;
    })
    .filter((r): r is RawWixRow => Boolean(r));
}

/**
 * Group ticket + themed RSVP companions for one night when evidence is strong.
 * Uncertain pairs stay separate and flagged for review.
 */
export function groupWixTicketRsvpCompanions(rows: RawWixRow[]): {
  nights: WixExtractedListing[];
  companionPairsLinked: number;
  duplicatesSuppressed: number;
} {
  const byKey = new Map<string, RawWixRow[]>();
  for (const row of rows) {
    const key = nightGroupKey({
      startDateTime: row.startDateTime,
      startDate: row.startDate,
      venue: row.venue,
      baseTitle: row.baseTitle,
    });
    const list = byKey.get(key) ?? [];
    list.push(row);
    byKey.set(key, list);
  }

  const nights: WixExtractedListing[] = [];
  let companionPairsLinked = 0;
  let duplicatesSuppressed = 0;

  for (const [key, group] of byKey) {
    // Exact same provider id / URL duplicates within a night.
    const uniq: RawWixRow[] = [];
    const seenIds = new Set<string>();
    for (const g of group) {
      const idKey = g._rawId ?? g.eventUrl ?? g.title;
      if (seenIds.has(idKey)) {
        duplicatesSuppressed += 1;
        continue;
      }
      seenIds.add(idKey);
      uniq.push(g);
    }

    if (uniq.length === 1) {
      const only = uniq[0]!;
      const { _rawId: _, ...rest } = only;
      nights.push({ ...rest, companionGroupKey: null });
      continue;
    }

    const tickets = uniq.filter((r) => r.actionType === 'ticket');
    const rsvps = uniq.filter((r) => r.actionType === 'rsvp');
    const themed = uniq.filter((r) => Boolean(r.theme));
    const unthemed = uniq.filter((r) => !r.theme);

    const canPair =
      uniq.length === 2 &&
      ((tickets.length === 1 && rsvps.length === 1) ||
        (themed.length === 1 && unthemed.length === 1 && normalizeBaseTitle(themed[0]!.baseTitle) === normalizeBaseTitle(unthemed[0]!.baseTitle)));

    if (!canPair) {
      // Keep separate; mark review when same night/base but ambiguous.
      for (const row of uniq) {
        const { _rawId: _, ...rest } = row;
        nights.push({
          ...rest,
          needsCompanionReview: true,
          evidence: [...rest.evidence, 'companion:uncertain_same_night_kept_separate', `night_key:${key}`],
        });
      }
      continue;
    }

    const primary =
      themed[0] ??
      rsvps.find((r) => r.theme) ??
      rsvps[0] ??
      tickets[0] ??
      uniq[0]!;
    const secondary = uniq.find((r) => r !== primary) ?? uniq[1]!;
    const ticketUrl = tickets[0]?.eventUrl ?? (primary.actionType === 'ticket' ? primary.eventUrl : secondary.eventUrl);
    const rsvpUrl = rsvps[0]?.eventUrl ?? (primary.actionType === 'rsvp' ? primary.eventUrl : secondary.eventUrl);
    const ids = [...new Set([...uniq.flatMap((r) => r.companionExternalIds)])].sort();
    const titles = [...new Set(uniq.flatMap((r) => r.companionTitles))];
    const urls = [...new Set(uniq.flatMap((r) => r.companionEventUrls))];
    const alias = unthemed[0]?.title ?? (primary.theme ? secondary.baseTitle : null);
    const displayTitle = primary.theme
      ? `${primary.baseTitle} — Theme: ${primary.theme}`
      : primary.title;

    const merged: WixExtractedListing = {
      ...primary,
      externalId: key,
      title: displayTitle,
      titleAlias: alias && alias !== displayTitle ? alias : null,
      ticketUrl: ticketUrl ?? null,
      rsvpUrl: rsvpUrl ?? null,
      ticketOrRsvpUrl: ticketUrl ?? rsvpUrl ?? primary.eventUrl,
      eventUrl: primary.eventUrl ?? secondary.eventUrl,
      companionGroupKey: key,
      companionExternalIds: ids,
      companionTitles: titles,
      companionEventUrls: urls,
      membersOnly: primary.membersOnly ?? secondary.membersOnly,
      vettedGuests: primary.vettedGuests ?? secondary.vettedGuests,
      ageRestriction: primary.ageRestriction ?? secondary.ageRestriction,
      soldOut: mergeCompanionSoldOut(uniq),
      priceText: primary.priceText ?? secondary.priceText,
      description: primary.description ?? secondary.description,
      imageUrl: primary.imageUrl ?? secondary.imageUrl,
      needsCompanionReview: false,
      evidence: [
        ...primary.evidence.filter((e) => !e.startsWith('wix_event_id:') && e !== 'theme:none'),
        ...ids.map((id) => `wix_event_id:${id}`),
        'companion:ticket_rsvp_grouped',
        `companion_group:${key}`,
        ticketUrl ? `ticket_url:${ticketUrl}` : 'ticket_url:missing',
        rsvpUrl ? `rsvp_url:${rsvpUrl}` : 'rsvp_url:missing',
      ],
    };
    companionPairsLinked += 1;
    duplicatesSuppressed += uniq.length - 1;
    nights.push(merged);
  }

  nights.sort((a, b) => {
    const as = a.startDateTime ?? a.startDate ?? '';
    const bs = b.startDateTime ?? b.startDate ?? '';
    if (as !== bs) return as.localeCompare(bs);
    return a.title.localeCompare(b.title);
  });

  return { nights, companionPairsLinked, duplicatesSuppressed };
}

export function extractSsrWixEventCards(html: string, pageUrl: string): WixExtractedListing[] {
  const detailsPrefix = detectWixDetailsPathPrefix(html, pageUrl);
  const events: WixExtractedListing[] = [];
  const cardRe =
    /data-hook=["']title["'][^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>[\s\S]*?data-hook=["']short-date["'][^>]*>([^<]+)<[\s\S]*?data-hook=["']short-location["'][^>]*>([^<]+)</gi;
  let match: RegExpExecArray | null;
  while ((match = cardRe.exec(html)) !== null) {
    const eventUrl = absoluteUrl(match[1], pageUrl);
    const rawTitle = decodeHtmlEntities(match[2]!.trim());
    const shortDate = decodeHtmlEntities(match[3]!.trim());
    const venue = decodeHtmlEntities(match[4]!.trim());
    if (!rawTitle) continue;
    const { baseTitle, theme } = splitWixThemeTitle(rawTitle);
    const chunk = html.slice(Math.max(0, match.index - 80), Math.min(html.length, match.index + 1200));
    const actionType: WixRegistrationAction = /Buy Tickets/i.test(chunk)
      ? 'ticket'
      : /\bRSVP\b/i.test(chunk)
        ? 'rsvp'
        : 'unknown';
    const row: WixExtractedListing = {
      externalId: null,
      title: theme ? `${baseTitle} — Theme: ${theme}` : rawTitle,
      theme,
      baseTitle,
      startDate: null,
      startDateTime: null,
      endDate: null,
      endDateTime: null,
      startTimeLocal: null,
      endTimeLocal: null,
      venue: venue || null,
      address: null,
      city: null,
      regionState: null,
      description: null,
      priceText: null,
      isFree: null,
      eventUrl,
      ticketUrl: actionType === 'ticket' ? eventUrl : null,
      rsvpUrl: actionType === 'rsvp' ? eventUrl : null,
      ticketOrRsvpUrl: eventUrl,
      imageUrl: null,
      isRecurring: /multiple dates/i.test(chunk),
      membersOnly: null,
      vettedGuests: null,
      ageRestriction: null,
      soldOut: null,
      actionType,
      companionGroupKey: null,
      companionExternalIds: [],
      companionTitles: [rawTitle],
      companionEventUrls: eventUrl ? [eventUrl] : [],
      titleAlias: null,
      evidence: [
        'semantic_html_wix_card',
        `short_date:${shortDate}`,
        venue ? `venue:${venue}` : 'venue:missing',
        `details_path:${detailsPrefix}`,
        `action:${actionType}`,
      ],
      method: 'semantic_html_blocks',
      verificationState: 'unresolved_date',
      needsCompanionReview: false,
      detailsPathPrefix: detailsPrefix,
    };
    const slugDate = eventUrl?.match(/(\d{4})-(\d{2})-(\d{2})(?:-(\d{2})-(\d{2}))?/);
    if (slugDate) {
      row.startDate = `${slugDate[1]}-${slugDate[2]}-${slugDate[3]}`;
      row.evidence.push(`slug_date:${row.startDate}`);
      row.verificationState = 'verified';
    }
    events.push(row);
  }
  return events;
}

export function extractWixEventListings(
  html: string,
  pageUrl: string,
): { events: WixExtractedListing[]; diagnostics: WixExtractDiagnostics; method: 'wix_events_hydration' | 'semantic_html_blocks' | 'none' } {
  const detailsPathPrefix = detectWixDetailsPathPrefix(html, pageUrl);
  const hydrated = extractWixEventsHydration(html);
  const ssrCards = extractSsrWixEventCards(html, pageUrl);
  // Asset URL mentions of events-viewer alone are not a mounted list.
  const hasMountedEventList =
    /data-hook=["']EVENTS_ROOT_NODE["']/i.test(html) ||
    /data-hook=["']side-by-side-items?["']/i.test(html) ||
    ((html.match(/data-hook=["']title["']/gi)?.length ?? 0) >= 1 &&
      (html.match(/data-hook=["']short-date["']/gi)?.length ?? 0) >= 1) ||
    /"events"\s*:\s*\[/.test(html);

  if (hydrated.length > 0) {
    const rows = hydrateToRows(hydrated, pageUrl, detailsPathPrefix);
    const grouped = groupWixTicketRsvpCompanions(rows);
    return {
      events: grouped.nights,
      method: 'wix_events_hydration',
      diagnostics: {
        hydrationCandidates: hydrated.length,
        ssrCardCandidates: ssrCards.length,
        acceptedNights: grouped.nights.length,
        companionPairsLinked: grouped.companionPairsLinked,
        duplicatesSuppressed: grouped.duplicatesSuppressed,
        incompleteRender: false,
        detailsPathPrefix,
        renderingComplete: true,
      },
    };
  }

  if (ssrCards.length > 0) {
    const asRaw: RawWixRow[] = ssrCards.map((c) => ({ ...c, _rawId: c.externalId }));
    const grouped = groupWixTicketRsvpCompanions(asRaw);
    return {
      events: grouped.nights,
      method: 'semantic_html_blocks',
      diagnostics: {
        hydrationCandidates: 0,
        ssrCardCandidates: ssrCards.length,
        acceptedNights: grouped.nights.length,
        companionPairsLinked: grouped.companionPairsLinked,
        duplicatesSuppressed: grouped.duplicatesSuppressed,
        incompleteRender: false,
        detailsPathPrefix,
        renderingComplete: true,
      },
    };
  }

  const emptyListLoaded =
    /"events"\s*:\s*\[\s*\]/.test(html) &&
    (/"hasMore"\s*:\s*false/.test(html) || /"moreLoading"\s*:\s*false/.test(html));
  const incompleteRender =
    hasMountedEventList &&
    hydrated.length === 0 &&
    ssrCards.length === 0 &&
    !emptyListLoaded;

  return {
    events: [],
    method: 'none',
    diagnostics: {
      hydrationCandidates: 0,
      ssrCardCandidates: 0,
      acceptedNights: 0,
      companionPairsLinked: 0,
      duplicatesSuppressed: 0,
      incompleteRender,
      detailsPathPrefix,
      renderingComplete: emptyListLoaded || !hasMountedEventList,
    },
  };
}

/** Selectors / payload markers proving the Wix event list finished rendering. */
export const WIX_EVENT_LIST_READY_SELECTORS = [
  '[data-hook="title"]',
  '[data-hook="side-by-side-item"]',
  '[data-hook="EVENTS_ROOT_NODE"]',
  '[data-hook="short-date"]',
] as const;

export function htmlLooksLikeIncompleteWixEventRender(html: string): boolean {
  const hasWix = /static\.parastorage\.com|wix-thunderbolt|Wix\.com Website Builder/i.test(html);
  if (!hasWix) return false;
  const hasMountedEventList =
    /data-hook=["']EVENTS_ROOT_NODE["']/i.test(html) ||
    /data-hook=["']side-by-side-items?["']/i.test(html) ||
    ((html.match(/data-hook=["']title["']/gi)?.length ?? 0) >= 1 &&
      (html.match(/data-hook=["']short-date["']/gi)?.length ?? 0) >= 1) ||
    /"events"\s*:\s*\[/.test(html);
  if (!hasMountedEventList) return false;
  const hydrated = extractWixEventsHydration(html);
  if (hydrated.length > 0) return false;
  const hasCards =
    (html.match(/data-hook=["']title["']/gi)?.length ?? 0) >= 1 &&
    (html.match(/data-hook=["']short-date["']/gi)?.length ?? 0) >= 1;
  const emptyListLoaded =
    /"events"\s*:\s*\[\s*\]/.test(html) &&
    (/"hasMore"\s*:\s*false/.test(html) || /"moreLoading"\s*:\s*false/.test(html));
  return !hasCards && !emptyListLoaded;
}
