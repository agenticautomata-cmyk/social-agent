import type { EditorialUrgency } from './types.js';

function daysBetween(a: Date, b: Date): number {
  return (a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

/**
 * Recent openings remain actionable after opening day.
 * Do not mark expired merely because doors are already open.
 */
export function calculateEditorialUrgency(input: {
  openingOrAnnouncementDate: string | null;
  publicationDate: string | null;
  developmentType: string;
  now?: Date;
}): EditorialUrgency {
  const now = input.now ?? new Date();
  const dateRaw = input.openingOrAnnouncementDate ?? input.publicationDate;
  if (!dateRaw) return 'needs_research';

  const parsed = Date.parse(dateRaw);
  if (Number.isNaN(parsed)) return 'needs_research';

  const when = new Date(parsed);
  const daysAgo = daysBetween(now, when);
  const isOpening =
    /opening|first_to_market|coming_soon|launch|grand_opening|soft_opening|reopening/i.test(
      input.developmentType,
    );

  if (daysAgo < -14) return 'needs_research'; // far future without enough signal
  if (daysAgo < 0) return 'urgent'; // upcoming
  if (isOpening && daysAgo <= 21) return 'timely';
  if (isOpening && daysAgo <= 60) return 'evergreen';
  if (daysAgo <= 14) return 'timely';
  if (daysAgo <= 90) return 'evergreen';
  if (daysAgo <= 180) return 'stale';
  return 'closed';
}
