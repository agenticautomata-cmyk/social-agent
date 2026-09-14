import { OpportunityDetailPanel } from './opportunity-detail-panel';

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <OpportunityDetailPanel contentItemId={id} />
    </div>
  );
}
