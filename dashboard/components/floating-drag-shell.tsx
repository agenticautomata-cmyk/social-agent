'use client';

import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import {
  useLongPressDrag,
  type FloatingAnchor,
} from '../lib/use-long-press-drag';

type FloatingDragShellProps = {
  storageKey: string;
  defaultAnchor: () => FloatingAnchor;
  className?: string;
  label: string;
  children: ReactNode;
  fallbackClassName?: string;
  zIndex?: number;
  swipeToDismiss?: boolean;
  onSwipeDismiss?: () => void;
  hidden?: boolean;
};

export function FloatingDragShell({
  storageKey,
  defaultAnchor,
  className = '',
  label,
  children,
  fallbackClassName = 'fixed bottom-4 right-4',
  zIndex,
  swipeToDismiss = false,
  onSwipeDismiss,
  hidden = false,
}: FloatingDragShellProps) {
  const {
    shellRef,
    style,
    isDragging,
    mounted,
    handlers,
  } = useLongPressDrag({
    storageKey,
    defaultAnchor,
    zIndex,
    swipeToDismiss,
    onSwipeDismiss,
    enabled: !hidden,
  });

  const dragStateClass = isDragging ? 'ring-2 ring-accent/60 scale-[1.02]' : '';
  const hiddenClass = hidden
    ? 'pointer-events-none translate-x-[130%] translate-y-[30%] opacity-0 scale-95'
    : '';

  const shell = (
    <div
      ref={shellRef}
      style={style}
      {...handlers}
      className={`flex flex-col items-end gap-2 select-none touch-none transition-[transform,opacity] duration-300 ease-out [&_button]:touch-none [&_button]:select-none ${
        mounted ? '' : `${fallbackClassName} opacity-0 pointer-events-none`
      } ${dragStateClass} ${hiddenClass} ${className}`.trim()}
      aria-label={`${label}. Press and hold to reposition.${swipeToDismiss ? ' Swipe away to hide.' : ''}`}
      aria-hidden={hidden || undefined}
      data-dragging={isDragging ? 'true' : undefined}
    >
      {children}
    </div>
  );

  if (!mounted || typeof document === 'undefined') {
    return (
      <div className={`${fallbackClassName} opacity-0 pointer-events-none`} aria-hidden />
    );
  }

  return createPortal(shell, document.body);
}
