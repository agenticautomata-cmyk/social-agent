import { api, type ContentItem } from '../../lib/api';
import { StatePill } from '../../components/state-pill';
import { displayFilterLabel, getTerminology } from '../../lib/terminology';

interface QueueResp {
  items: Array<{ item: ContentItem; industryName: string | null; personaName: string | null }>;
}

const STATE_FILTER_VALUES = [
  '',
  'planned',
  'script_drafted',
  'video_generating',
  'video_ready',
  'ready_to_publish',
  'scheduled',
  'published',
  'failed',
] as const;

export default async function QueuePage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const sp = await searchParams;
  const stateFilter = sp.state ?? '';
  const qs = stateFilter ? `?state=${stateFilter}&limit=200` : '?limit=200';
  const data = await api.get<QueueResp>(`/content${qs}`);
  const t = getTerminology();

  return (
    <div className="space-y-12">
      <section>
        <div className="section-mark mb-3"><span>{t.pages.queue.section}</span></div>
        <h1 className="text-5xl font-bold tracking-tightest cursor lowercase">{t.pages.queue.title}</h1>
        <p className="text-paper-muted mt-2 italic">{t.pages.queue.subtitle}</p>
      </section>

      {/* Filters as bracketed text-only links */}
      <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm border-y border-paper-edge py-3">
        <span className="text-paper-muted">filter:</span>
        {STATE_FILTER_VALUES.map((value) => {
          const active = stateFilter === value;
          return (
            <a
              key={value || 'all'}
              href={value ? `/queue?state=${value}` : '/queue'}
              className={`bracket transition ${active ? 'text-paper-ink font-bold' : 'text-paper-muted hover:text-paper-ink'}`}
            >
              {displayFilterLabel(value)}
            </a>
          );
        })}
      </nav>

      {/* Table — minimal borders */}
      <section className="border-t-2 border-b-2 border-paper-ink">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-2xs uppercase tracking-wider text-paper-muted">
              <th className="text-left py-2 pr-4 font-medium w-44">state</th>
              <th className="text-left py-2 px-4 font-medium w-32">type</th>
              <th className="text-left py-2 px-4 font-medium">{t.fields.title}</th>
              <th className="text-left py-2 px-4 font-medium">{t.fields.category}</th>
              <th className="text-left py-2 px-4 font-medium w-12">lang</th>
              <th className="text-right py-2 pl-4 font-medium w-44">updated</th>
            </tr>
          </thead>
          <tbody className="border-t border-paper-ink">
            {data.items.map(({ item, industryName }) => (
              <tr key={item.id} className="border-t border-paper-edge align-top hover:bg-paper-tint transition-colors">
                <td className="py-2 pr-4"><StatePill state={item.state} /></td>
                <td className="py-2 px-4 text-paper-soft text-xs">{item.type}</td>
                <td className="py-2 px-4 max-w-md">
                  {item.topic ? (
                    <div className="font-bold truncate">{item.topic.toLowerCase()}</div>
                  ) : (
                    <div className="text-paper-muted italic">// pending</div>
                  )}
                  {item.hook && (
                    <div className="text-2xs text-paper-muted mt-0.5 line-clamp-1">
                      └─ {item.hook.toLowerCase()}
                    </div>
                  )}
                </td>
                <td className="py-2 px-4 text-paper-soft text-xs">{industryName?.toLowerCase() ?? '—'}</td>
                <td className="py-2 px-4 text-paper-soft text-xs">{item.language}</td>
                <td className="py-2 pl-4 text-right text-2xs text-paper-muted tabular-nums">
                  {new Date(item.updatedAt).toLocaleString()}
                </td>
              </tr>
            ))}
            {data.items.length === 0 && (
              <tr>
                <td colSpan={6} className="py-16 text-center text-paper-muted">
                  {t.pages.queue.emptyFilter}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
