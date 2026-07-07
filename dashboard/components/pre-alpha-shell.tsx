'use client';

import { useState } from 'react';
import { TesterFeedbackPanel } from './tester-feedback-panel';

/** Collapsed feedback — expand only when needed. */
export function PreAlphaFeedbackFooter({ pageTitle }: { pageTitle?: string }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="mt-10 flex justify-center">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs text-paper-dim hover:text-paper-muted transition"
        >
          Send feedback or report a bug
        </button>
      </div>
    );
  }

  return (
    <div className="mt-10 pt-6 border-t border-white/10">
      <div className="flex justify-end mb-3">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-paper-dim hover:text-paper-muted"
        >
          Hide
        </button>
      </div>
      <TesterFeedbackPanel pageTitle={pageTitle} />
    </div>
  );
}
