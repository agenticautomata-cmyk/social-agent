'use client';

import { TesterFeedbackPanel } from './tester-feedback-panel';

/** Collapsible feedback footer for inner pages (optional per-page title). */
export function PreAlphaFeedbackFooter({ pageTitle }: { pageTitle?: string }) {
  return (
    <div className="mt-12 pt-8 border-t border-paper-edge">
      <TesterFeedbackPanel pageTitle={pageTitle} />
    </div>
  );
}
