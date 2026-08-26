/**
 * Human-facing Calendar status + primary CTA labels.
 * Translates internal sync/planning state — never leave "Benson only" as the only cue.
 */

import { validViewSourceUrl } from '../inventory/today-clarity.js';
import { calendarVerificationDisplay } from './population/eligibility.js';
import type { CalendarItemView, CalendarPlanningStatus, CalendarSyncStatus } from './types.js';

export type CalendarPrimaryActionKind =
  | 'confirm_plan'
  | 'add_to_google'
  | 'update_google'
  | 'add_weekend_list'
  | 'add_things_to_do'
  | 'details';

export type CalendarActionContract = {
  statusHeadline: string;
  statusDetail: string | null;
  primaryKind: CalendarPrimaryActionKind;
  primaryLabel: string;
  calendarReady: boolean;
  viewSourceUrl: string | null;
  contentItemId: string | null;
  detailsHref: string | null;
  reviewVerifyHref: string | null;
  ticketUrl: string | null;
  organizerUrl: string | null;
};

function syncStatus(item: CalendarItemView): CalendarSyncStatus | null {
  return item.sync?.syncStatus ?? null;
}

function isSelected(item: CalendarItemView): boolean {
  return item.selected === true || item.planningStatus === 'confirmed';
}

export function humanCalendarStatus(item: CalendarItemView): { headline: string; detail: string | null } {
  const sync = syncStatus(item);
  const planned =
    item.planningStatus === 'confirmed' || item.planningStatus === 'tentative';
  const verification = calendarVerificationDisplay(item.verificationState);
  const verificationLabel = verification === 'verified' ? 'Verified' : 'Needs verification';

  if (sync === 'synced') {
    return { headline: "On Kellie's Google Calendar", detail: 'Synced' };
  }
  if (sync === 'update_available') {
    return { headline: 'Selected', detail: 'Google needs an update' };
  }
  if (sync === 'ready_to_export' && item.planningStatus === 'confirmed') {
    return { headline: 'Selected', detail: 'Ready to add to Google Calendar' };
  }
  if (isSelected(item)) {
    return { headline: 'Selected', detail: verificationLabel };
  }
  if (item.planningStatus === 'suggested') {
    return {
      headline: `Benson suggestion · ${verificationLabel}`,
      detail: null,
    };
  }
  if (planned && (sync === 'benson_only' || !item.sync?.googleEventId)) {
    return {
      headline: 'Selected',
      detail: "On Benson's calendar — not exported to Google yet",
    };
  }
  if (item.planningStatus === 'confirmed') {
    return { headline: 'Selected', detail: "Added to Kellie's calendar" };
  }
  return {
    headline: item.planningStatus.replace(/_/g, ' '),
    detail: sync === 'benson_only' ? 'Internal Benson plan' : null,
  };
}

export function isCalendarSuggestionReady(item: CalendarItemView): boolean {
  return Boolean(item.startAt);
}

export function resolveCalendarActionContract(item: CalendarItemView): CalendarActionContract {
  const { headline, detail } = humanCalendarStatus(item);
  const viewSourceUrl = validViewSourceUrl(item.sourceUrl);
  const contentItemId =
    item.sourceRecordType === 'content_item' && item.sourceRecordId ? item.sourceRecordId : null;
  const detailsHref =
    item.internalDetailUrl ??
    (contentItemId ? `/discoveries/${contentItemId}` : null);
  const ready = isCalendarSuggestionReady(item);
  const sync = syncStatus(item);
  const selected = isSelected(item);
  const verification = calendarVerificationDisplay(item.verificationState);

  let primaryKind: CalendarPrimaryActionKind = 'details';
  let primaryLabel = 'Details';

  if (sync === 'update_available') {
    primaryKind = 'update_google';
    primaryLabel = 'Update Google';
  } else if (
    item.planningStatus === 'confirmed' &&
    (sync === 'ready_to_export' || sync === 'benson_only' || sync === 'removed_from_google' || !item.sync?.googleEventId)
  ) {
    primaryKind = 'add_to_google';
    primaryLabel = 'Add to calendar';
  } else if (!selected && (item.planningStatus === 'suggested' || item.planningStatus === 'tentative')) {
    if (item.fallsInWeekend) {
      primaryKind = 'add_weekend_list';
      primaryLabel = 'Add to weekend list';
    } else if (ready) {
      primaryKind = 'confirm_plan';
      primaryLabel = 'Select / Plan';
    } else {
      primaryKind = 'details';
      primaryLabel = 'Details';
    }
  } else if (contentItemId && item.itemType === 'public_event' && !selected) {
    primaryKind = 'add_weekend_list';
    primaryLabel = 'Add to weekend list';
  }

  return {
    statusHeadline: headline,
    statusDetail: detail,
    primaryKind,
    primaryLabel,
    calendarReady: ready,
    viewSourceUrl,
    contentItemId,
    detailsHref,
    reviewVerifyHref: verification === 'needs_verification' ? detailsHref : null,
    ticketUrl: item.ticketUrl,
    organizerUrl: item.organizerUrl,
  };
}

export function planningStatusIsActive(status: CalendarPlanningStatus): boolean {
  return !['dismissed', 'cancelled', 'expired', 'completed', 'missed'].includes(status);
}
