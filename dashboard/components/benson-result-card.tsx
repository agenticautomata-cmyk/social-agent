'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { AskBensonDecisionBrief } from '../lib/ask-benson-types';

export function BensonResultCard({ brief }: { brief: AskBensonDecisionBrief }) {
  const [expanded, setExpanded] = useState(false);
  const complete = brief.phase === 'complete';
  const primaryAction = brief.nextActions?.[0];

  return (
    <section className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/20">
      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-2xs font-bold uppercase tracking-wider text-paper-muted">
              {complete ? 'Research complete' : 'Research in progress'}
            </p>
            <h3 className="mt-1 text-sm font-semibold text-white">{brief.headline}</h3>
          </div>
          {brief.fitScore != null && (
            <span className="shrink-0 rounded-full border border-accent/30 bg-accent/10 px-2 py-1 text-2xs font-bold text-accent">
              Fit {brief.fitScore}
            </span>
          )}
        </div>

        {brief.entities.length > 0 && (
          <p className="text-xs text-paper-soft">
            {brief.entities.slice(0, 3).map((entity) => entity.name).join(' · ')}
          </p>
        )}
        {brief.localRelevance && <p className="text-xs text-paper-soft">{brief.localRelevance}</p>}
        {brief.provisionalSignals[0] && (
          <p className="text-xs leading-relaxed text-paper-soft">{brief.provisionalSignals[0]}</p>
        )}
        {brief.knownGaps[0] && (
          <p className="rounded-lg border border-amber-300/20 bg-amber-300/5 px-2.5 py-2 text-xs text-amber-100">
            Needs verification: {brief.knownGaps[0]}
          </p>
        )}
        {primaryAction && (
          <p className="text-xs font-medium text-white">Next: {primaryAction.action}</p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Link
            href={brief.partnershipHref}
            className="inline-flex min-h-[40px] items-center rounded-lg bg-accent/15 px-3 text-xs font-bold text-accent hover:bg-accent/20"
          >
            Open partnership
          </Link>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="min-h-[40px] rounded-lg border border-white/10 px-3 text-xs text-paper-soft hover:bg-white/[0.05]"
            aria-expanded={expanded}
          >
            {expanded ? 'Hide details' : 'Show details'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-white/10 bg-white/[0.025] p-3 text-xs text-paper-soft">
          {brief.provisionalSignals.length > 1 && (
            <DetailList title="Key signals" items={brief.provisionalSignals} />
          )}
          {brief.knownGaps.length > 1 && <DetailList title="Still checking" items={brief.knownGaps} />}
          {brief.storyAngles?.length ? (
            <DetailList title="Story angles" items={brief.storyAngles.map((item) => item.angle)} />
          ) : null}
          {brief.nextActions && brief.nextActions.length > 1 ? (
            <DetailList
              title="Next actions"
              items={brief.nextActions.map((item) => `${item.action} — ${item.why}`)}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1 font-bold uppercase tracking-wider text-paper-muted">{title}</p>
      <ul className="space-y-1.5">
        {items.slice(0, 6).map((item) => (
          <li key={item} className="flex gap-2">
            <span className="text-accent" aria-hidden>
              •
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
