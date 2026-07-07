import { isOpportunitiesUiEnabled } from '../../lib/opportunities-ui';
import LegacyOverviewPage from '../legacy-overview';
import { HomeDashboardPanel } from '../home-dashboard-panel';

export default function HomeDashboardPage() {
  if (isOpportunitiesUiEnabled) {
    return <HomeDashboardPanel />;
  }

  return <LegacyOverviewPage />;
}
