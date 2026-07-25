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
  id: '2026-07-07-fresh-picks-pitch-sync',
  title: 'Refresh for the latest Benson',
  summary:
    'A new update is live — refresh the app (or force-quit and reopen) to pick up fresher top picks, smarter sponsor pitches, and TikTok sync fixes.',
  highlights: [
    'Stale KC Sipps roundups no longer dominate Start here — fresher content ranks first',
    'Start pitch uses Benson AI drafts with contact lookup → Email approvals',
    'TikTok auto-sync reports accurately + tokens refresh before they expire',
  ],
  primaryHref: '/home',
  primaryLabel: 'Go to Home',
  secondaryHref: '/analytics/tiktok',
  secondaryLabel: 'TikTok sync',
};

export function pushPayloadForUpdate(update: StudioUpdateAnnouncement) {
  return {
    topic: 'top_picks' as const,
    title: 'Benson · Update ready',
    body: 'Refresh Benson for fresher picks, better sponsor pitches & TikTok sync fixes.',
    url: update.primaryHref,
  };
}
