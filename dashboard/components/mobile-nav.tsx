'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

export type NavItem = { href: string; label: string };

const PRIMARY_HREFS = new Set(['/', '/editor', '/actions', '/planner', '/revenue']);

export function MobileNav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const primary = items.filter((n) => PRIMARY_HREFS.has(n.href));
  const more = items.filter((n) => !PRIMARY_HREFS.has(n.href));

  return (
    <div className="md:hidden w-full">
      <div className="flex items-center justify-between gap-2 py-2">
        <div className="flex flex-wrap gap-2 text-sm">
          {primary.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`min-h-[44px] inline-flex items-center px-2 ${
                pathname === n.href || (n.href !== '/' && pathname.startsWith(n.href))
                  ? 'text-paper-ink font-bold'
                  : 'text-paper-muted'
              }`}
            >
              [{n.label}]
            </Link>
          ))}
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-label="More navigation"
          onClick={() => setOpen((v) => !v)}
          className="min-h-[44px] min-w-[44px] border border-paper-edge px-3 text-sm"
        >
          {open ? '×' : 'more'}
        </button>
      </div>
      {open && (
        <nav className="border-t border-paper-edge py-3 grid grid-cols-2 gap-2 text-sm max-h-[50vh] overflow-y-auto">
          {more.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className="min-h-[44px] flex items-center px-2 text-paper-muted hover:text-paper-ink"
            >
              [{n.label}]
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

export function DesktopNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="hidden md:flex flex-wrap gap-4 lg:gap-6 text-sm justify-end">
      {items.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          className={`hover:text-paper-ink transition ${
            pathname === n.href || (n.href !== '/' && pathname.startsWith(n.href))
              ? 'text-paper-ink font-bold'
              : 'text-paper-muted'
          }`}
        >
          [{n.label}]
        </Link>
      ))}
    </nav>
  );
}
