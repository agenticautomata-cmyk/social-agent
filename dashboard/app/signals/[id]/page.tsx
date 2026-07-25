import { SignalDetailPanel } from './signal-detail-panel';

export default async function SignalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="page-shell max-w-4xl mx-auto space-y-6">
      <SignalDetailPanel signalId={id} />
    </div>
  );
}
