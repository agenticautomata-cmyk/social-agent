import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../../lib/opportunities-ui';
import { EquipmentChecklistsPanel } from './equipment-checklists-panel';

export default function EquipmentChecklistsPage() {
  if (!isOpportunitiesUiEnabled) notFound();
  return <EquipmentChecklistsPanel />;
}
