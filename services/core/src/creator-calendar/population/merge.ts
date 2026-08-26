import {
  computeSkipMatchIdentity,
  skipIdentitiesMatch,
  type SkipMatchIdentity,
} from '../../creator-skip/fingerprint.js';
import { calendarMarketTokensConflict, strongerVerification, verificationRank } from './eligibility.js';
import type { PopulationCandidate } from './types.js';
import type { CalendarItemView } from '../types.js';

function chicagoDayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function calendarSkipIdentity(input: {
  title: string;
  startAt: string;
  location?: string | null;
}): SkipMatchIdentity | null {
  const identity = computeSkipMatchIdentity({
    title: input.title,
    eventDate: input.startAt,
    locationName: input.location,
    venue: input.location,
  });
  if (!identity) return null;
  const day = chicagoDayKey(input.startAt);
  return day ? { ...identity, day } : identity;
}

export function skipIdentityForCandidate(candidate: PopulationCandidate): SkipMatchIdentity | null {
  return calendarSkipIdentity({
    title: candidate.title,
    startAt: candidate.startAt,
    location: candidate.location,
  });
}

/** Same logical event on the Chicago calendar day — not UTC date-only midnight. */
export function calendarIdentitiesMatch(a: SkipMatchIdentity, b: SkipMatchIdentity): boolean {
  if (a.key === b.key) return true;
  if (calendarMarketTokensConflict(a.tokens, b.tokens)) return false;
  if (skipIdentitiesMatch(a, b)) return true;
  if (a.day !== b.day || a.city !== b.city) return false;
  if (a.venue && b.venue && a.venue !== b.venue) return false;
  const shared = a.tokens.filter((token) => b.tokens.includes(token));
  return shared.length >= 3;
}

export function mergeCandidates(a: PopulationCandidate, b: PopulationCandidate): PopulationCandidate {
  const preferContent = b.sourceRecordType === 'content_item' && a.sourceRecordType !== 'content_item' ? b : a;
  const other = preferContent === a ? b : a;
  const verification = strongerVerification(preferContent.verificationState, other.verificationState);
  const officialUrl =
    verificationRank(other.verificationState) > verificationRank(preferContent.verificationState)
      ? other.sourceUrl
      : preferContent.sourceUrl;
  const ticketUrl =
    (typeof preferContent.metadata?.ticketUrl === 'string' && preferContent.metadata.ticketUrl) ||
    (typeof other.metadata?.ticketUrl === 'string' && other.metadata.ticketUrl) ||
    null;
  const organizerUrl =
    (typeof preferContent.metadata?.organizerUrl === 'string' && preferContent.metadata.organizerUrl) ||
    (typeof other.metadata?.organizerUrl === 'string' && other.metadata.organizerUrl) ||
    null;
  return {
    ...preferContent,
    sourceUrl: officialUrl ?? other.sourceUrl ?? preferContent.sourceUrl,
    verificationState: verification,
    whyIncluded: [preferContent.whyIncluded, other.whyIncluded].filter(Boolean).join(' + '),
    metadata: {
      ...(other.metadata ?? {}),
      ...(preferContent.metadata ?? {}),
      ticketUrl,
      organizerUrl,
      mergedSourceIds: [a.sourceRecordId, b.sourceRecordId],
      curatorLeadId:
        (preferContent.metadata?.curatorLeadId as string | undefined) ??
        (other.metadata?.curatorLeadId as string | undefined) ??
        (a.sourceRecordType === 'curator_event_lead'
          ? a.sourceRecordId
          : b.sourceRecordType === 'curator_event_lead'
            ? b.sourceRecordId
            : null),
    },
  };
}

export function dedupePopulationCandidates(candidates: PopulationCandidate[]): PopulationCandidate[] {
  const out: PopulationCandidate[] = [];
  const identities: SkipMatchIdentity[] = [];
  for (const candidate of candidates) {
    const identity = skipIdentityForCandidate(candidate);
    const matchIdx = identity
      ? identities.findIndex((existing) => calendarIdentitiesMatch(existing, identity))
      : -1;
    if (matchIdx >= 0) {
      out[matchIdx] = mergeCandidates(out[matchIdx]!, candidate);
      continue;
    }
    out.push(candidate);
    if (identity) identities.push(identity);
  }
  return out;
}

function skipIdentityForView(view: Pick<CalendarItemView, 'title' | 'startAt' | 'location'>): SkipMatchIdentity | null {
  return calendarSkipIdentity({
    title: view.title,
    startAt: view.startAt,
    location: view.location,
  });
}

function preferCalendarView(a: CalendarItemView, b: CalendarItemView): CalendarItemView {
  const aSelected = a.selected === true || a.planningStatus === 'confirmed';
  const bSelected = b.selected === true || b.planningStatus === 'confirmed';
  if (aSelected !== bSelected) return aSelected ? a : b;
  if ((a.sourceRecordType === 'content_item') !== (b.sourceRecordType === 'content_item')) {
    return a.sourceRecordType === 'content_item' ? a : b;
  }
  if (verificationRank(a.verificationState) !== verificationRank(b.verificationState)) {
    return verificationRank(a.verificationState) > verificationRank(b.verificationState) ? a : b;
  }
  return (b.title?.length ?? 0) > (a.title?.length ?? 0) ? b : a;
}

/** Hide extra cards for the same logical event after projection leaves historical rows behind. */
export function dedupeActiveCalendarViews(views: CalendarItemView[]): CalendarItemView[] {
  const out: CalendarItemView[] = [];
  const identities: Array<SkipMatchIdentity | null> = [];
  for (const view of views) {
    const identity = skipIdentityForView(view);
    const matchIdx = identity
      ? identities.findIndex((existing) => existing && calendarIdentitiesMatch(existing, identity))
      : -1;
    if (matchIdx >= 0) {
      out[matchIdx] = preferCalendarView(out[matchIdx]!, view);
      continue;
    }
    out.push(view);
    identities.push(identity);
  }
  return out;
}
