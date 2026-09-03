/** My Info drawer items — shared so tests can assert without importing server-only modules. */

export const MY_INFO_NAV_ITEMS = [
  { href: '/my-info', label: 'Contact & routing' },
  { href: '/creator-assets', label: 'Creator Assets' },
  { href: '/media-kits', label: 'Media Kit Library' },
  { href: '/equipment', label: 'Gear Coach' },
  { href: '/email/settings', label: 'Email & Gmail' },
] as const;
