import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../../lib/opportunities-ui';
import { EmailApprovalsPanel } from './email-approvals-panel';

export default function EmailApprovalsPage() {
  if (!isOpportunitiesUiEnabled) notFound();

  return (
    <main className="page-shell max-w-6xl">
      <div className="section-mark mb-3"><span>// § email approvals</span></div>
      <h1 className="text-5xl font-bold tracking-tightest cursor lowercase">approvals</h1>
      <p className="text-paper-muted mt-2 max-w-2xl">
        Benson drafts sponsor <strong>email</strong> pitches here. Form-only opportunities live on{' '}
        <a href="/email/form-packets" className="underline">
          Form packets
        </a>
        . Review, edit, approve, then send from Gmail.
      </p>
      <div className="mt-8">
        <Suspense fallback={<p className="text-sm text-paper-muted italic">// loading approvals…</p>}>
          <EmailApprovalsPanel />
        </Suspense>
      </div>
    </main>
  );
}
