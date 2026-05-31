import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../lib/opportunities-ui';
import { PipelinePanel } from './pipeline-panel';

export default function PipelinePage() {
  if (!isOpportunitiesUiEnabled) notFound();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold lowercase">sponsor pipeline</h1>
        <p className="text-sm text-paper-muted mt-2 max-w-3xl">
          Track sponsor deals from first contact through won or lost. Link opportunities to content
          planner lists for campaign alignment.
        </p>
      </div>
      <PipelinePanel />
    </div>
  );
}
