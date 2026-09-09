import { Suspense } from 'react';
import { ContactBriefPanel } from '../../[id]/contact-brief-panel';

export default async function RecommendationBriefPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="studio-page-shell max-w-3xl mx-auto px-4 py-6">
      <Suspense fallback={<p className="text-sm text-paper-muted italic">Loading recommendation brief…</p>}>
        <ContactBriefPanel briefId={id} mode="recommendation" />
      </Suspense>
    </main>
  );
}
