import { notFound } from 'next/navigation';
import Link from 'next/link';
import { isOpportunitiesUiEnabled } from '../../../../lib/opportunities-ui';
import { BusinessDetailPanel } from './business-detail-panel';

export default async function BusinessDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!isOpportunitiesUiEnabled) {
    notFound();
  }

  const { slug } = await params;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/sponsor-intelligence/businesses" className="text-xs link lowercase">
          ← sponsor intelligence v1
        </Link>
        <h1 className="text-2xl font-bold lowercase mt-2">business detail</h1>
      </div>
      <BusinessDetailPanel slug={slug} />
    </div>
  );
}
