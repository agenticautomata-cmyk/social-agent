import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api, type ShareIntakeSubmission } from '../../lib/api';
import { isOpportunitiesUiEnabled } from '../../lib/opportunities-ui';
import { IntakeReviewCard } from './intake-review-card';

export default async function IntakeReviewPage() {
  if (!isOpportunitiesUiEnabled) {
    notFound();
  }

  const { items } = await api.get<{ items: ShareIntakeSubmission[] }>('/intake?reviewStatus=needs_review');

  return (
    <div className="space-y-12">
      <section className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="section-mark mb-3">
            <span>// §1 share to benson</span>
          </div>
          <h1 className="text-5xl font-bold tracking-tightest cursor lowercase">share intake</h1>
          <p className="text-paper-muted mt-2 italic">
            // review manual shares before Benson adds them to opportunities
          </p>
        </div>
        <Link
          href="/intake/add"
          className="bracket px-6 py-3 bg-paper-ink text-paper font-bold hover:opacity-90 transition"
        >
          add opportunity
        </Link>
      </section>

      {items.length === 0 ? (
        <div className="border-2 border-paper-ink py-16 text-center">
          <div className="text-3xl font-bold text-accent">// no pending shares</div>
          <p className="text-paper-muted mt-2 italic">
            Benson has nothing to review — use Add Opportunity to send a link or description.
          </p>
          <Link href="/intake/add" className="link inline-block mt-6">
            add opportunity →
          </Link>
        </div>
      ) : (
        <section className="space-y-0">
          {items.map((intake, idx) => (
            <IntakeReviewCard key={intake.id} intake={intake} idx={idx} />
          ))}
        </section>
      )}
    </div>
  );
}
