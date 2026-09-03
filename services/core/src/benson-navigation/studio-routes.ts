export type StudioRoute = {
  href: string;
  label: string;
  section: string;
  description: string;
  keywords: string[];
};

/** Canonical Benson studio routes — keep in sync with dashboard nav. */
export const STUDIO_ROUTES: StudioRoute[] = [
  { href: '/home', label: 'Home', section: 'Daily', description: 'Dashboard priorities and quick links', keywords: ['home', 'dashboard', 'start'] },
  { href: '/editor', label: 'Today', section: 'Daily', description: 'Daily briefing and post picks', keywords: ['today', 'editor', 'daily briefing', 'command center'] },
  { href: '/actions', label: 'Actions', section: 'Daily', description: 'To-do list — follow-ups, pitch emails, approvals, one-click tasks', keywords: ['actions', 'to do', 'todo', 'to-do', 'task list', 'notification center'] },
  { href: '/planner', label: 'Plan', section: 'Daily', description: 'Weekly content plan and shortlist', keywords: ['planner', 'plan', 'week', 'shortlist', 'schedule content'] },
  { href: '/outreach/compose', label: 'Compose outreach', section: 'Email', description: 'Write or finish a sponsor pitch email draft', keywords: ['compose', 'pitch email', 'draft pitch', 'write email', 'outreach compose', 'finish pitch'] },
  { href: '/email/approvals', label: 'Email approvals', section: 'Email', description: 'Review and approve Benson-drafted pitches before send', keywords: ['approve', 'approval', 'pitch approval', 'review pitch', 'needs approval'] },
  { href: '/email/inbox', label: 'Email inbox', section: 'Email', description: 'Sponsor replies and Gmail inbox', keywords: ['inbox', 'reply', 'replies', 'sponsor email'] },
  { href: '/email', label: 'Email hub', section: 'Email', description: 'Email overview — compose, approvals, inbox', keywords: ['email hub', 'email home'] },
  { href: '/outreach/history', label: 'Outreach history', section: 'Email', description: 'Sent and scheduled outreach log', keywords: ['outreach history', 'sent email'] },
  { href: '/sponsor-intelligence', label: 'Sponsor intel', section: 'Sponsors', description: 'Who to pitch first — ranked sponsor candidates', keywords: ['sponsor intel', 'who to pitch', 'pitch first', 'sponsor candidates'] },
  { href: '/sponsors', label: 'Sponsors CRM', section: 'Sponsors', description: 'Sponsor contacts, notes, and CRM', keywords: ['sponsors', 'crm', 'contacts'] },
  { href: '/pipeline', label: 'Pipeline', section: 'Sponsors', description: 'Deal stages and sponsor pipeline', keywords: ['pipeline', 'deals', 'stages'] },
  { href: '/media-kits', label: 'Media kits', section: 'My Info', description: 'Upload and manage media kits for pitches', keywords: ['media kit', 'media kits', 'rate card'] },
  { href: '/creator-assets', label: 'Creator Assets', section: 'My Info', description: 'Photos for media kits — preview and approve public use', keywords: ['creator assets', 'photos', 'headshot', 'media kit photos', 'public use'] },
  { href: '/review/inventory', label: 'Inventory', section: 'Content', description: 'Review KC opportunities and editorial picks', keywords: ['inventory', 'opportunities review', 'editorial'] },
  { href: '/opportunities', label: 'Opportunities', section: 'Content', description: 'Browse scored KC content opportunities', keywords: ['opportunities', 'kc events', 'content ideas'] },
  { href: '/opportunities/map', label: 'Opportunity Map', section: 'Content', description: 'Map of upcoming KC opportunities by location', keywords: ['map', 'opportunity map', 'nearby', 'locations', 'filming'] },
  { href: '/intake', label: 'Share intake', section: 'Content', description: 'Review items shared into Benson', keywords: ['intake', 'shared', 'share intake'] },
  { href: '/drafts', label: 'Drafts', section: 'Daily', description: 'Unposted videos Benson has watched', keywords: ['draft', 'unposted', 'tiktok draft', 'private draft', 'video'] },
  { href: '/analytics/tiktok', label: 'TikTok analytics', section: 'Grow', description: 'TikTok performance, sync, and settings', keywords: ['tiktok analytics', 'views', 'metrics', 'analytics'] },
  { href: '/analytics/tiktok/operator', label: 'TikTok operator', section: 'Grow', description: 'Video-level TikTok recommendations', keywords: ['operator', 'tiktok operator'] },
  { href: '/playbook/coach', label: 'TikTok Coach', section: 'Grow', description: 'Hooks, captions, scripts, and posting strategy', keywords: ['tiktok coach', 'playbook', 'hooks', 'captions'] },
  { href: '/equipment/ask', label: 'Gear Coach', section: 'My Info', description: 'Camera, mic, and filming setup help', keywords: ['gear', 'equipment', 'osmo', 'mic', 'iphone setup'] },
  { href: '/ask-benson', label: 'Ask Benson', section: 'Benson', description: 'Chat with Benson', keywords: ['ask benson', 'chat'] },
  { href: '/strategist', label: 'Strategist', section: 'Benson', description: 'Weekly strategy briefing', keywords: ['strategist', 'weekly briefing'] },
  { href: '/benson', label: 'Briefing hub', section: 'Benson', description: 'Cross-system executive summary', keywords: ['benson hub', 'briefing hub'] },
  { href: '/website', label: 'Website', section: 'More', description: 'kckellie.com drafts and media', keywords: ['website', 'kckellie'] },
  { href: '/revenue', label: 'Revenue', section: 'Grow', description: 'Business health and forecast', keywords: ['revenue', 'forecast'] },
  { href: '/settings/notifications', label: 'Notifications', section: 'Admin', description: 'Push notification preferences', keywords: ['notifications', 'push settings'] },
];

export function studioRoutesForPrompt(): Array<Pick<StudioRoute, 'href' | 'label' | 'section' | 'description'>> {
  return STUDIO_ROUTES.map(({ href, label, section, description }) => ({
    href,
    label,
    section,
    description,
  }));
}
