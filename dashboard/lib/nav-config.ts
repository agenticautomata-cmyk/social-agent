/** Client-safe nav types and helpers (groups are built server-side in opportunities-ui). */

export type NavItem = { href: string; label: string };

export type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

export const MOBILE_TAB_HREFS = [
  '/home',
  '/editor',
  '/discoveries',
  '/email/approvals',
] as const;

/** Shown at the top of the mobile More drawer for quick access. */
export const MOBILE_DRAWER_PINNED: NavItem[] = [
  { href: '/shoot', label: 'Shoot mode' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/ask-benson', label: 'Ask Benson' },
  { href: '/creator-assets', label: 'Creator Assets' },
  { href: '/strategist', label: 'Strategist' },
];

export function isNavActive(pathname: string, href: string): boolean {
  if (href === '/home') return pathname === '/home' || pathname === '/';
  if (href === '/discoveries') {
    return pathname === '/discoveries' || pathname.startsWith('/discoveries/');
  }
  if (href === '/email/approvals') {
    return pathname === '/email/approvals' || pathname.startsWith('/email/approvals');
  }
  if (href === '/analytics') return pathname === '/analytics';
  if (href === '/analytics/all') return pathname === '/analytics/all';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function findActiveGroup(groups: NavGroup[], pathname: string): NavGroup | undefined {
  return groups.find((group) => group.items.some((item) => isNavActive(pathname, item.href)));
}
