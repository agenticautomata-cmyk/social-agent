import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../../lib/opportunities-ui';
import { EquipmentManualsPanel } from './equipment-manuals-panel';

export default function EquipmentManualsPage() {
  if (!isOpportunitiesUiEnabled) notFound();
  return <EquipmentManualsPanel />;
}
