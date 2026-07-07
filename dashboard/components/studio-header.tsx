'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavGroup } from '../lib/nav-config';
import { findActiveGroup } from '../lib/nav-config';

export function StudioBreadcrumb({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const group = findActiveGroup(groups, pathname);
  const current = group?.items.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );

  if (!group || !current) return null;

  return (
    <p className="text-xs text-paper-muted truncate">
      <span className="text-paper-dim">{group.label}</span>
      <span className="mx-1.5 text-paper-dim">/</span>
      <span className="text-paper-soft">{current.label}</span>
    </p>
  );
}

export function StudioQuickLinks() {
  return (
    <div className="hidden md:flex items-center gap-2">
      <Link href="/website" className="btn-ghost text-xs py-2 min-h-[36px] px-3">
        Website
      </Link>
      <Link href="/analytics/tiktok" className="btn-ghost text-xs py-2 min-h-[36px] px-3">
        TikTok
      </Link>
      <Link href="/editor" className="btn-ghost text-xs py-2 min-h-[36px] px-3">
        Today
      </Link>
      <Link href="/ask-benson" className="btn-primary text-xs py-2 min-h-[36px] px-3">
        Ask Benson
      </Link>
    </div>
  );
}
