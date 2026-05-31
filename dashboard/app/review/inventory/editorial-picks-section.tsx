'use client';

import {
  EDITORIAL_PANEL_ORDER,
  type EditorialPanelId,
  type EditorialPick,
  type EditorialPicksResponse,
} from '../../../lib/inventory-types';

function EditorialPickCard({
  pick,
  onSelect,
}: {
  pick: EditorialPick;
  onSelect: (id: string) => void;
}) {
  return (
    <article className="border border-paper-edge p-3 space-y-2 hover:bg-paper-tint transition-colors">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => onSelect(pick.id)}
          className="text-left font-bold lowercase leading-snug hover:text-accent"
        >
          {pick.title.toLowerCase()}
        </button>
        <span className="text-2xs tabular-nums text-paper-muted shrink-0 font-bold">
          {pick.scoreBreakdown.total} pts
        </span>
      </div>

      {pick.businessName && (
        <div className="text-2xs text-paper-muted truncate">{pick.businessName}</div>
      )}
      {pick.location && (
        <div className="text-2xs text-paper-soft truncate">{pick.location}</div>
      )}

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-2xs text-paper-muted">
        <span>{pick.category?.replace(/_/g, ' ') ?? 'uncategorized'}</span>
        <span>·</span>
        <span>{pick.sourceName?.toLowerCase() ?? 'unknown source'}</span>
      </div>

      <p className="text-2xs text-paper-soft leading-relaxed">
        {pick.whyItMatters ?? pick.whyRanked}
      </p>
      {pick.whyItMatters && pick.whyRanked !== pick.whyItMatters && (
        <p className="text-2xs text-paper-muted italic">{pick.whyRanked}</p>
      )}

      <div className="flex flex-wrap gap-1">
        {pick.scoreBreakdown.factors.slice(0, 5).map((factor) => (
          <span
            key={`${factor.label}-${factor.points}`}
            className="text-2xs px-1.5 py-0.5 border border-paper-edge text-paper-muted"
          >
            {factor.label} +{factor.points}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-3 pt-1 text-2xs">
        <button
          type="button"
          onClick={() => onSelect(pick.id)}
          className="bracket text-paper-muted hover:text-paper-ink"
        >
          details
        </button>
        {pick.sourceUrl && (
          <a
            href={pick.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="bracket text-paper-muted hover:text-paper-ink"
          >
            source
          </a>
        )}
      </div>
    </article>
  );
}

function EditorialPanel({
  panelId,
  title,
  description,
  items,
  onSelect,
}: {
  panelId: EditorialPanelId;
  title: string;
  description: string;
  items: EditorialPick[];
  onSelect: (id: string) => void;
}) {
  return (
    <section className="border border-paper-ink p-4 space-y-3">
      <div>
        <h3 className="text-sm font-bold lowercase">{title.toLowerCase()}</h3>
        <p className="text-2xs text-paper-muted mt-1 italic">{description}</p>
      </div>
      {items.length === 0 ? (
        <p className="text-2xs text-paper-muted italic py-4">// no picks for this panel right now</p>
      ) : (
        <div className="space-y-2">
          {items.map((pick) => (
            <EditorialPickCard key={`${panelId}-${pick.id}`} pick={pick} onSelect={onSelect} />
          ))}
        </div>
      )}
    </section>
  );
}

export function EditorialPicksSection({
  data,
  loading,
  onSelectItem,
}: {
  data: EditorialPicksResponse | null;
  loading: boolean;
  onSelectItem: (id: string) => void;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-paper-muted">
          Editorial picks
        </h2>
        <p className="text-2xs text-paper-muted mt-1 italic">
          // ranked for today&apos;s review — click a card for full detail
        </p>
      </div>

      {loading && !data && (
        <div className="py-8 text-center text-paper-muted italic text-sm">// loading editorial picks…</div>
      )}

      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {EDITORIAL_PANEL_ORDER.map((panelId) => {
            const panel = data.panels[panelId];
            return (
              <EditorialPanel
                key={panelId}
                panelId={panelId}
                title={panel.title}
                description={panel.description}
                items={panel.items}
                onSelect={onSelectItem}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
