import { DraftDetailPanel } from './draft-detail-panel';

export default async function DraftDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DraftDetailPanel draftId={id} />;
}
