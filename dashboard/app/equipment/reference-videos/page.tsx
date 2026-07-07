import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../../lib/opportunities-ui';
import { EquipmentReferenceVideosPanel } from './equipment-reference-videos-panel';

export default function EquipmentReferenceVideosPage() {
  if (!isOpportunitiesUiEnabled) notFound();
  return <EquipmentReferenceVideosPanel />;
}
