import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../lib/opportunities-ui';
import { ActionCenterPanel } from './action-center-panel';

export default function ActionsPage() {
  if (!isOpportunitiesUiEnabled) {
    notFound();
  }

  return <ActionCenterPanel />;
}
