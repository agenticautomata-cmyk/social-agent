import { isOpportunitiesUiEnabled } from '../lib/opportunities-ui';
import LegacyOverviewPage from './legacy-overview';
import { HomeDashboardPanel } from './home-dashboard-panel';

export default function HomePage() {
  if (isOpportunitiesUiEnabled) {
    return <HomeDashboardPanel />;
  }

  return <LegacyOverviewPage />;
}
