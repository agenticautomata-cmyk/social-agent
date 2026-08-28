'use client';

import { useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { shouldShowAskBensonFloating } from '../lib/ask-benson-types';
import { defaultChatFabAnchor, type FloatingAnchor } from '../lib/use-long-press-drag';
import { useBensonStudio } from '../lib/benson-studio-context';
import { BensonDancer } from './benson-dancer';
import { FloatingDragShell } from './floating-drag-shell';

/** Mobile home: clear primary controls above the tab bar (tab + 5.5rem ≈ 140px+). */
const HOME_MOBILE_FAB_BOTTOM_PX = 148;

export function BensonChatFloating() {
  const pathname = usePathname();
  const router = useRouter();
  const { isDancing } = useBensonStudio();
  const isHome = pathname === '/home';

  const homeChatFabAnchor = useCallback((): FloatingAnchor => {
    if (typeof window === 'undefined') return { right: 16, bottom: HOME_MOBILE_FAB_BOTTOM_PX };
    return {
      right: 16,
      bottom: window.innerWidth >= 1024 ? 16 : HOME_MOBILE_FAB_BOTTOM_PX,
    };
  }, []);

  if (!shouldShowAskBensonFloating(pathname)) {
    return null;
  }

  return (
    <FloatingDragShell
      storageKey={isHome ? 'benson-floating-chat-anchor-home' : 'benson-floating-chat-anchor'}
      defaultAnchor={isHome ? homeChatFabAnchor : defaultChatFabAnchor}
      label="Ask Benson chat"
      fallbackClassName={
        isHome
          ? 'fixed right-4 bottom-[calc(var(--studio-tab-bar-height)+5.5rem)] lg:bottom-4'
          : 'fixed right-4 bottom-[calc(var(--studio-tab-bar-height)+0.75rem)] lg:bottom-4'
      }
      zIndex={10001}
    >
      <button
        type="button"
        onClick={() => {
          sessionStorage.setItem('bensonWorkspaceReturnTo', pathname);
          router.push(`/ask-benson?returnTo=${encodeURIComponent(pathname)}`);
        }}
        className="h-[76px] w-[76px] rounded-full bg-gradient-to-br from-glow-violet to-glow-pink shadow-glow flex items-end justify-center pb-1 hover:scale-105 transition-transform ring-2 ring-white/20 overflow-visible"
        aria-label="Open Ask Benson workspace"
      >
        <BensonDancer size={52} variant="full" forceDance={isDancing} />
      </button>
    </FloatingDragShell>
  );
}
