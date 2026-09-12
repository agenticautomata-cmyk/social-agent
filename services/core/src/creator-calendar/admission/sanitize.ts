import type { CalendarAdmissionCandidate, CalendarDisplayFields } from '../types.js';

const ISO_DUMP_RE = /\b20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\b/g;
const SCAFFOLD_RE =
  /(?:^|\n)\s*(?:Venue|Starts?|Ends?|Location|Address|When|Where|Date|Time)\s*:\s*/gi;
const JSONISH_RE = /^\s*[{\[][\s\S]*[}\]]\s*$/;
const DUPLICATE_TAIL_RE = /\s*[·|]\s*(?:kansas\s+city(?:\s*,?\s*mo)?)\s*$/i;

/**
 * Clean display fields separate from evidence. Prefer empty description over raw metadata.
 */
export function sanitizeCalendarDisplay(c: CalendarAdmissionCandidate): {
  display: CalendarDisplayFields;
  machineTextLeak: boolean;
  leakReasons: string[];
} {
  const leakReasons: string[] = [];
  let title = (c.title ?? '').trim().replace(/\s+/g, ' ');
  let description = (c.description ?? c.summary ?? '')?.trim() || null;
  let location =
    (c.venue ?? '').trim() ||
    (c.formattedAddress ?? '').trim() ||
    (c.locationName ?? '').trim() ||
    (c.neighborhood ?? '').trim() ||
    null;

  if (ISO_DUMP_RE.test(title)) {
    leakReasons.push('iso_in_title');
    title = title.replace(ISO_DUMP_RE, '').replace(/\s+/g, ' ').trim();
  }
  if (description && ISO_DUMP_RE.test(description)) {
    leakReasons.push('iso_in_description');
    description = description.replace(ISO_DUMP_RE, '').replace(/\s+/g, ' ').trim() || null;
  }
  if (description && SCAFFOLD_RE.test(description)) {
    leakReasons.push('scaffold_labels');
    description = description.replace(SCAFFOLD_RE, ' ').replace(/\s+/g, ' ').trim() || null;
  }
  if (description && /Starts?:\s*20\d{2}-/i.test(description)) {
    leakReasons.push('starts_iso_scaffold');
    description = null;
  }
  if (description && JSONISH_RE.test(description)) {
    leakReasons.push('json_description');
    description = null;
  }
  if (description && /utm_source=openai|parserDiagnostic|rawPayload/i.test(description)) {
    leakReasons.push('parser_diagnostic');
    description = null;
  }

  // Lowercase placeholder city alone is not a display location.
  if (location && /^kansas city$/i.test(location.trim()) && !(c.venue ?? '').trim()) {
    leakReasons.push('lowercase_placeholder_city');
    location = null;
  }

  if (location) {
    location = location.replace(DUPLICATE_TAIL_RE, '').trim() || location;
  }

  // Drop description that merely restates title/date/venue scaffolding.
  if (description) {
    const norm = description.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const titleNorm = title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (norm === titleNorm || norm.length < 8) {
      description = null;
    }
  }

  const machineTextLeak = leakReasons.length > 0 && (!title || leakReasons.includes('starts_iso_scaffold'));
  return {
    display: { title: title || (c.title ?? '').trim(), description, location },
    machineTextLeak: leakReasons.includes('starts_iso_scaffold') || leakReasons.includes('json_description'),
    leakReasons,
  };
}

/** True when a description/title still contains render-blocking machine text. */
export function hasMachineTextLeak(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  if (/\bStarts?:\s*20\d{2}-\d{2}-\d{2}T/i.test(text)) return true;
  if (ISO_DUMP_RE.test(text) && /Starts?:|Venue:|rawPayload/i.test(text)) return true;
  return false;
}
