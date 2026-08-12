import { featureFlags } from '../../lib/feature-flags.server';
import { DemoPanel } from './demo-panel';

export const metadata = {
  title: 'Benson Creator Studio — Demo',
};

// Admin-only guided walkthrough — not linked from the main nav. Uses real production
// data with strict visibility gates; never fabricates businesses, contacts, or metrics.
export default function DemoPage() {
  return (
    <div className="page-shell max-w-3xl mx-auto space-y-8 pb-16">
      <DemoPanel prospectDemoMode={featureFlags.bensonProspectDemoMode} />
    </div>
  );
}
