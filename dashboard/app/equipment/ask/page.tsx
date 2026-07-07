import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../../lib/opportunities-ui';
import { EquipmentAskPanel } from './equipment-ask-panel';

export default function EquipmentAskPage() {
  if (!isOpportunitiesUiEnabled) notFound();
  return <EquipmentAskPanel />;
}
