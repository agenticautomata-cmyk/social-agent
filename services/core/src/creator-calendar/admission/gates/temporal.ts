import type { CalendarAdmissionCandidate, CalendarAdmissionReasonCode } from '../types.js';

const YEAR_RE = /\b((?:19|20)\d{2})\b/;
const ORDINAL_ANNUAL_RE = /\b(\d{1,3})(?:st|nd|rd|th)\s+annual\b/i;
const MONTH_DAY_NO_YEAR_RE =
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?\b(?!\s*,?\s*(?:19|20)\d{2})/i;

export type TemporalGateResult = {
  ok: boolean;
  quarantine: boolean;
  reason: CalendarAdmissionReasonCode | null;
  detail: string;
  temporalEvidence: string[];
  yearExplicit: boolean;
};

function parseYear(iso: string | null | undefined): number | null {
  if (!iso?.trim()) return null;
  const m = iso.trim().match(/^((?:19|20)\d{2})/);
  if (m) return Number(m[1]);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getUTCFullYear();
}

function yearInText(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.match(YEAR_RE);
  return m ? Number(m[1]) : null;
}

/**
 * Event date requires evidence containing the applicable year.
 * Never year-roll from old articles; never treat publication date as event date.
 */
export function evaluateTemporalGate(
  c: CalendarAdmissionCandidate,
  now = new Date(),
): TemporalGateResult {
  const evidence: string[] = [];
  const eventIso = c.eventDate?.trim() || null;
  if (!eventIso) {
    return {
      ok: false,
      quarantine: false,
      reason: 'no_date',
      detail: 'missing_event_date',
      temporalEvidence: evidence,
      yearExplicit: false,
    };
  }

  const eventYear = parseYear(eventIso);
  const extractedYear = parseYear(c.extractedEventDate);
  const titleYear = yearInText(c.title);
  const summaryYear = yearInText(c.summary);
  const pubYear = parseYear(c.publicationDate);
  const nowYear = now.getUTCFullYear();

  const yearExplicitFlag =
    c.yearExplicit === true ||
    Boolean(c.extractedEventDate && YEAR_RE.test(c.extractedEventDate)) ||
    titleYear === eventYear ||
    (extractedYear != null && extractedYear === eventYear) ||
    c.watchlistVerified === true ||
    Boolean(c.parser && /schema\.org|json-ld|ics|eventbrite|wix|meetup|dostuff|do816/i.test(c.parser));

  if (titleYear != null) evidence.push(`title_year:${titleYear}`);
  if (extractedYear != null) evidence.push(`extracted_year:${extractedYear}`);
  if (eventYear != null) evidence.push(`event_iso_year:${eventYear}`);
  if (pubYear != null) evidence.push(`publication_year:${pubYear}`);
  if (c.yearExplicit === true) evidence.push('year_explicit_flag');
  if (c.watchlistVerified) evidence.push('watchlist_verified_temporal');

  // Past year in title while assigned to a future/current calendar year → stale.
  if (titleYear != null && titleYear < nowYear && eventYear != null && eventYear >= nowYear) {
    return {
      ok: false,
      quarantine: false,
      reason: 'stale_source',
      detail: 'past_year_in_title_rolled_forward',
      temporalEvidence: evidence,
      yearExplicit: false,
    };
  }

  // Ordinal annual articles: "93rd annual" news must not land on a later season without year proof.
  const ordinal = (c.title ?? '').match(ORDINAL_ANNUAL_RE);
  if (ordinal && pubYear != null && eventYear != null && pubYear < eventYear && !yearExplicitFlag) {
    return {
      ok: false,
      quarantine: false,
      reason: 'stale_source',
      detail: `annual_ordinal_from_older_publication:${ordinal[1]}`,
      temporalEvidence: evidence,
      yearExplicit: false,
    };
  }
  if (ordinal && titleYear != null && titleYear < nowYear) {
    return {
      ok: false,
      quarantine: false,
      reason: 'stale_source',
      detail: `stale_annual_title_year:${titleYear}`,
      temporalEvidence: evidence,
      yearExplicit: false,
    };
  }
  // News-domain ordinal annual without an explicit year in the title → stale/unverified year roll.
  const newsDomain = /\/news\/|kshb\.com|kansascity\.com|thepitchkc\.com|fox4kc\.com/i.test(
    c.sourceUrl ?? '',
  );
  if (ordinal && newsDomain && titleYear == null && eventYear != null && eventYear >= nowYear) {
    return {
      ok: false,
      quarantine: false,
      reason: 'stale_source',
      detail: `news_ordinal_annual_without_year:${ordinal[1]}`,
      temporalEvidence: evidence,
      yearExplicit: false,
    };
  }

  // Publication date used as event date (same YMD, article-like title, no extracted event date).
  if (
    c.publicationDate &&
    eventIso &&
    c.publicationDate.slice(0, 10) === eventIso.slice(0, 10) &&
    !c.extractedEventDate &&
    /\b(?:news|preview|recap|wrap(?:-|\s)?up|coverage)\b/i.test(`${c.title} ${c.summary ?? ''}`)
  ) {
    return {
      ok: false,
      quarantine: true,
      reason: 'date_year_unverified',
      detail: 'publication_date_as_event_date',
      temporalEvidence: evidence,
      yearExplicit: false,
    };
  }

  // Month/day prose without year, assigned to current/future year without structured evidence.
  const prose = `${c.title ?? ''} ${c.summary ?? ''}`;
  if (
    MONTH_DAY_NO_YEAR_RE.test(prose) &&
    titleYear == null &&
    summaryYear == null &&
    !c.extractedEventDate &&
    !c.watchlistVerified &&
    eventYear != null &&
    eventYear >= nowYear
  ) {
    return {
      ok: false,
      quarantine: true,
      reason: 'date_year_unverified',
      detail: 'month_day_without_year_evidence',
      temporalEvidence: evidence,
      yearExplicit: false,
    };
  }

  // News/article-shaped rows without any year-bearing evidence beyond a guessed ISO.
  if (!yearExplicitFlag && !c.userConfirmed && !c.watchlistVerified) {
    const ingest = (c.ingest ?? '').toLowerCase();
    const articleShaped =
      /\b(?:annual|preview|recap|wrap(?:-|\s)?up|announces|returns?)\b/i.test(
        `${c.title ?? ''} ${c.summary ?? ''}`,
      ) || Boolean(ordinal);
    const weakProvenance =
      /openai|web_search|research/.test(ingest) || /utm_source=openai/i.test(c.sourceUrl ?? '');
    if (articleShaped && weakProvenance && titleYear == null && extractedYear == null) {
      return {
        ok: false,
        quarantine: true,
        reason: 'date_year_unverified',
        detail: 'year_not_explicit_in_evidence',
        temporalEvidence: evidence,
        yearExplicit: false,
      };
    }
  }

  return {
    ok: true,
    quarantine: false,
    reason: null,
    detail: 'temporal_ok',
    temporalEvidence: evidence,
    yearExplicit: yearExplicitFlag || titleYear === eventYear || extractedYear === eventYear,
  };
}
