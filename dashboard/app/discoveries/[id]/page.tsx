import { DiscoveryDetailPanel } from './discovery-detail-panel';

export default async function DiscoveryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="max-w-3xl mx-auto p-5 md:p-8">
      <DiscoveryDetailPanel contentItemId={id} />
    </main>
  );
}
