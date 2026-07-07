import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../../lib/opportunities-ui';
import { TopSponsorCandidatesPanel } from './top-sponsor-candidates-panel';

export default function TopSponsorCandidatesPage() {
  if (!isOpportunitiesUiEnabled) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold lowercase">top 50 sponsor candidates</h1>
        <p className="text-sm text-paper-muted mt-2 max-w-3xl">
          Ranked from ingested KC inventory — sponsor fit, audience, revenue, confidence, and
          contact-first priority. No new APIs; uses live content_items only.
        </p>
      </div>
      <TopSponsorCandidatesPanel />
    </div>
  );
}
