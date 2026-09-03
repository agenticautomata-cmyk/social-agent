import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../../lib/opportunities-ui';
import { FormPacketsPanel } from './form-packets-panel';

export default function FormPacketsPage() {
  if (!isOpportunitiesUiEnabled) notFound();

  return (
    <main className="page-shell max-w-6xl">
      <div className="section-mark mb-3">
        <span>// § form packets</span>
      </div>
      <h1 className="text-5xl font-bold tracking-tightest cursor lowercase">form packets</h1>
      <p className="text-paper-muted mt-2 max-w-2xl">
        Official contact-form opportunities. Review the pitch, open the form yourself, and confirm
        when you have submitted. No Approve &amp; send.
      </p>
      <div className="mt-8">
        <Suspense fallback={<p className="text-sm text-paper-muted italic">// loading…</p>}>
          <FormPacketsPanel />
        </Suspense>
      </div>
    </main>
  );
}
