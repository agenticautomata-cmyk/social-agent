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
  id: '2026-07-05-gear-coach-tiktok-playbook',
  title: "What's new in Benson",
  summary: 'Two new coaches for filming and posting — both live now.',
  highlights: [
    'Gear Coach — iPhone 17 Pro, TikTok, Studio, CapCut & Blackmagic guides with setup checklists',
    'TikTok Creator Playbook — hooks, captions, Search, Studio metrics, sponsor angles & scripts',
    'Official TikTok + Apple sources ingested — Benson cites docs first, then your analytics',
  ],
  primaryHref: '/playbook/coach',
  primaryLabel: 'Open TikTok Coach',
  secondaryHref: '/equipment/ask',
  secondaryLabel: 'Gear Coach',
};

export function pushPayloadForUpdate(update: StudioUpdateAnnouncement) {
  return {
    topic: 'top_picks' as const,
    title: "Benson · What's new",
    body: 'Gear Coach + TikTok Creator Playbook are live — hooks, captions, iPhone setup & more.',
    url: update.primaryHref,
  };
}
