import { notFound, redirect } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../lib/opportunities-ui';

export default function AnalyticsPage() {
  if (!isOpportunitiesUiEnabled) {
    notFound();
  }

  redirect('/analytics/tiktok');
}
