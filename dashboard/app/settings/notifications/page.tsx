import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../../lib/opportunities-ui';
import { PageHeader } from '../../../components/page-header';
import { PushNotificationsPanel } from '../../../components/push-notifications-panel';

export default function NotificationsSettingsPage() {
  if (!isOpportunitiesUiEnabled) notFound();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Notifications"
        subtitle="Get pushed when Benson finds something worth your attention."
      />
      <PushNotificationsPanel />
    </div>
  );
}
