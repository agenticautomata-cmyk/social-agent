import { notFound } from 'next/navigation';
import Link from 'next/link';
import { isOpportunitiesUiEnabled } from '../../../lib/opportunities-ui';
import { WeeklyPlannerPanel } from './weekly-planner-panel';

export default function WeeklyPlannerPage() {
  if (!isOpportunitiesUiEnabled) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <Link href="/planner" className="text-2xs text-paper-muted hover:text-paper-ink">
            ← planner
          </Link>
          <h1 className="text-2xl font-bold lowercase mt-2">weekly plan</h1>
          <p className="text-sm text-paper-muted mt-2 max-w-2xl">
            Monday through Sunday — planned opportunities grouped by day.
          </p>
        </div>
        <Link href="/planner/shortlist" className="bracket text-sm hover:text-accent">
          shortlist →
        </Link>
      </div>
      <WeeklyPlannerPanel />
    </div>
  );
}
