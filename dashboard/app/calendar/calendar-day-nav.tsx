'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { formatCalendarDayNavLabel } from '../../lib/calendar-local-date';

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  const main = document.querySelector<HTMLElement>('main.studio-main-scroll');
  if (main && /(auto|scroll)/.test(getComputedStyle(main).overflowY)) {
    return main;
  }
  let node = el?.parentElement ?? null;
  while (node) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY)) return node;
    node = node.parentElement;
  }
  return null;
}

function stickyChromeOffset(scrollRoot: HTMLElement | null): number {
  if (scrollRoot) return 0;
  const header = document.querySelector('header.sticky');
  return header instanceof HTMLElement ? Math.round(header.getBoundingClientRect().height) : 0;
}

function dayJumpMargin(nav: HTMLElement, scrollRoot: HTMLElement | null): number {
  const chrome = stickyChromeOffset(scrollRoot);
  const navHeight = Math.round(nav.getBoundingClientRect().height);
  const rootPadding = scrollRoot ? parseFloat(getComputedStyle(scrollRoot).paddingTop) || 0 : 0;
  return Math.max(8, Math.round(chrome + rootPadding + navHeight + 8));
}

function daySections(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return [...root.querySelectorAll<HTMLElement>('[data-calendar-day]')];
}

export function CalendarDayNav({
  days,
  listRef,
}: {
  days: string[];
  listRef: RefObject<HTMLElement | null>;
}) {
  const navRef = useRef<HTMLDivElement>(null);
  const jumpLockRef = useRef<string | null>(null);
  const [activeDay, setActiveDay] = useState(days[0] ?? '');
  const [stickyTop, setStickyTop] = useState(0);

  useEffect(() => {
    if (days.length === 0) return;
    setActiveDay((current) => (days.includes(current) ? current : days[0]!));
  }, [days]);

  useEffect(() => {
    const nav = navRef.current;
    const list = listRef.current;
    if (!nav || !list || days.length === 0) return;

    const scrollRoot = findScrollParent(list);
    const applyOffsets = () => {
      const chrome = stickyChromeOffset(scrollRoot);
      setStickyTop(chrome);
      const margin = dayJumpMargin(nav, scrollRoot);
      for (const section of daySections(list)) {
        section.style.scrollMarginTop = `${margin}px`;
      }
    };
    applyOffsets();

    let frame = 0;
    const syncActive = () => {
      frame = 0;
      if (jumpLockRef.current) return;
      const sections = daySections(list);
      if (sections.length === 0) return;
      const line = nav.getBoundingClientRect().bottom + 4;
      let next = sections[0]!;
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= line) next = section;
      }
      const day = next.dataset.calendarDay;
      if (day) setActiveDay((prev) => (prev === day ? prev : day));
    };

    const observer = new IntersectionObserver(
      () => {
        if (!frame) frame = requestAnimationFrame(syncActive);
      },
      { root: scrollRoot, threshold: [0, 0.15, 0.5, 1] },
    );
    for (const section of daySections(list)) observer.observe(section);
    syncActive();

    const resize = new ResizeObserver(applyOffsets);
    resize.observe(nav);
    if (scrollRoot) resize.observe(scrollRoot);
    scrollRoot?.addEventListener('scrollend', syncActive);

    return () => {
      observer.disconnect();
      resize.disconnect();
      scrollRoot?.removeEventListener('scrollend', syncActive);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [days, listRef]);

  const jumpTo = useCallback(
    (day: string) => {
      const section = listRef.current?.querySelector<HTMLElement>(`[data-calendar-day="${day}"]`);
      const nav = navRef.current;
      if (!section || !nav) return;
      jumpLockRef.current = day;
      setActiveDay(day);
      const allowSmooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const scrollRoot = findScrollParent(section);
      const rootTop = scrollRoot?.getBoundingClientRect().top ?? 0;
      const margin = dayJumpMargin(nav, scrollRoot);
      if (scrollRoot) {
        const delta = section.getBoundingClientRect().top - rootTop - margin;
        const behavior: ScrollBehavior = allowSmooth && Math.abs(delta) < 720 ? 'smooth' : 'auto';
        scrollRoot.scrollTo({ top: Math.max(0, scrollRoot.scrollTop + delta), behavior });
      } else {
        section.scrollIntoView({ behavior: allowSmooth ? 'smooth' : 'auto', block: 'start' });
      }
      window.setTimeout(() => {
        if (jumpLockRef.current === day) jumpLockRef.current = null;
      }, 700);
    },
    [listRef],
  );

  if (days.length === 0) return null;

  const index = Math.max(0, days.indexOf(activeDay));
  const atStart = index <= 0;
  const atEnd = index >= days.length - 1;
  const label = formatCalendarDayNavLabel(days[index] ?? days[0]!);

  return (
    <div
      ref={navRef}
      className="sticky z-30 -mx-4 border-b border-white/10 bg-[#07070d] px-4 py-1.5 shadow-[0_8px_16px_rgba(0,0,0,0.35)] md:-mx-6 md:px-6 lg:-mx-8 lg:px-8"
      style={{ top: stickyTop }}
    >
      <div className="mx-auto flex max-w-[1200px] items-center gap-2">
        <button
          type="button"
          disabled={atStart}
          onClick={() => {
            const prev = days[index - 1];
            if (prev) jumpTo(prev);
          }}
          className="shrink-0 min-h-[44px] px-2 text-xs text-paper-muted disabled:opacity-30"
        >
          ‹ Previous
        </button>
        <p className="min-w-0 flex-1 text-center text-sm font-bold tracking-wide tabular-nums">{label}</p>
        <button
          type="button"
          disabled={atEnd}
          onClick={() => {
            const next = days[index + 1];
            if (next) jumpTo(next);
          }}
          className="shrink-0 min-h-[44px] px-2 text-xs text-paper-muted disabled:opacity-30"
        >
          Next ›
        </button>
      </div>
    </div>
  );
}
