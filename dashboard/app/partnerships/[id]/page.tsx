import { PartnershipDetailPanel } from './partnership-detail-panel';

export default async function PartnershipDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="page-shell max-w-3xl mx-auto space-y-6">
      <PartnershipDetailPanel partnershipId={id} />
    </div>
  );
}
