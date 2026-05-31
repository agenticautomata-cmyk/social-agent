import { notFound } from 'next/navigation';
import Link from 'next/link';
import { isOpportunitiesUiEnabled } from '../../lib/opportunities-ui';
import { PlannerHubPanel } from './planner-hub-panel';

export default function PlannerPage() {
  if (!isOpportunitiesUiEnabled) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold lowercase">content planner</h1>
          <p className="text-sm text-paper-muted mt-2 max-w-2xl">
            Save editor recommendations, organize them on planning boards, and schedule content
            for the week ahead.
          </p>
        </div>
        <div className="flex gap-4 text-sm">
          <Link href="/planner/shortlist" className="bracket hover:text-accent">
            shortlist →
          </Link>
          <Link href="/planner/week" className="bracket hover:text-accent">
            weekly plan →
          </Link>
        </div>
      </div>
      <PlannerHubPanel />
    </div>
  );
}
