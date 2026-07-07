import { notFound } from 'next/navigation';
import Link from 'next/link';
import { isOpportunitiesUiEnabled } from '../../../lib/opportunities-ui';
import { BusinessIntelligencePanel } from './business-intelligence-panel';

export default function SponsorBusinessIntelligencePage() {
  if (!isOpportunitiesUiEnabled) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href="/sponsor-intelligence" className="text-xs link lowercase">
          ← opportunity intel
        </Link>
        <h1 className="text-2xl font-bold lowercase mt-2">sponsor intelligence v1</h1>
        <p className="text-sm text-paper-muted mt-2 max-w-3xl">
          Ranked sponsor candidates from TikTok content — every business extracted from classified
          video metadata. National chains are tracked but excluded from local sponsor
          recommendations.
        </p>
      </div>
      <BusinessIntelligencePanel />
    </div>
  );
}
