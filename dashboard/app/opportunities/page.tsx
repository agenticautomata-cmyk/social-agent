import { api, type ContentItem } from '../../lib/api';
import { StatePill } from '../../components/state-pill';
import {
  isOpportunitiesUiEnabled,
  mapContentRowToOpportunity,
  OPPORTUNITY_STATE_FILTER_VALUES,
  opportunitiesFilterHref,
  opportunitiesUiCopy,
} from '../../lib/opportunities-ui';
import { displayFilterLabel } from '../../lib/terminology';
import { notFound } from 'next/navigation';

interface ContentListResp {
  items: Array<{ item: ContentItem; industryName: string | null; personaName: string | null }>;
}

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (!isOpportunitiesUiEnabled) {
    notFound();
  }

  const sp = await searchParams;
  const stateFilter = sp.state ?? '';
  const qs = stateFilter ? `?state=${stateFilter}&limit=200` : '?limit=200';
  const data = await api.get<ContentListResp>(`/content${qs}`);
  const copy = opportunitiesUiCopy;

  const opportunities = data.items.map(({ item, industryName }) =>
    mapContentRowToOpportunity(item, industryName),
  );

  return (
    <div className="space-y-12">
      <section>
        <div className="section-mark mb-3"><span>{copy.section}</span></div>
        <h1 className="text-5xl font-bold tracking-tightest cursor lowercase">{copy.title}</h1>
        <p className="text-paper-muted mt-2 italic">{copy.subtitle}</p>
      </section>

      <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm border-y border-paper-edge py-3">
        <span className="text-paper-muted">filter:</span>
        {OPPORTUNITY_STATE_FILTER_VALUES.map((value) => {
          const active = stateFilter === value;
          return (
            <a
              key={value || 'all'}
              href={opportunitiesFilterHref(value)}
              className={`bracket transition ${active ? 'text-paper-ink font-bold' : 'text-paper-muted hover:text-paper-ink'}`}
            >
              {displayFilterLabel(value)}
            </a>
          );
        })}
      </nav>

      <section className="border-t-2 border-b-2 border-paper-ink">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-2xs uppercase tracking-wider text-paper-muted">
              <th className="text-left py-2 pr-4 font-medium w-44">state</th>
              <th className="text-left py-2 px-4 font-medium w-32">type</th>
              <th className="text-left py-2 px-4 font-medium">{copy.fields.title}</th>
              <th className="text-left py-2 px-4 font-medium">{copy.fields.category}</th>
              <th className="text-left py-2 px-4 font-medium w-12">lang</th>
              <th className="text-right py-2 pl-4 font-medium w-44">updated</th>
            </tr>
          </thead>
          <tbody className="border-t border-paper-ink">
            {opportunities.map((opp) => (
              <tr
                key={opp.id}
                className="border-t border-paper-edge align-top hover:bg-paper-tint transition-colors"
              >
                <td className="py-2 pr-4"><StatePill state={opp.state} /></td>
                <td className="py-2 px-4 text-paper-soft text-xs">{opp.type}</td>
                <td className="py-2 px-4 max-w-md">
                  {opp.title ? (
                    <div className="font-bold truncate">{opp.title.toLowerCase()}</div>
                  ) : (
                    <div className="text-paper-muted italic">// pending</div>
                  )}
                  {opp.angle && (
                    <div className="text-2xs text-paper-muted mt-0.5 line-clamp-1">
                      └─ {opp.angle.toLowerCase()}
                    </div>
                  )}
                </td>
                <td className="py-2 px-4 text-paper-soft text-xs">
                  {opp.category?.toLowerCase() ?? '—'}
                </td>
                <td className="py-2 px-4 text-paper-soft text-xs">{opp.language}</td>
                <td className="py-2 pl-4 text-right text-2xs text-paper-muted tabular-nums">
                  {new Date(opp.updatedAt).toLocaleString()}
                </td>
              </tr>
            ))}
            {opportunities.length === 0 && (
              <tr>
                <td colSpan={6} className="py-16 text-center text-paper-muted">
                  {copy.emptyFilter}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
