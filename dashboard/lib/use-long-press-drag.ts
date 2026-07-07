'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

export type FloatingAnchor = { right: number; bottom: number };

const LONG_PRESS_MS = 480;
const VIEWPORT_MARGIN = 8;
const SUPPRESS_CLICK_MS = 500;
const SWIPE_CANCEL_LONG_PRESS_PX = 12;
const SWIPE_DISMISS_PX = 56;

function clampAnchor(anchor: FloatingAnchor, width: number, height: number): FloatingAnchor {
  const maxRight = Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN);
  const maxBottom = Math.max(VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN);
  return {
    right: Math.min(maxRight, Math.max(VIEWPORT_MARGIN, anchor.right)),
    bottom: Math.min(maxBottom, Math.max(VIEWPORT_MARGIN, anchor.bottom)),
  };
}

function readStoredAnchor(storageKey: string): FloatingAnchor | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FloatingAnchor;
    if (typeof parsed.right === 'number' && typeof parsed.bottom === 'number') return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function suppressGhostClick(ref: { current: boolean }) {
  ref.current = true;
  window.setTimeout(() => {
    ref.current = false;
  }, SUPPRESS_CLICK_MS);
}

export function useLongPressDrag(options: {
  storageKey: string;
  defaultAnchor: () => FloatingAnchor;
  enabled?: boolean;
  zIndex?: number;
  /** Quick swipe right/down dismisses the widget (long-press still repositions). */
  swipeToDismiss?: boolean;
  onSwipeDismiss?: () => void;
}) {
  const {
    storageKey,
    defaultAnchor,
    enabled = true,
    zIndex = 9999,
    swipeToDismiss = false,
    onSwipeDismiss,
  } = options;
  const shellRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<FloatingAnchor | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState({ x: 0, y: 0 });

  const longPressTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const isDraggingRef = useRef(false);
  const touchActiveRef = useRef(false);
  const activeTouchIdRef = useRef<number | null>(null);
  const pressStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipeTrackingRef = useRef(false);
  const swipeOffsetRef = useRef({ x: 0, y: 0 });
  const cornerOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const anchorRef = useRef<FloatingAnchor | null>(null);

  const persistAnchor = useCallback(
    (value: FloatingAnchor) => {
      anchorRef.current = value;
      try {
        localStorage.setItem(storageKey, JSON.stringify(value));
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );

  const measureAndClamp = useCallback((value: FloatingAnchor): FloatingAnchor => {
    const node = shellRef.current;
    if (!node) return value;
    const { width, height } = node.getBoundingClientRect();
    return clampAnchor(value, width, height);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    setMounted(true);
    const saved = readStoredAnchor(storageKey);
    const initial = saved ?? defaultAnchor();
    setAnchor(initial);
    anchorRef.current = initial;
  }, [defaultAnchor, enabled, storageKey]);

  useEffect(() => {
    if (!enabled || !mounted) return;
    const onResize = () => {
      if (isDraggingRef.current) return;
      setAnchor((prev) => {
        if (!prev) return prev;
        const next = measureAndClamp(prev);
        persistAnchor(next);
        return next;
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [enabled, measureAndClamp, mounted, persistAnchor]);

  useEffect(() => {
    const node = shellRef.current;
    if (!enabled || !mounted || !node) return;

    const observer = new ResizeObserver(() => {
      if (isDraggingRef.current) return;
      setAnchor((prev) => {
        if (!prev) return prev;
        const next = measureAndClamp(prev);
        if (next.right === prev.right && next.bottom === prev.bottom) return prev;
        persistAnchor(next);
        return next;
      });
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, measureAndClamp, mounted, persistAnchor]);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const resolveAnchor = useCallback((): FloatingAnchor => {
    if (anchorRef.current) return anchorRef.current;
    const node = shellRef.current;
    if (node) {
      const rect = node.getBoundingClientRect();
      return {
        right: window.innerWidth - rect.right,
        bottom: window.innerHeight - rect.bottom,
      };
    }
    return defaultAnchor();
  }, [defaultAnchor]);

  const preparePress = useCallback(
    (clientX: number, clientY: number) => {
      const node = shellRef.current;
      if (!node) return;

      const rect = node.getBoundingClientRect();
      const current = resolveAnchor();
      cornerOffsetRef.current = {
        x: rect.right - clientX,
        y: rect.bottom - clientY,
      };

      if (!anchorRef.current) {
        anchorRef.current = current;
        setAnchor(current);
      }
    },
    [resolveAnchor],
  );

  const startDrag = useCallback(() => {
    isDraggingRef.current = true;
    setIsDragging(true);
    suppressGhostClick(suppressClickRef);
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(10);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const updateAnchorFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const next = measureAndClamp({
        right: window.innerWidth - (clientX + cornerOffsetRef.current.x),
        bottom: window.innerHeight - (clientY + cornerOffsetRef.current.y),
      });
      anchorRef.current = next;
      setAnchor(next);
    },
    [measureAndClamp],
  );

  const finishGesture = useCallback(
    (preventDefault?: () => void) => {
      clearLongPressTimer();

      if (isDraggingRef.current && anchorRef.current) {
        const next = measureAndClamp(anchorRef.current);
        persistAnchor(next);
        setAnchor(next);
        preventDefault?.();
        suppressGhostClick(suppressClickRef);
      } else if (
        swipeToDismiss &&
        swipeTrackingRef.current &&
        pressStartRef.current &&
        onSwipeDismiss
      ) {
        const dx = swipeOffsetRef.current.x;
        const dy = swipeOffsetRef.current.y;
        const swipeRight = dx >= SWIPE_DISMISS_PX && dx > Math.abs(dy);
        const swipeDown = dy >= SWIPE_DISMISS_PX && dy > Math.abs(dx);
        if (swipeRight || swipeDown) {
          preventDefault?.();
          suppressGhostClick(suppressClickRef);
          onSwipeDismiss();
        }
      }

      isDraggingRef.current = false;
      setIsDragging(false);
      touchActiveRef.current = false;
      activeTouchIdRef.current = null;
      pressStartRef.current = null;
      swipeTrackingRef.current = false;
      swipeOffsetRef.current = { x: 0, y: 0 };
      setSwipeOffset({ x: 0, y: 0 });
    },
    [clearLongPressTimer, measureAndClamp, onSwipeDismiss, persistAnchor, swipeToDismiss],
  );

  const trackSwipeMove = useCallback(
    (clientX: number, clientY: number) => {
      const start = pressStartRef.current;
      if (!start || isDraggingRef.current) return;

      const dx = clientX - start.x;
      const dy = clientY - start.y;
      const distance = Math.hypot(dx, dy);

      if (distance >= SWIPE_CANCEL_LONG_PRESS_PX) {
        clearLongPressTimer();
        swipeTrackingRef.current = true;
      }

      if (!swipeTrackingRef.current || !swipeToDismiss) return;

      const next = {
        x: Math.max(0, dx),
        y: Math.max(0, dy),
      };
      swipeOffsetRef.current = next;
      setSwipeOffset(next);
    },
    [clearLongPressTimer, swipeToDismiss],
  );

  useEffect(() => {
    const shell = shellRef.current;
    if (!enabled || !mounted || !shell) return;

    const findTouch = (event: TouchEvent) =>
      [...event.touches].find((t) => t.identifier === activeTouchIdRef.current) ??
      [...event.changedTouches].find((t) => t.identifier === activeTouchIdRef.current);

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (!touch) return;

      touchActiveRef.current = true;
      activeTouchIdRef.current = touch.identifier;
      pressStartRef.current = { x: touch.clientX, y: touch.clientY };
      swipeTrackingRef.current = false;
      swipeOffsetRef.current = { x: 0, y: 0 };
      setSwipeOffset({ x: 0, y: 0 });
      preparePress(touch.clientX, touch.clientY);

      clearLongPressTimer();
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null;
        startDrag();
      }, LONG_PRESS_MS);
    };

    const onTouchMove = (event: TouchEvent) => {
      const touch = findTouch(event);
      if (!touch) return;

      if (isDraggingRef.current) {
        event.preventDefault();
        updateAnchorFromPointer(touch.clientX, touch.clientY);
        return;
      }

      if (touchActiveRef.current) {
        trackSwipeMove(touch.clientX, touch.clientY);
      }
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (!touchActiveRef.current) return;
      const ended = [...event.changedTouches].some(
        (t) => t.identifier === activeTouchIdRef.current,
      );
      if (!ended) return;

      const wasDragging = isDraggingRef.current;
      finishGesture(wasDragging ? () => event.preventDefault() : undefined);
    };

    const onDocumentTouchMove = (event: TouchEvent) => {
      if (!touchActiveRef.current || !isDraggingRef.current) return;
      const touch = [...event.touches].find((t) => t.identifier === activeTouchIdRef.current);
      if (!touch) return;
      event.preventDefault();
      updateAnchorFromPointer(touch.clientX, touch.clientY);
    };

    const onDocumentTouchEnd = (event: TouchEvent) => {
      if (!touchActiveRef.current) return;
      const ended = [...event.changedTouches].some(
        (t) => t.identifier === activeTouchIdRef.current,
      );
      if (!ended) return;
      if (!isDraggingRef.current) return;
      finishGesture(() => event.preventDefault());
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      if (event.button !== 0) return;

      pressStartRef.current = { x: event.clientX, y: event.clientY };
      swipeTrackingRef.current = false;
      swipeOffsetRef.current = { x: 0, y: 0 };
      setSwipeOffset({ x: 0, y: 0 });
      preparePress(event.clientX, event.clientY);
      clearLongPressTimer();
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null;
        startDrag();
      }, LONG_PRESS_MS);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      if (isDraggingRef.current) {
        event.preventDefault();
        updateAnchorFromPointer(event.clientX, event.clientY);
        return;
      }
      trackSwipeMove(event.clientX, event.clientY);
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      if (!isDraggingRef.current && longPressTimerRef.current == null) return;
      finishGesture();
    };

    shell.addEventListener('touchstart', onTouchStart, { passive: false });
    shell.addEventListener('touchmove', onTouchMove, { passive: false });
    shell.addEventListener('touchend', onTouchEnd, { passive: false });
    shell.addEventListener('touchcancel', onTouchEnd, { passive: false });
    shell.addEventListener('pointerdown', onPointerDown);
    shell.addEventListener('pointermove', onPointerMove);
    shell.addEventListener('pointerup', onPointerUp);
    shell.addEventListener('pointercancel', onPointerUp);
    document.addEventListener('touchmove', onDocumentTouchMove, { passive: false });
    document.addEventListener('touchend', onDocumentTouchEnd, { passive: false });
    document.addEventListener('touchcancel', onDocumentTouchEnd, { passive: false });

    return () => {
      shell.removeEventListener('touchstart', onTouchStart);
      shell.removeEventListener('touchmove', onTouchMove);
      shell.removeEventListener('touchend', onTouchEnd);
      shell.removeEventListener('touchcancel', onTouchEnd);
      shell.removeEventListener('pointerdown', onPointerDown);
      shell.removeEventListener('pointermove', onPointerMove);
      shell.removeEventListener('pointerup', onPointerUp);
      shell.removeEventListener('pointercancel', onPointerUp);
      document.removeEventListener('touchmove', onDocumentTouchMove);
      document.removeEventListener('touchend', onDocumentTouchEnd);
      document.removeEventListener('touchcancel', onDocumentTouchEnd);
    };
  }, [
    clearLongPressTimer,
    enabled,
    finishGesture,
    mounted,
    preparePress,
    startDrag,
    trackSwipeMove,
    updateAnchorFromPointer,
  ]);

  const onShellClickCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (suppressClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, []);

  const style: CSSProperties | undefined =
    mounted && anchor
      ? {
          position: 'fixed',
          right: anchor.right,
          bottom: anchor.bottom,
          left: 'auto',
          top: 'auto',
          touchAction: 'none',
          WebkitTouchCallout: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
          zIndex,
          transform:
            swipeOffset.x > 0 || swipeOffset.y > 0
              ? `translate(${swipeOffset.x}px, ${swipeOffset.y}px)`
              : undefined,
          opacity:
            swipeOffset.x > 0 || swipeOffset.y > 0
              ? Math.max(0.35, 1 - Math.max(swipeOffset.x, swipeOffset.y) / 160)
              : undefined,
          transition: isDragging ? undefined : 'transform 120ms ease, opacity 120ms ease',
        }
      : undefined;

  return {
    shellRef,
    style,
    isDragging,
    mounted,
    swipeOffset,
    handlers: {
      onClickCapture: onShellClickCapture,
    },
  };
}

export function defaultChatFabAnchor(): FloatingAnchor {
  if (typeof window === 'undefined') return { right: 16, bottom: 88 };
  return {
    right: 16,
    bottom: window.innerWidth >= 1024 ? 16 : 88,
  };
}

export function defaultStudioBeatAnchor(): FloatingAnchor {
  return {
    right: window.innerWidth >= 768 ? 24 : 16,
    bottom: window.innerWidth >= 768 ? 100 : 108,
  };
}
