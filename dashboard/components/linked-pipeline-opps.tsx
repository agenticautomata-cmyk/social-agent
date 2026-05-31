import Link from 'next/link';
import type { LinkedPipelineOpportunity } from '../lib/command-center-types';

export function LinkedPipelineOpps({
  opportunities,
}: {
  opportunities: LinkedPipelineOpportunity[] | undefined;
}) {
  if (!opportunities?.length) return null;

  return (
    <div className="text-2xs space-y-1 border-t border-paper-edge pt-2">
      <span className="uppercase text-paper-muted tracking-wider">sponsor deals</span>
      <ul className="space-y-1">
        {opportunities.map((opp) => (
          <li key={opp.id}>
            <Link href="/pipeline" className="hover:text-accent">
              {opp.sponsorBusinessName.toLowerCase()} — {opp.statusLabel.toLowerCase()}
              {opp.estimatedValue != null ? ` · $${opp.estimatedValue.toLocaleString()}` : ''}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
