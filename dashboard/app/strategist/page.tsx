import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../lib/opportunities-ui';
import { StrategistPanel } from './strategist-panel';

export default function StrategistPage() {
  if (!isOpportunitiesUiEnabled) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold lowercase">benson strategist</h1>
        <p className="text-sm text-paper-muted mt-2 max-w-3xl">
          OpenAI-powered growth analysis built from your live creator analytics, content
          categories, business mentions, and sponsor candidates. Recommendations are grounded in
          structured data — not generic advice.
        </p>
      </div>
      <StrategistPanel />
    </div>
  );
}
