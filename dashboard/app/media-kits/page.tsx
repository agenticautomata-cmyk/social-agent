import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../lib/opportunities-ui';
import { MediaKitsPanel } from './media-kits-panel';

export default function MediaKitsPage() {
  if (!isOpportunitiesUiEnabled) notFound();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold lowercase">media kit library</h1>
        <p className="text-sm text-paper-muted mt-2 max-w-2xl">
          Store sponsorship PDFs and collateral. Upload files directly or link external URLs, then send a kit to Benson for a sponsor-fit review.
        </p>
      </div>
      <MediaKitsPanel />
    </div>
  );
}
