import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../lib/opportunities-ui';
import { RevenueDashboardPanel } from './revenue-dashboard-panel';

export default function RevenuePage() {
  if (!isOpportunitiesUiEnabled) {
    notFound();
  }

  return <RevenueDashboardPanel />;
}
