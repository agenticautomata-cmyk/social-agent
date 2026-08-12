/**
 * Human-facing Calendar status + primary CTA labels.
 * Translates internal sync/planning state — never leave "Benson only" as the only cue.
 */

import { validViewSourceUrl } from '../inventory/today-clarity.js';
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
};

function syncStatus(item: CalendarItemView): CalendarSyncStatus | null {
  return item.sync?.syncStatus ?? null;
}

export function humanCalendarStatus(item: CalendarItemView): { headline: string; detail: string | null } {
  const sync = syncStatus(item);
  const planned =
    item.planningStatus === 'confirmed' || item.planningStatus === 'tentative';

  if (sync === 'synced') {
    return { headline: "On Kellie's Google Calendar", detail: 'Synced' };
  }
  if (sync === 'update_available') {
    return { headline: 'Planned', detail: 'Google needs an update' };
  }
  if (sync === 'ready_to_export' && item.planningStatus === 'confirmed') {
    return { headline: 'Planned', detail: 'Ready to add to Google Calendar' };
  }
  if (item.planningStatus === 'suggested') {
    return {
      headline: 'Suggested by Benson',
      detail: 'Not on your calendar yet',
    };
  }
  if (planned && (sync === 'benson_only' || !item.sync?.googleEventId)) {
    return {
      headline: 'Planned',
      detail: "On Benson's calendar — not exported to Google yet",
    };
  }
  if (item.planningStatus === 'confirmed') {
    return { headline: 'Planned', detail: "Added to Kellie's calendar" };
  }
  return {
    headline: item.planningStatus.replace(/_/g, ' '),
    detail: sync === 'benson_only' ? 'Internal Benson plan' : null,
  };
}

export function isCalendarSuggestionReady(item: CalendarItemView): boolean {
  const hasSource = Boolean(validViewSourceUrl(item.sourceUrl));
  const hasWhen = Boolean(item.startAt);
  if (item.itemType === 'public_event') {
    return hasSource && hasWhen;
  }
  return hasWhen;
}

export function resolveCalendarActionContract(item: CalendarItemView): CalendarActionContract {
  const { headline, detail } = humanCalendarStatus(item);
  const viewSourceUrl = validViewSourceUrl(item.sourceUrl);
  const contentItemId =
    item.sourceRecordType === 'content_item' && item.sourceRecordId ? item.sourceRecordId : null;
  const detailsHref =
    item.internalDetailUrl ??
    (contentItemId ? `/review/inventory?id=${contentItemId}` : null);
  const ready = isCalendarSuggestionReady(item);
  const sync = syncStatus(item);

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
  } else if (item.planningStatus === 'suggested' || item.planningStatus === 'tentative') {
    if (ready) {
      primaryKind = 'confirm_plan';
      primaryLabel = 'Confirm plan';
    } else {
      primaryKind = 'details';
      primaryLabel = 'Details';
    }
  } else if (contentItemId && item.itemType === 'public_event') {
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
  };
}

export function planningStatusIsActive(status: CalendarPlanningStatus): boolean {
  return !['dismissed', 'cancelled', 'expired', 'completed', 'missed'].includes(status);
}
