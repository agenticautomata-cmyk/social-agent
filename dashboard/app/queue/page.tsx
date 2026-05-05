import { api, type ContentItem } from '../../lib/api';
import { StatePill } from '../../components/state-pill';

interface QueueResp {
  items: Array<{ item: ContentItem; industryName: string | null; personaName: string | null }>;
}

const STATE_FILTERS = [
  { value: '', label: 'All' },
  { value: 'planned', label: 'Planned' },
  { value: 'script_drafted', label: 'Drafted' },
  { value: 'video_generating', label: 'Generating' },
  { value: 'video_ready', label: 'Video ready' },
  { value: 'ready_to_publish', label: 'Ready' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'published', label: 'Published' },
  { value: 'failed', label: 'Failed' },
];

export default async function QueuePage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const sp = await searchParams;
  const stateFilter = sp.state ?? '';
  const qs = stateFilter ? `?state=${stateFilter}&limit=200` : '?limit=200';
  const data = await api.get<QueueResp>(`/content${qs}`);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Queue</h1>
        <p className="text-sm text-zinc-400">All content items, all states.</p>
      </div>

      <div className="flex flex-wrap gap-1">
        {STATE_FILTERS.map((f) => (
          <a
            key={f.value || 'all'}
            href={f.value ? `/queue?state=${f.value}` : '/queue'}
            className={`px-3 py-1.5 text-xs font-mono rounded-md transition ${
              stateFilter === f.value
                ? 'bg-accent text-white'
                : 'bg-bg-card border border-border text-zinc-400 hover:bg-bg-subtle'
            }`}
          >
            {f.label}
          </a>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-zinc-500 bg-bg-subtle">
            <tr>
              <th className="text-left px-4 py-3">State</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">Topic</th>
              <th className="text-left px-4 py-3">Industry</th>
              <th className="text-left px-4 py-3">Lang</th>
              <th className="text-right px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map(({ item, industryName }) => (
              <tr key={item.id} className="border-t border-border hover:bg-bg-subtle">
                <td className="px-4 py-3"><StatePill state={item.state} /></td>
                <td className="px-4 py-3 text-zinc-400 font-mono text-xs">{item.type}</td>
                <td className="px-4 py-3">
                  <div className="font-medium">{item.topic || <span className="text-zinc-600">— pending —</span>}</div>
                  {item.hook && <div className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{item.hook}</div>}
                </td>
                <td className="px-4 py-3 text-zinc-400">{industryName ?? '—'}</td>
                <td className="px-4 py-3 text-zinc-400 font-mono text-xs uppercase">{item.language}</td>
                <td className="px-4 py-3 text-right text-xs font-mono text-zinc-500">
                  {new Date(item.updatedAt).toLocaleString()}
                </td>
              </tr>
            ))}
            {data.items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-zinc-500">No items.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
