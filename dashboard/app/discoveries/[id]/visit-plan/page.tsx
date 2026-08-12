import { VisitPlanPanel } from './visit-plan-panel';

export default async function VisitPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="max-w-2xl mx-auto p-5 md:p-8">
      <VisitPlanPanel contentItemId={id} />
    </main>
  );
}
