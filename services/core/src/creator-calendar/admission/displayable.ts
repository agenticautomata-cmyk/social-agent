import { CALENDAR_ADMISSION_RULE_VERSION } from './types.js';
import { readAdmissionFromMetadata } from './evaluate.js';
import { hasMachineTextLeak } from './sanitize.js';
import { isOutOfMarketLocation, isKcMetroLocation } from '../../ask-benson/url-geo.js';

/**
 * Read-time safeguard: refuse to render non-accepted / obsolete / corrupt suggestions.
 * Not a substitute for write-time admission.
 */
export function calendarAdmissionAllowsDisplay(item: {
  planningStatus?: string | null;
  title: string;
  location?: string | null;
  sourceUrl?: string | null;
  description?: string | null;
  metadata?: unknown;
}): boolean {
  // Non-suggestions (confirmed/tentative/user) still get corruption guards only.
  const isSuggestion = item.planningStatus === 'suggested' || item.planningStatus == null;

  const admission = readAdmissionFromMetadata(item.metadata);
  if (isSuggestion) {
    if (!admission) {
      // Legacy rows without admission must not render as suggestions.
      return false;
    }
    if (admission.ruleVersion !== CALENDAR_ADMISSION_RULE_VERSION) {
      return false;
    }
    if (admission.lifecycle !== 'accepted' || admission.calendarStatus !== 'accepted') {
      return false;
    }
  }

  if (hasMachineTextLeak(item.description) || hasMachineTextLeak(item.title)) {
    return false;
  }

  const loc = (item.location ?? '').trim();
  if (loc && isOutOfMarketLocation(loc) && !isKcMetroLocation(loc)) return false;
  if (isOutOfMarketLocation(item.title) && !isKcMetroLocation(item.title) && !isKcMetroLocation(loc)) {
    return false;
  }

  if (isSuggestion && admission) {
    const ev = admission.evidence ?? {};
    const hasPlace =
      Boolean(ev.venue?.trim()) ||
      Boolean(ev.formattedAddress?.trim()) ||
      Boolean(loc) ||
      Boolean(ev.locationName?.trim());
    const hasDate = Boolean(ev.eventDate?.trim());
    if (!hasPlace || !hasDate) return false;
  }

  return true;
}
