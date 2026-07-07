'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  isNavActive,
  MOBILE_DRAWER_PINNED,
  MOBILE_TAB_HREFS,
  type NavGroup,
  type NavItem,
} from '../lib/nav-config';

const MOBILE_TAB_LABELS: Record<string, string> = {
  '/home': 'Home',
  '/editor': 'Today',
  '/website': 'Website',
  '/analytics/tiktok': 'TikTok',
  '/planner': 'Plan',
  '/sponsors': 'Sponsors',
  '/ask-benson': 'Ask',
};

function SidebarLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isNavActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      className={`studio-nav-link ${active ? 'studio-nav-link-active' : ''}`}
    >
      {item.label}
    </Link>
  );
}

export function StudioSidebar({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();

  return (
    <aside className="studio-sidebar hidden lg:flex lg:flex-col lg:w-56 xl:w-60 shrink-0">
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {groups.map((group) => (
          <div key={group.id}>
            <p className="studio-nav-group-label">{group.label}</p>
            <ul className="mt-1.5 space-y-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <SidebarLink item={item} pathname={pathname} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}

export function StudioMobileNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Never lock document.body with position:fixed — it breaks iOS PWA scrolling and can stick after close.
  useEffect(() => {
    return () => {
      const { style } = document.body;
      style.position = '';
      style.top = '';
      style.left = '';
      style.right = '';
      style.overflow = '';
    };
  }, []);

  const tabItems = MOBILE_TAB_HREFS.map((href) => {
    const found = groups.flatMap((g) => g.items).find((item) => item.href === href);
    return found ?? { href, label: MOBILE_TAB_LABELS[href] ?? href };
  });

  return (
    <>
      {menuOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="studio-mobile-drawer-backdrop lg:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <div
        className={`studio-mobile-drawer lg:hidden ${menuOpen ? 'studio-mobile-drawer-open' : ''}`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
          <span className="text-sm font-semibold">Menu</span>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            className="btn-ghost min-h-[40px] min-w-[40px] px-2"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="studio-mobile-drawer-scroll">
          <div className="border-b border-white/10 p-4">
            <p className="studio-nav-group-label">Quick access</p>
            <ul className="mt-2 grid grid-cols-2 gap-1.5">
              {MOBILE_DRAWER_PINNED.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={`studio-nav-link text-sm ${isNavActive(pathname, item.href) ? 'studio-nav-link-active' : ''}`}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <nav className="space-y-6 p-4">
            {groups.map((group) => (
              <div key={group.id}>
                <p className="studio-nav-group-label">{group.label}</p>
                <ul className="mt-2 grid grid-cols-2 gap-1.5">
                  {group.items.map((item) => (
                    <li key={item.href} className="col-span-1">
                      <Link
                        href={item.href}
                        onClick={() => setMenuOpen(false)}
                        className={`studio-nav-link text-sm ${isNavActive(pathname, item.href) ? 'studio-nav-link-active' : ''}`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      </div>

      <nav className="studio-mobile-tabs lg:hidden" aria-label="Primary">
        {tabItems.slice(0, 4).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`studio-mobile-tab ${isNavActive(pathname, item.href) ? 'studio-mobile-tab-active' : ''}`}
          >
            {item.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className={`studio-mobile-tab ${menuOpen ? 'studio-mobile-tab-active' : ''}`}
          aria-expanded={menuOpen}
        >
          More
        </button>
      </nav>
    </>
  );
}

/** Legacy horizontal nav for non-Benson mode. */
export function LegacyTopNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="hidden md:flex flex-wrap gap-1.5 text-sm justify-end">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={isNavActive(pathname, item.href) ? 'nav-pill nav-pill-active' : 'nav-pill'}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
