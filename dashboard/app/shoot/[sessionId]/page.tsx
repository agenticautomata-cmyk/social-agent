import { ShootSessionPanel } from '../shoot-panels';

export default async function ShootSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return (
    <div className="page-shell space-y-4 max-w-lg mx-auto">
      <ShootSessionPanel sessionId={sessionId} />
    </div>
  );
}
