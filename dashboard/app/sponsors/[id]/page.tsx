import { notFound } from 'next/navigation';
import Link from 'next/link';
import { isOpportunitiesUiEnabled } from '../../../lib/opportunities-ui';
import { SponsorDetailPanel } from './sponsor-detail-panel';

export default async function SponsorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!isOpportunitiesUiEnabled) notFound();
  const { id } = await params;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/sponsors" className="text-2xs text-paper-muted hover:text-paper-ink">← sponsors</Link>
        <h1 className="text-2xl font-bold lowercase mt-2">sponsor contact</h1>
      </div>
      <SponsorDetailPanel id={id} />
    </div>
  );
}
