'use client';

import { useCallback, useEffect, useState } from 'react';

export type ActionToastTone = 'success' | 'info' | 'error';

export type ShowToastInput = {
  /** What just happened, past tense. */
  title: string;
  /** What Benson does next as a result. */
  nextStep?: string | null;
  tone?: ActionToastTone;
  undo?: (() => void | Promise<void>) | null;
};

type ActionToast = Required<Omit<ShowToastInput, 'undo'>> & {
  id: number;
  undo: (() => void | Promise<void>) | null;
};

const TOAST_EVENT = 'benson:action-toast';
const DISMISS_MS = 9000;
/** Long enough to actually reach for Undo on a phone. */
const DISMISS_MS_WITH_UNDO = 14000;

let nextToastId = 1;

/**
 * Dispatched on `window` rather than through React context: this module gets
 * bundled into several route chunks, so a context provider in the layout is a
 * different instance than the one a page component reads.
 */
export function showActionToast(input: ShowToastInput): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ShowToastInput>(TOAST_EVENT, { detail: input }));
}

const toastApi = { showToast: showActionToast };

export function useActionToast(): { showToast: (input: ShowToastInput) => void } {
  return toastApi;
}

export function ActionToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ActionToastViewport />
    </>
  );
}

export function ActionToastViewport() {
  const [toasts, setToasts] = useState<ActionToast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    function onToast(event: Event) {
      const detail = (event as CustomEvent<ShowToastInput>).detail;
      if (!detail?.title) return;
      setToasts((current) => [
        ...current.slice(-2),
        {
          id: nextToastId++,
          title: detail.title,
          nextStep: detail.nextStep ?? null,
          tone: detail.tone ?? 'success',
          undo: detail.undo ?? null,
        },
      ]);
    }

    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-3"
      style={{ bottom: 'calc(var(--studio-tab-bar-height, 0px) + 1rem)' }}
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <ActionToastCard key={toast.id} toast={toast} onDismiss={dismiss} />
      ))}
    </div>
  );
}

function ActionToastCard({
  toast,
  onDismiss,
}: {
  toast: ActionToast;
  onDismiss: (id: number) => void;
}) {
  const [undoing, setUndoing] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(
      () => onDismiss(toast.id),
      toast.undo ? DISMISS_MS_WITH_UNDO : DISMISS_MS,
    );
    return () => window.clearTimeout(timer);
  }, [toast.id, toast.undo, onDismiss]);

  const toneClass =
    toast.tone === 'error'
      ? 'border-red-400/40 bg-red-950/90'
      : toast.tone === 'info'
        ? 'border-white/15 bg-black/90'
        : 'border-accent/40 bg-black/90';

  return (
    <div
      className={`pointer-events-auto w-full max-w-md rounded-xl border ${toneClass} px-4 py-3 shadow-2xl backdrop-blur-xl`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-snug">{toast.title}</p>
          {toast.nextStep && (
            <p className="mt-0.5 text-xs leading-snug text-paper-soft">{toast.nextStep}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {toast.undo && (
            <button
              type="button"
              disabled={undoing}
              className="rounded-lg border border-white/20 px-2.5 py-1.5 text-2xs font-bold uppercase tracking-wide hover:bg-white/10 disabled:opacity-50"
              onClick={async () => {
                setUndoing(true);
                try {
                  await toast.undo?.();
                  onDismiss(toast.id);
                } finally {
                  setUndoing(false);
                }
              }}
            >
              {undoing ? '…' : 'Undo'}
            </button>
          )}
          <button
            type="button"
            aria-label="Dismiss"
            className="rounded-lg px-2 py-1.5 text-xs text-paper-muted hover:text-paper-ink"
            onClick={() => onDismiss(toast.id)}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
