'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { shouldShowAskBensonFloating } from '../lib/ask-benson-types';
import { defaultChatFabAnchor } from '../lib/use-long-press-drag';
import { useBensonStudio } from '../lib/benson-studio-context';
import { BensonDancer } from './benson-dancer';
import { BensonChatPanel } from './benson-chat-panel';
import { FloatingDragShell } from './floating-drag-shell';

export function BensonChatFloating() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { isDancing } = useBensonStudio();

  if (!shouldShowAskBensonFloating(pathname)) {
    return null;
  }

  const pageContext = pathname;

  return (
    <FloatingDragShell
      storageKey="benson-floating-chat-anchor"
      defaultAnchor={defaultChatFabAnchor}
      label="Ask Benson chat"
      fallbackClassName="fixed right-4 bottom-[calc(var(--studio-tab-bar-height)+0.75rem)] lg:bottom-4"
      zIndex={10001}
    >
      {open && (
        <BensonChatPanel
          variant="floating"
          docked
          isOpen={open}
          onClose={() => setOpen(false)}
          pageContext={pageContext}
        />
      )}

      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="h-[76px] w-[76px] rounded-full bg-gradient-to-br from-glow-violet to-glow-pink shadow-glow flex items-end justify-center pb-1 hover:scale-105 transition-transform ring-2 ring-white/20 overflow-visible"
          aria-label="Open Ask Benson chat"
        >
          <BensonDancer size={52} variant="full" forceDance={isDancing} />
        </button>
      )}
    </FloatingDragShell>
  );
}
