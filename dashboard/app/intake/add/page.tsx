import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../../lib/opportunities-ui';
import { AddOpportunityForm } from '../add-opportunity-form';

export default function IntakeAddPage() {
  if (!isOpportunitiesUiEnabled) {
    notFound();
  }

  return (
    <div className="space-y-12">
      <section>
        <div className="section-mark mb-3">
          <span>// §1 add opportunity</span>
        </div>
        <h1 className="text-5xl font-bold tracking-tightest cursor lowercase">add opportunity</h1>
        <p className="text-paper-muted mt-2 italic">
          // send a URL or description to Benson — lands in share intake for review
        </p>
      </section>

      <AddOpportunityForm />

      <p className="text-sm text-paper-muted">
        <Link href="/intake" className="link">
          ← back to share intake review
        </Link>
      </p>
    </div>
  );
}
