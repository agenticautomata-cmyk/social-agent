'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/website', label: 'Overview' },
  { href: '/website/media', label: 'Media' },
  { href: '/website/drafts', label: 'Drafts' },
  { href: '/website/settings', label: 'Settings' },
];

export function WebsiteNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2 mb-6">
      {LINKS.map((link) => {
        const active =
          link.href === '/website'
            ? pathname === '/website'
            : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              active
                ? 'bg-neutral-900 text-white'
                : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
