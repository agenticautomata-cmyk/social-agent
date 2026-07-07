import { notFound } from 'next/navigation';
import Link from 'next/link';
import { isOpportunitiesUiEnabled } from '../../lib/opportunities-ui';
import { SponsorIntelligencePanel } from './sponsor-intelligence-panel';

export default function SponsorIntelligencePage() {
  if (!isOpportunitiesUiEnabled) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold lowercase">sponsor intelligence</h1>
        <p className="text-sm text-paper-muted mt-2 max-w-2xl">
          Benson ranks sponsor-friendly opportunities so Kellie knows who to contact first —
          with fit scores, pitch angles, and one-click outreach actions.
        </p>
        <p className="text-xs mt-3">
          <Link href="/sponsor-intelligence/businesses" className="link lowercase">
            sponsor intelligence v1 — ranked from TikTok content →
          </Link>
        </p>
      </div>
      <SponsorIntelligencePanel />
    </div>
  );
}
