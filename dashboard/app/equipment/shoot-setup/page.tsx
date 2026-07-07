import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../../lib/opportunities-ui';
import { EquipmentShootSetupPanel } from './equipment-shoot-setup-panel';

export default function EquipmentShootSetupPage() {
  if (!isOpportunitiesUiEnabled) notFound();
  return <EquipmentShootSetupPanel />;
}
