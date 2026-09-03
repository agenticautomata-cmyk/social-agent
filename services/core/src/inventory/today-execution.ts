/**
 * Today execution workspace — what Kellie actually needs to do today.
 * Does not browse inventory, score Discover, or queue pitches.
 */

import { and, desc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { db } from '../db.js';
import {
  contentItems,
  creatorCalendarItems,
  creatorInterestRecords,
  creatorResearchJobs,
} from '../schema.js';
import {
  addDays,
  toDateOnlyString as plannerDateOnly,
} from '../content-planner/dates.js';
import {
  upsertPlannerItem,
  type PlannerItemRecord,
} from '../content-planner/items.js';
import { createCalendarItem } from '../creator-calendar/items.js';
import {
  isDirtyDisplayTitle,
  resolveDisplayTitle,
  resolveDisplayTitleFromRecord,
  stripDisplayMarkup,
} from '../display-title/index.js';
import { isWatchlistBriefEligible } from '../curator-watchlist/watchlist-intelligence.js';
import { listWatchlistActivity } from '../curator-watchlist/watchlist-activity.js';
import { loadAllPlannerItems } from '../content-planner/items.js';
import {
  loadPartnershipDecisions,
  type PartnershipDecision,
} from '../partnership-today/decisions.js';
import { loadInventoryItemsByIds } from './load-ingested.js';

export const CREATOR_TIMEZONE = 'America/Chicago';
export const BEST_MOVE_EMPTY = 'Nothing urgent right now.';
export const EMPTY_TODAY_MESSAGE = 'Nothing planned for today.';
export const MAX_BEST_MOVES = 1;
export const MAX_PRIORITIES = 3;
export const MAX_REVIEW_SHOWN = 3;
export const LOOKAHEAD_DAYS = 7;

export type TodayPlacement =
  | 'planned'
  | 'saved'
  | 'suggested'
  | 'awaiting_review'
  | 'completed'
  | 'expired'
  | 'dismissed'
  | 'pending_research';

export type TodayWorkKind =
  | 'visit'
  | 'film'
  | 'edit'
  | 'publish'
  | 'research'
  | 'follow_up'
  | 'task'
  | 'verification'
  | 'watchlist'
  | 'deadline'
  /** A partnership decision: approve a pitch, answer a business, unblock a contact. */
  | 'partnership';

export type TodayActionId =
  | 'open'
  | 'mark_done'
  | 'reschedule'
  | 'remove_from_today'
  | 'view_details'
  | 'review'
  | 'add_to_today'
  | 'add_to_calendar'
  | 'dismiss';

export type TodayWorkItem = {
  id: string;
  contentItemId: string | null;
  placement: TodayPlacement;
  kind: TodayWorkKind;
  title: string;
  rawTitle: string | null;
  subtitle: string | null;
  why: string | null;
  whenLabel: string | null;
  whereLabel: string | null;
  sourceUrl: string | null;
  detailsHref: string;
  dueDate: string | null;
  eventDate: string | null;
  verifiedFacts: string[];
  actions: TodayActionId[];
  origin: 'user' | 'benson';
  dueToday: boolean;
};

export type TodayPriority = {
  rank: number;
  label: string;
  href: string | null;
  kind: 'plan' | 'review' | 'deadline' | 'follow_up';
};

export type TodayEmptyAction = {
  label: string;
  href: string;
};

export type TodayExecutionWorkspace = {
  generatedAt: string;
  empty: boolean;
  emptyMessage: string;
  emptyActions: TodayEmptyAction[];
  plan: TodayWorkItem[];
  bestMove: TodayWorkItem | null;
  bestMoveEmpty: string;
  review: TodayWorkItem[];
  reviewTotal: number;
  reviewQueueHref: string;
  comingUp: TodayWorkItem[];
  completedToday: { count: number; items: TodayWorkItem[] };
  pendingResearch: TodayWorkItem[];
  priorities: TodayPriority[];
  /**
   * Partnership decisions, kept as their own list rather than mixed into `plan`.
   * Filming a restaurant and approving a pitch to that restaurant are different acts
   * with different consequences, and blending them would hide the one that sends mail.
   */
  partnershipDecisions: TodayWorkItem[];
};

export type TodayEditorResponse = {
  demoMode: boolean;
  generatedAt: string;
  execution: TodayExecutionWorkspace;
};

export type TodayInventoryRecord = {
  id: string;
  title: string;
  sourceName?: string | null;
  venue?: string | null;
  locationName?: string | null;
  sourceUrl?: string | null;
  summary?: string | null;
  eventDate?: string | null;
  eventEndDate?: string | null;
  category?: string | null;
  metadata?: Record<string, unknown> | null;
  businessName?: string | null;
};

export type TodayResearchRow = {
  contentItemId: string;
  interestId: string;
  jobId: string | null;
  status: 'queued' | 'researching' | 'needs_verification' | 'complete' | 'failed' | 'cancelled';
  requestedAssistance?: string[];
  enrichment?: {
    canonicalName?: { value?: string | null };
    website?: { value?: string | null };
    address?: { value?: string | null };
    hours?: { value?: string | null };
    researchSummary?: string | null;
    needsVerification?: string[];
  } | null;
  reviewedAt?: string | null;
  decision?: string | null;
  dismissedAt?: string | null;
};

export type TodayCalendarRow = {
  id: string;
  contentItemId: string | null;
  title: string;
  startAt: string;
  location?: string | null;
  planningStatus: string;
  selected: boolean;
  sourceUrl?: string | null;
};

export type TodayWatchlistRow = {
  id: string;
  title: string;
  summary: string;
  sourceUrl: string | null;
  eventDate: string | null;
  type: string;
  currentlyActionable: boolean;
  confidence: string;
  dateStatus: string;
  baselineKind: string;
  evidence: string;
  watchedSource: string;
};

export type TodayExecutionInput = {
  now: Date;
  planner: PlannerItemRecord[];
  inventory: Map<string, TodayInventoryRecord>;
  research: TodayResearchRow[];
  calendar: TodayCalendarRow[];
  watchlist: TodayWatchlistRow[];
  /**
   * Optional so every existing caller and test keeps its current behaviour: with no
   * partnerships supplied, Today computes exactly what it did before.
   */
  partnerships?: PartnershipDecision[];
};

export function dateOnlyInZone(date: Date, timeZone = CREATOR_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function asDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return dateOnlyInZone(parsed);
}

export function isTodayListName(name: string | null | undefined): boolean {
  return /^today$/i.test((name ?? '').trim());
}

export function isPitchOrOutreachRecord(item: {
  title?: string | null;
  category?: string | null;
} | null | undefined): boolean {
  if (!item) return false;
  const hay = `${item.category ?? ''} ${item.title ?? ''}`;
  return /\b(sponsor\s+pitch|outreach\s+email|start sponsor pitch|approve outreach)\b/i.test(hay);
}

export function classifyPlannerPlacement(
  record: PlannerItemRecord,
  now: Date,
  eventDate: string | null,
): TodayPlacement {
  const today = dateOnlyInZone(now);
  if (record.status === 'skipped') return 'dismissed';
  if (record.status === 'covered') {
    return asDateOnly(record.updatedAt) === today ? 'completed' : 'dismissed';
  }
  if (isExpiredEvent(eventDate, today) && !isDueOnOrBeforeToday(record, today, now)) {
    return 'expired';
  }
  if (isTodayListName(record.listName)) return 'planned';
  if (record.status === 'planned' && asDateOnly(record.plannedDate) === today) return 'planned';
  if (isDueOnOrBeforeToday(record, today, now)) return 'planned';
  if (record.status === 'saved' || record.status === 'considering') return 'saved';
  if (record.status === 'planned') return 'saved';
  return 'suggested';
}

export function isExpiredEvent(eventDate: string | null, today: string): boolean {
  const day = asDateOnly(eventDate);
  return Boolean(day && day < today);
}

export function isDueOnOrBeforeToday(
  record: PlannerItemRecord,
  today: string,
  now: Date,
): boolean {
  if (asDateOnly(record.dueDate) === today) return true;
  if (!record.followUpAt) return false;
  const follow = new Date(record.followUpAt);
  if (Number.isNaN(follow.getTime())) return false;
  return follow.getTime() <= now.getTime() || asDateOnly(record.followUpAt) === today;
}

function daysUntil(dateOnly: string | null, today: string): number | null {
  if (!dateOnly) return null;
  const start = new Date(`${today}T12:00:00`);
  const end = new Date(`${dateOnly}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function formatWhenLabel(dateOnly: string | null, today: string): string | null {
  if (!dateOnly) return null;
  const delta = daysUntil(dateOnly, today);
  if (delta === null) return dateOnly;
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  const pretty = new Date(`${dateOnly}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return pretty;
}

function inferWorkKind(record: PlannerItemRecord | null, fallback: TodayWorkKind): TodayWorkKind {
  const blob = `${record?.contentAngle ?? ''} ${record?.notes ?? ''} ${record?.listName ?? ''}`.toLowerCase();
  if (record?.followUpAt || record?.dueDate) {
    if (/\bfollow[- ]?up\b/.test(blob) || record?.followUpAt) return 'follow_up';
  }
  if (/\bedit\b/.test(blob)) return 'edit';
  if (/\b(publish|post)\b/.test(blob)) return 'publish';
  if (/\bfilm\b/.test(blob)) return 'film';
  if (/\bvisit\b/.test(blob) || record?.contentAngle === 'plan_visit') return 'visit';
  if (/\bresearch|verif/.test(blob)) return 'research';
  return fallback;
}

function cleanTitleFor(
  item: TodayInventoryRecord | undefined,
  fallback: string,
  officialName?: string | null,
): {
  title: string;
  rawTitle: string | null;
  subtitle: string | null;
  verification: string;
} {
  const raw = item?.title ?? fallback;
  const resolved = item
    ? resolveDisplayTitleFromRecord({
        rawTitle: item.title,
        sourceName: item.sourceName,
        venueName: item.venue ?? item.locationName,
        sourceUrl: item.sourceUrl,
        summary: item.summary,
        metadata: item.metadata,
        businessName: item.businessName,
        officialName,
      })
    : resolveDisplayTitle({ rawTitle: raw, officialName });
  return {
    title: resolved.displayTitle,
    rawTitle: raw,
    subtitle: resolved.displaySubtitle,
    verification: resolved.verification,
  };
}

function detailsHref(contentItemId: string | null, kind: TodayWorkKind): string {
  if (!contentItemId) return '/calendar';
  if (kind === 'research' || kind === 'verification') return `/discoveries/${contentItemId}`;
  return `/discoveries/${contentItemId}`;
}

function plannerToWorkItem(
  record: PlannerItemRecord,
  item: TodayInventoryRecord | undefined,
  placement: TodayPlacement,
  today: string,
  now: Date,
): TodayWorkItem {
  const display = cleanTitleFor(item, record.notes?.trim() || 'Untitled plan item');
  const eventDate = asDateOnly(item?.eventDate ?? record.plannedDate);
  const dueToday = isDueOnOrBeforeToday(record, today, now) || asDateOnly(record.plannedDate) === today;
  const kind = inferWorkKind(record, dueToday && record.followUpAt ? 'follow_up' : 'task');
  return {
    id: record.contentItemId,
    contentItemId: record.contentItemId,
    placement,
    kind,
    title: display.title,
    rawTitle: display.rawTitle,
    subtitle: display.subtitle,
    why: record.notes,
    whenLabel: formatWhenLabel(asDateOnly(record.dueDate ?? record.plannedDate ?? item?.eventDate), today),
    whereLabel: item?.locationName ?? item?.venue ?? null,
    sourceUrl: item?.sourceUrl ?? null,
    detailsHref: detailsHref(record.contentItemId, kind),
    dueDate: asDateOnly(record.dueDate ?? record.followUpAt),
    eventDate,
    verifiedFacts: [],
    actions:
      placement === 'planned'
        ? ['open', 'mark_done', 'reschedule', 'remove_from_today', 'view_details']
        : ['view_details'],
    origin: 'user',
    dueToday,
  };
}

function researchVerifiedFacts(row: TodayResearchRow): string[] {
  const facts: string[] = [];
  const name = row.enrichment?.canonicalName?.value?.trim();
  if (name) {
    const cleaned = resolveDisplayTitle({ rawTitle: name }).displayTitle;
    if (cleaned && !isDirtyDisplayTitle(cleaned)) facts.push(`Official name: ${cleaned}`);
  }
  const website = row.enrichment?.website?.value?.trim();
  if (website && !/list-manage|utm_source=openai/i.test(website)) {
    facts.push(`Official source: ${website}`);
  }
  const address = row.enrichment?.address?.value?.trim();
  if (address) facts.push(`Location: ${address}`);
  const hours = row.enrichment?.hours?.value?.trim();
  if (hours) facts.push(`Hours: ${hours}`);
  const needs = (row.enrichment?.needsVerification ?? []).filter((value) => !/hours|currently_open|phone/i.test(value));
  if (needs.length) facts.push(`Still needs a look: ${needs.slice(0, 3).join(', ')}`);
  return facts.slice(0, 4);
}

function researchToWorkItem(
  row: TodayResearchRow,
  item: TodayInventoryRecord | undefined,
  placement: TodayPlacement,
  today: string,
): TodayWorkItem {
  const official = row.enrichment?.canonicalName?.value?.trim();
  const display = cleanTitleFor(item, official || 'Research', official);
  const title = display.title;
  const pending = placement === 'pending_research';
  return {
    id: `research:${row.contentItemId}`,
    contentItemId: row.contentItemId,
    placement,
    kind: row.status === 'needs_verification' ? 'verification' : 'research',
    title,
    rawTitle: display.rawTitle,
    subtitle: display.subtitle,
    why: pending
      ? 'Research in progress — Benson will add this to Ready for review when it finishes.'
      : (
          stripDisplayMarkup(row.enrichment?.researchSummary ?? '')
            .replace(/^#+\s*/g, '')
            .split(/(?<=\.)\s+/)
            .map((line) => line.trim())
            .find((line) => line.length > 24 && !/^https?:/i.test(line))
          || 'Requested research is ready to review.'
        ),
    whenLabel: pending ? 'In progress' : 'Ready today',
    whereLabel: item?.locationName ?? row.enrichment?.address?.value ?? null,
    sourceUrl: row.enrichment?.website?.value ?? item?.sourceUrl ?? null,
    detailsHref: `/discoveries/${row.contentItemId}`,
    dueDate: today,
    eventDate: asDateOnly(item?.eventDate),
    verifiedFacts: pending ? [] : researchVerifiedFacts(row),
    actions: pending ? ['view_details'] : ['review', 'add_to_today', 'add_to_calendar', 'dismiss'],
    origin: 'user',
    dueToday: !pending,
  };
}

function calendarToWorkItem(row: TodayCalendarRow, today: string): TodayWorkItem {
  const display = resolveDisplayTitle({ rawTitle: row.title });
  const eventDate = asDateOnly(row.startAt);
  return {
    id: `calendar:${row.id}`,
    contentItemId: row.contentItemId,
    placement: 'saved',
    kind: 'visit',
    title: display.displayTitle,
    rawTitle: row.title,
    subtitle: display.displaySubtitle,
    why: 'On your calendar.',
    whenLabel: formatWhenLabel(eventDate, today),
    whereLabel: row.location ?? null,
    sourceUrl: row.sourceUrl ?? null,
    detailsHref: row.contentItemId ? `/discoveries/${row.contentItemId}` : '/calendar',
    dueDate: null,
    eventDate,
    verifiedFacts: [],
    actions: ['view_details'],
    origin: 'user',
    dueToday: eventDate === today,
  };
}

function watchlistToWorkItem(row: TodayWatchlistRow, today: string): TodayWorkItem | null {
  const display = resolveDisplayTitle({ rawTitle: row.title, summary: row.summary });
  if (isDirtyDisplayTitle(display.displayTitle)) return null;
  const eventDate = asDateOnly(row.eventDate);
  return {
    id: `watchlist:${row.id}`,
    contentItemId: null,
    placement: 'awaiting_review',
    kind: 'watchlist',
    title: display.displayTitle,
    rawTitle: row.title,
    subtitle: display.displaySubtitle,
    why: row.summary || row.evidence,
    whenLabel: formatWhenLabel(eventDate, today),
    whereLabel: row.watchedSource,
    sourceUrl: row.sourceUrl,
    detailsHref: '/watchlist',
    dueDate: eventDate,
    eventDate,
    verifiedFacts: row.evidence ? [row.evidence] : [],
    actions: ['review', 'dismiss'],
    origin: 'benson',
    dueToday: eventDate === today,
  };
}

function identityKey(item: TodayWorkItem): string {
  return item.contentItemId ?? item.id;
}

function takeUnique(
  items: TodayWorkItem[],
  claimed: Set<string>,
): TodayWorkItem[] {
  const out: TodayWorkItem[] = [];
  for (const item of items) {
    const key = identityKey(item);
    if (claimed.has(key)) continue;
    claimed.add(key);
    out.push(item);
  }
  return out;
}

function sortPlan(a: TodayWorkItem, b: TodayWorkItem): number {
  if (a.dueToday !== b.dueToday) return a.dueToday ? -1 : 1;
  return (a.title ?? '').localeCompare(b.title ?? '');
}

function isUsableTitle(item: TodayWorkItem): boolean {
  return Boolean(item.title) && !isDirtyDisplayTitle(item.title);
}

function pickBestMove(candidates: TodayWorkItem[], today: string): TodayWorkItem | null {
  const usable = candidates.filter((item) => isUsableTitle(item) && !isPitchOrOutreachRecord(item));
  if (usable.length === 0) return null;
  const ranked = [...usable].sort((a, b) => {
    const aDays = daysUntil(a.eventDate, today) ?? 99;
    const bDays = daysUntil(b.eventDate, today) ?? 99;
    return aDays - bDays;
  });
  const top = ranked[0]!;
  return {
    ...top,
    placement: 'suggested',
    origin: 'benson',
    actions: top.contentItemId
      ? ['open', 'add_to_today', 'view_details']
      : ['view_details'],
  };
}

function buildPriorities(
  plan: TodayWorkItem[],
  review: TodayWorkItem[],
  bestMove: TodayWorkItem | null,
  partnerships: TodayWorkItem[] = [],
): TodayPriority[] {
  const out: TodayPriority[] = [];
  const seen = new Set<string>();
  const push = (item: TodayWorkItem, kind: TodayPriority['kind'], label: string) => {
    if (out.length >= MAX_PRIORITIES) return;
    if (!isUsableTitle(item)) return;
    const key = identityKey(item);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      rank: out.length + 1,
      label,
      href: item.detailsHref,
      kind,
    });
  };

  // Partnerships lead because a business waiting on an answer is the only thing here
  // with a cost outside Kellie's own schedule. They arrive already ordered by weight.
  for (const item of partnerships) {
    push(item, 'follow_up', item.title);
  }

  const dueFirst = [...plan].sort(sortPlan);
  for (const item of dueFirst) {
    const verb =
      item.kind === 'follow_up'
        ? 'Follow up'
        : item.kind === 'film'
          ? 'Film'
          : item.kind === 'edit'
            ? 'Edit'
            : item.kind === 'publish'
              ? 'Publish'
              : item.kind === 'visit'
                ? 'Visit'
                : 'Do';
    push(item, item.kind === 'follow_up' ? 'follow_up' : item.dueToday ? 'deadline' : 'plan', `${verb}: ${item.title}`);
  }
  for (const item of review) {
    push(item, 'review', `Review: ${item.title}`);
  }
  if (bestMove) {
    push(bestMove, 'plan', `Best move: ${bestMove.title}`);
  }
  return out;
}

export function computeTodayExecution(input: TodayExecutionInput): TodayExecutionWorkspace {
  const now = input.now;
  const today = dateOnlyInZone(now);
  const horizon = dateOnlyInZone(addDays(now, LOOKAHEAD_DAYS));

  const plan: TodayWorkItem[] = [];
  const saved: TodayWorkItem[] = [];
  const completed: TodayWorkItem[] = [];

  for (const record of input.planner) {
    const item = input.inventory.get(record.contentItemId);
    const placement = classifyPlannerPlacement(record, now, item?.eventDate ?? null);
    if (placement === 'dismissed' || placement === 'expired') continue;
    const work = plannerToWorkItem(record, item, placement, today, now);
    if (placement === 'planned') plan.push(work);
    else if (placement === 'completed') completed.push(work);
    else if (placement === 'saved') saved.push(work);
  }
  plan.sort(sortPlan);

  const pendingResearch: TodayWorkItem[] = [];
  const researchReview: TodayWorkItem[] = [];
  for (const row of input.research) {
    if (row.dismissedAt || row.decision || row.reviewedAt) continue;
    if (!isRequestedResearch(row)) continue;
    const item = input.inventory.get(row.contentItemId);
    if (row.status === 'queued' || row.status === 'researching') {
      pendingResearch.push(researchToWorkItem(row, item, 'pending_research', today));
      continue;
    }
    if (row.status === 'complete' || row.status === 'needs_verification') {
      researchReview.push(researchToWorkItem(row, item, 'awaiting_review', today));
    }
  }

  const unresolvedPlan = plan.filter((item) => !item.whenLabel || !item.whereLabel).map((item) => ({
    ...item,
    placement: 'awaiting_review' as const,
    kind: item.whereLabel ? item.kind : ('verification' as const),
    why: !item.whenLabel && !item.whereLabel
      ? 'Planned, but timing and location still need a decision.'
      : !item.whenLabel
        ? 'Planned, but timing is still unresolved.'
        : 'Planned, but location is still unresolved.',
    actions: ['review', 'view_details'] as TodayActionId[],
  }));

  const watchlistReview = input.watchlist
    .filter((row) => isTimeSensitiveWatchlist(row, today, horizon))
    .map((row) => watchlistToWorkItem(row, today))
    .filter((row): row is TodayWorkItem => row != null);

  const claimed = new Set<string>();
  const uniquePlan = takeUnique(plan, claimed);
  const reviewAll = takeUnique([...researchReview, ...watchlistReview, ...unresolvedPlan], claimed);
  const review = reviewAll.slice(0, MAX_REVIEW_SHOWN);

  const comingCandidates: TodayWorkItem[] = [];
  for (const item of saved) {
    const day = item.eventDate ?? item.dueDate;
    if (day && day > today && day <= horizon && isUsableTitle(item)) {
      comingCandidates.push({
        ...item,
        why: item.why ?? 'Saved, with a date in the next seven days.',
        actions: ['view_details', 'add_to_today'],
      });
    }
  }
  for (const row of input.calendar) {
    if (row.planningStatus === 'suggested' && !row.selected) continue;
    if (!(row.selected || row.planningStatus === 'confirmed' || row.planningStatus === 'tentative')) {
      continue;
    }
    const work = calendarToWorkItem(row, today);
    const day = work.eventDate;
    if (day && day > today && day <= horizon && isUsableTitle(work)) {
      comingCandidates.push(work);
    }
  }
  const comingUp = takeUnique(comingCandidates, new Set(claimed)).slice(0, 8);

  const bestCandidates: TodayWorkItem[] = [];
  for (const item of saved) {
    const delta = daysUntil(item.eventDate, today);
    if (delta != null && delta >= 0 && delta <= 2 && isUsableTitle(item) && !claimed.has(identityKey(item))) {
      bestCandidates.push({
        ...item,
        why: delta === 0
          ? 'Saved and happening today — prep or film if you want it.'
          : 'Saved and close enough that prep should start today.',
      });
    }
  }
  for (const row of input.calendar) {
    if (!(row.selected || row.planningStatus === 'confirmed')) continue;
    const work = calendarToWorkItem(row, today);
    const delta = daysUntil(work.eventDate, today);
    if (delta != null && delta >= 0 && delta <= 2 && isUsableTitle(work) && !claimed.has(identityKey(work))) {
      bestCandidates.push({
        ...work,
        why: 'Confirmed on your calendar and close enough to prepare today.',
      });
    }
  }
  const bestMove = pickBestMove(bestCandidates, today);

  const partnershipDecisions = (input.partnerships ?? []).map(partnershipToWorkItem);

  const priorities = buildPriorities(uniquePlan, review, bestMove, partnershipDecisions);
  // A day with a hotel pitch to approve and nothing filmed is not an empty day.
  const empty = uniquePlan.length === 0 && partnershipDecisions.length === 0;

  return {
    generatedAt: now.toISOString(),
    empty,
    emptyMessage: EMPTY_TODAY_MESSAGE,
    emptyActions: [
      { label: 'Browse Discover', href: '/discoveries' },
      { label: 'View Calendar', href: '/calendar' },
    ],
    plan: uniquePlan,
    bestMove,
    bestMoveEmpty: BEST_MOVE_EMPTY,
    review,
    reviewTotal: reviewAll.length,
    reviewQueueHref: '/discoveries',
    comingUp,
    completedToday: { count: completed.length, items: completed.slice(0, 8) },
    pendingResearch,
    priorities,
    partnershipDecisions,
  };
}

/**
 * Renders a partnership decision as a Today item.
 *
 * The subtitle carries compensation and contact confidence, so the stakes and the
 * trustworthiness of the recipient are both readable before anything is opened. That
 * is the whole point of putting it on Today rather than burying it in Pitches.
 */
function partnershipToWorkItem(decision: PartnershipDecision): TodayWorkItem {
  const details = [decision.compensationLabel, decision.contactLabel].filter(
    (value): value is string => Boolean(value),
  );
  return {
    id: `partnership:${decision.id}`,
    contentItemId: null,
    placement: 'awaiting_review',
    kind: 'partnership',
    title: decision.title,
    rawTitle: null,
    subtitle: details.length > 0 ? details.join(' · ') : null,
    why: decision.why,
    whenLabel: decision.dueDate ? `Due ${decision.dueDate}` : null,
    whereLabel: null,
    sourceUrl: null,
    detailsHref: decision.href,
    dueDate: decision.dueDate,
    eventDate: null,
    verifiedFacts: [],
    actions: ['open'],
    origin: 'benson',
    dueToday: true,
  };
}

const REQUESTED_RESEARCH = new Set([
  'research',
  'tell_me_more',
  'plan_visit',
  'generate_content_plan',
]);

export function isRequestedResearch(row: TodayResearchRow): boolean {
  return (row.requestedAssistance ?? []).some((value) => REQUESTED_RESEARCH.has(value));
}

export function isTimeSensitiveWatchlist(
  row: TodayWatchlistRow,
  today: string,
  horizon: string,
): boolean {
  if (!row.currentlyActionable) return false;
  const eligible = isWatchlistBriefEligible(
    {
      baselineKind: row.baselineKind === 'historical_baseline' ? 'historical_baseline' : 'new',
      currentlyActionable: row.currentlyActionable,
      confidence: row.confidence === 'high' || row.confidence === 'low' ? row.confidence : 'medium',
      dateStatus:
        row.dateStatus === 'contradictory' || row.dateStatus === 'uncertain'
          ? row.dateStatus
          : 'resolved',
      eventDate: row.eventDate,
      type: row.type,
      title: row.title,
      evidence: row.evidence,
      summary: row.summary,
      watchedSource: row.watchedSource,
    },
    new Date(`${today}T12:00:00`),
  );
  if (!eligible) return false;
  if (row.type === 'schedule_change') return true;
  const day = asDateOnly(row.eventDate);
  return Boolean(day && day >= today && day <= horizon);
}

function readTodayReviewMeta(metadata: Record<string, unknown> | null | undefined): {
  dismissedAt?: string;
  decision?: string;
  reviewedAt?: string;
} {
  const raw = metadata?.todayReview;
  if (!raw || typeof raw !== 'object') return {};
  const row = raw as Record<string, unknown>;
  return {
    dismissedAt: typeof row.dismissedAt === 'string' ? row.dismissedAt : undefined,
    decision: typeof row.decision === 'string' ? row.decision : undefined,
    reviewedAt: typeof row.reviewedAt === 'string' ? row.reviewedAt : undefined,
  };
}

async function loadTodayResearchRows(): Promise<TodayResearchRow[]> {
  const rows = await db
    .select({
      interest: creatorInterestRecords,
      job: creatorResearchJobs,
    })
    .from(creatorInterestRecords)
    .leftJoin(creatorResearchJobs, eq(creatorResearchJobs.id, creatorInterestRecords.researchJobId))
    .where(isNull(creatorInterestRecords.dismissedAt))
    .orderBy(desc(creatorInterestRecords.updatedAt))
    .limit(40);

  return rows
    .filter((row) => row.job || row.interest.enrichmentStatus !== 'cancelled')
    .map((row) => {
      const review = readTodayReviewMeta(row.interest.metadata as Record<string, unknown>);
      const status = (row.job?.status ?? row.interest.enrichmentStatus) as TodayResearchRow['status'];
      return {
        contentItemId: row.interest.contentItemId,
        interestId: row.interest.id,
        jobId: row.job?.id ?? row.interest.researchJobId,
        requestedAssistance: row.interest.requestedAssistance ?? [],
        status,
        enrichment: (row.job?.enrichment ?? null) as TodayResearchRow['enrichment'],
        reviewedAt: review.reviewedAt ?? null,
        decision: review.decision ?? null,
        dismissedAt: review.dismissedAt ?? (row.interest.dismissedAt?.toISOString() ?? null),
      };
    });
}

async function loadTodayCalendarRows(now: Date): Promise<TodayCalendarRow[]> {
  const from = new Date(`${dateOnlyInZone(now)}T00:00:00`);
  const to = addDays(from, LOOKAHEAD_DAYS + 1);
  const rows = await db
    .select()
    .from(creatorCalendarItems)
    .where(
      and(
        gte(creatorCalendarItems.startAt, from),
        lte(creatorCalendarItems.startAt, to),
        inArray(creatorCalendarItems.planningStatus, ['confirmed', 'tentative']),
      ),
    )
    .orderBy(creatorCalendarItems.startAt)
    .limit(24);

  return rows.map((row) => ({
    id: row.id,
    contentItemId: row.sourceRecordType === 'content_item' ? row.sourceRecordId : null,
    title: row.title,
    startAt: row.startAt.toISOString(),
    location: row.location,
    planningStatus: row.planningStatus,
    selected: row.planningStatus === 'confirmed',
    sourceUrl: row.sourceUrl,
  }));
}

async function loadTodayWatchlistRows(now: Date): Promise<TodayWatchlistRow[]> {
  try {
    const activity = await listWatchlistActivity(12);
    const today = dateOnlyInZone(now);
    const horizon = dateOnlyInZone(addDays(now, LOOKAHEAD_DAYS));
    return activity.findings
      .map((finding) => ({
        id: finding.id,
        title: finding.title,
        summary: finding.summary,
        sourceUrl: finding.sourceUrl,
        eventDate: finding.eventDate,
        type: finding.type,
        currentlyActionable: finding.currentlyActionable,
        confidence: finding.confidence,
        dateStatus: finding.dateStatus,
        baselineKind: finding.baselineKind,
        evidence: finding.evidence,
        watchedSource: finding.watchedSource,
      }))
      .filter((row) => isTimeSensitiveWatchlist(row, today, horizon));
  } catch {
    return [];
  }
}

function inventoryFromLoaded(
  items: Awaited<ReturnType<typeof loadInventoryItemsByIds>>,
): Map<string, TodayInventoryRecord> {
  return new Map(
    items.map((item) => [
      item.id,
      {
        id: item.id,
        title: item.title,
        sourceName: item.sourceName,
        venue: item.venue,
        locationName: item.locationName,
        sourceUrl: item.sourceUrl,
        summary: item.summary,
        eventDate: item.eventDate,
        eventEndDate: item.eventEndDate,
        category: item.category,
        metadata: item.metadata,
        businessName: item.businessName,
      },
    ]),
  );
}

export async function loadTodayExecutionWorkspace(options?: {
  now?: Date;
  demoMode?: boolean;
}): Promise<TodayEditorResponse> {
  const now = options?.now ?? new Date();
  const plannerMap = await loadAllPlannerItems();
  const planner = [...plannerMap.values()];
  const [research, calendar, watchlist, partnerships] = await Promise.all([
    loadTodayResearchRows(),
    loadTodayCalendarRows(now).catch(() => [] as TodayCalendarRow[]),
    loadTodayWatchlistRows(now),
    loadPartnershipDecisions(now).catch(() => [] as PartnershipDecision[]),
  ]);

  const ids = [
    ...planner.map((row) => row.contentItemId),
    ...research.map((row) => row.contentItemId),
    ...calendar.map((row) => row.contentItemId).filter((id): id is string => Boolean(id)),
  ];
  const inventory = inventoryFromLoaded(await loadInventoryItemsByIds(ids));
  const execution = computeTodayExecution({
    now,
    planner,
    inventory,
    research,
    calendar,
    watchlist,
    partnerships,
  });

  return {
    demoMode: options?.demoMode ?? false,
    generatedAt: execution.generatedAt,
    execution,
  };
}

export type TodayReviewAction = 'dismiss' | 'add_to_today' | 'add_to_calendar' | 'reviewed';

export async function decideTodayReview(
  contentItemId: string,
  action: TodayReviewAction,
): Promise<{ ok: true; action: TodayReviewAction }> {
  const now = new Date();
  const [interest] = await db
    .select()
    .from(creatorInterestRecords)
    .where(eq(creatorInterestRecords.contentItemId, contentItemId))
    .orderBy(desc(creatorInterestRecords.updatedAt))
    .limit(1);

  if (action === 'add_to_today') {
    await upsertPlannerItem(contentItemId, { action: 'plan_today' });
  }

  if (action === 'add_to_calendar') {
    const [item] = await db
      .select({
        topic: contentItems.topic,
        sourceUrl: contentItems.sourceUrl,
        locationName: contentItems.locationName,
        eventStartsAt: contentItems.eventStartsAt,
        metadata: contentItems.metadata,
      })
      .from(contentItems)
      .where(eq(contentItems.id, contentItemId))
      .limit(1);
    const display = resolveDisplayTitleFromRecord({
      rawTitle: item?.topic ?? 'Calendar item',
      sourceUrl: item?.sourceUrl,
      venueName: item?.locationName,
      metadata: (item?.metadata ?? {}) as Record<string, unknown>,
    });
    const startAt = item?.eventStartsAt ?? addDays(now, 1);
    await createCalendarItem({
      title: display.displayTitle,
      itemType: 'public_event',
      sourceRecordType: 'content_item',
      sourceRecordId: contentItemId,
      sourceUrl: item?.sourceUrl ?? undefined,
      internalDetailUrl: `/discoveries/${contentItemId}`,
      startAt,
      allDay: true,
      location: item?.locationName ?? undefined,
      planningStatus: 'tentative',
    });
  }

  if (interest) {
    const metadata = {
      ...((interest.metadata ?? {}) as Record<string, unknown>),
      todayReview: {
        decision: action,
        reviewedAt: now.toISOString(),
        dismissedAt: action === 'dismiss' ? now.toISOString() : undefined,
      },
    };
    await db
      .update(creatorInterestRecords)
      .set({
        metadata,
        nextAction: action === 'dismiss' ? 'Reviewed and dismissed from Today.' : 'Reviewed from Today.',
        updatedAt: now,
      })
      .where(eq(creatorInterestRecords.id, interest.id));
  }

  return { ok: true, action };
}

export { plannerDateOnly };
