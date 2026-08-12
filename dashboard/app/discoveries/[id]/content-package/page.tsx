import { ContentPackagePanel } from './content-package-panel';

export default async function ContentPackagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="max-w-2xl mx-auto p-5 md:p-8">
      <ContentPackagePanel contentItemId={id} />
    </main>
  );
}
