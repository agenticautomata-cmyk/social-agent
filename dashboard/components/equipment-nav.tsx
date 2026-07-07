'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/equipment', label: 'Overview' },
  { href: '/equipment/manuals', label: 'Manuals' },
  { href: '/equipment/reference-videos', label: 'Reference videos' },
  { href: '/equipment/ask', label: 'Ask Benson' },
  { href: '/equipment/checklists', label: 'Checklists' },
  { href: '/equipment/shoot-setup', label: 'Shoot setup' },
];

export function EquipmentNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex flex-wrap gap-2">
      {LINKS.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              active
                ? 'bg-neutral-900 text-white'
                : 'border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
