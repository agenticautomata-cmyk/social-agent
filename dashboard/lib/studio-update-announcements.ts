export type StudioUpdateAnnouncement = {
  id: string;
  title: string;
  summary: string;
  highlights: string[];
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
};

export const STUDIO_UPDATE_DISMISS_KEY = 'benson-studio-update-dismissed';

/** Bump `id` when shipping a new in-app + push announcement. */
export const CURRENT_STUDIO_UPDATE: StudioUpdateAnnouncement = {
  id: '2026-07-29-new-in-the-booth',
  title: 'New in the Booth',
  summary:
    'Benson just got sharper — pull to refresh (or force-quit and reopen) to pick up action confirmations, smarter skips, and live pitches.',
  highlights: [
    'Every tap now tells you what happens next — interested, skip, vote, approve',
    'Skip once, stay skipped — duplicate concerts from other sources stay gone',
    'Discoveries votes feed Benson learning; Pitches and Calendar are front and center',
  ],
  primaryHref: '/discoveries',
  primaryLabel: 'Try Discoveries',
  secondaryHref: '/email/approvals',
  secondaryLabel: 'Open Pitches',
};

export function pushPayloadForUpdate(update: StudioUpdateAnnouncement) {
  return {
    topic: 'top_picks' as const,
    title: 'Benson · New in the Booth',
    body: 'Confirmations on every action, smarter skips, and live pitches — refresh to load it.',
    url: update.primaryHref,
  };
}
