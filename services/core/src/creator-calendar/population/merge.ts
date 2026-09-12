import {
  computeSkipMatchIdentity,
  skipIdentitiesMatch,
  type SkipMatchIdentity,
} from '../../creator-skip/fingerprint.js';
import { calendarMarketTokensConflict, strongerVerification, verificationRank } from './eligibility.js';
import type { PopulationCandidate } from './types.js';
import type { CalendarItemView } from '../types.js';
import { admissionEntitiesMatch } from '../admission/entity-resolution.js';

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

/** Admission-aware duplicate match (Nerd Con / Nerdcon, venue aliases). */
export function populationCandidatesAreDuplicates(
  a: PopulationCandidate,
  b: PopulationCandidate,
): boolean {
  const identityA = skipIdentityForCandidate(a);
  const identityB = skipIdentityForCandidate(b);
  if (identityA && identityB && calendarIdentitiesMatch(identityA, identityB)) return true;
  return admissionEntitiesMatch(
    {
      title: a.title,
      startAt: a.startAt,
      venue: a.location,
      location: a.location,
      sourceUrl: a.sourceUrl,
    },
    {
      title: b.title,
      startAt: b.startAt,
      venue: b.location,
      location: b.location,
      sourceUrl: b.sourceUrl,
    },
  );
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
  const mergedIds = [
    ...new Set(
      [
        a.sourceRecordId,
        b.sourceRecordId,
        ...((Array.isArray(preferContent.metadata?.mergedSourceIds)
          ? preferContent.metadata?.mergedSourceIds
          : []) as string[]),
        ...((Array.isArray(other.metadata?.mergedSourceIds)
          ? other.metadata?.mergedSourceIds
          : []) as string[]),
      ].filter(Boolean),
    ),
  ];
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
      mergedSourceIds: mergedIds,
      admissionMergedDuplicate: true,
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
  for (const candidate of candidates) {
    const matchIdx = out.findIndex((existing) => populationCandidatesAreDuplicates(existing, candidate));
    if (matchIdx >= 0) {
      out[matchIdx] = mergeCandidates(out[matchIdx]!, candidate);
      continue;
    }
    out.push(candidate);
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
