import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../../../lib/opportunities-ui';
import { EquipmentManualDetailPanel } from './equipment-manual-detail-panel';

export default async function EquipmentManualDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!isOpportunitiesUiEnabled) notFound();
  const { id } = await params;
  return <EquipmentManualDetailPanel manualId={id} />;
}
