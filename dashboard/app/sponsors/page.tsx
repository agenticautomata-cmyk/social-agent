import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../lib/opportunities-ui';
import { SponsorsPanel } from './sponsors-panel';

export default function SponsorsPage() {
  if (!isOpportunitiesUiEnabled) notFound();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold lowercase">sponsor CRM</h1>
        <p className="text-sm text-paper-muted mt-2 max-w-2xl">
          Track sponsor-friendly businesses, plan outreach, and manage follow-ups — demo sends only in Phase A.
        </p>
      </div>
      <SponsorsPanel />
    </div>
  );
}
