import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../lib/opportunities-ui';
import { EquipmentOverviewPanel } from './equipment-overview-panel';

export default function EquipmentPage() {
  if (!isOpportunitiesUiEnabled) notFound();
  return <EquipmentOverviewPanel />;
}
