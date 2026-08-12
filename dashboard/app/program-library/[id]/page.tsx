import { ProgramLibraryDetailPanel } from './program-library-detail-panel';

export default async function ProgramLibraryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="studio-page-shell max-w-3xl mx-auto px-4 py-6">
      <ProgramLibraryDetailPanel programId={id} />
    </main>
  );
}
