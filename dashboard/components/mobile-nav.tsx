'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

export type NavItem = { href: string; label: string };

const PRIMARY_HREFS = new Set(['/home', '/editor', '/actions', '/opportunities/map', '/revenue']);

function isActive(pathname: string, href: string): boolean {
  if (href === '/home') return pathname === '/home' || pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function navClass(pathname: string, href: string): string {
  return isActive(pathname, href) ? 'nav-pill nav-pill-active' : 'nav-pill';
}

export function MobileNav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const primary = items.filter((n) => PRIMARY_HREFS.has(n.href));
  const more = items.filter((n) => !PRIMARY_HREFS.has(n.href));

  return (
    <div className="md:hidden w-full">
      <div className="flex items-center justify-between gap-2 py-2">
        <div className="flex flex-wrap gap-1.5 text-sm">
          {primary.map((n) => (
            <Link key={n.href} href={n.href} className={navClass(pathname, n.href)}>
              {n.label}
            </Link>
          ))}
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-label="More navigation"
          onClick={() => setOpen((v) => !v)}
          className="btn-ghost min-h-[44px] min-w-[44px] px-3 text-sm"
        >
          {open ? '×' : 'More'}
        </button>
      </div>
      {open && (
        <nav className="glass-panel mt-2 p-3 grid grid-cols-2 gap-2 text-sm max-h-[50vh] overflow-y-auto">
          {more.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className={navClass(pathname, n.href)}
            >
              {n.label}
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
    <nav className="hidden md:flex flex-wrap gap-1.5 lg:gap-2 text-sm justify-end">
      {items.map((n) => (
        <Link key={n.href} href={n.href} className={navClass(pathname, n.href)}>
          {n.label}
        </Link>
      ))}
    </nav>
  );
}
