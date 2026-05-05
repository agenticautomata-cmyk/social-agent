import { Search } from 'lucide-react';
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
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Queue</h1>
        <p className="text-sm text-zinc-400 mt-1">All content items, all states.</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATE_FILTERS.map((f) => (
          <a
            key={f.value || 'all'}
            href={f.value ? `/queue?state=${f.value}` : '/queue'}
            className={`px-3 py-1.5 text-xs font-mono rounded-lg transition ${
              stateFilter === f.value
                ? 'bg-accent text-white shadow-glow-accent'
                : 'bg-bg-card border border-border text-zinc-400 hover:bg-bg-subtle hover:text-zinc-200'
            }`}
          >
            {f.label}
          </a>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-zinc-500 bg-bg-subtle/50">
            <tr>
              <th className="text-left px-5 py-3 font-medium">State</th>
              <th className="text-left px-5 py-3 font-medium">Type</th>
              <th className="text-left px-5 py-3 font-medium">Topic</th>
              <th className="text-left px-5 py-3 font-medium">Industry</th>
              <th className="text-left px-5 py-3 font-medium">Lang</th>
              <th className="text-right px-5 py-3 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map(({ item, industryName }) => (
              <tr key={item.id} className="border-t border-border hover:bg-bg-subtle/40 transition">
                <td className="px-5 py-3"><StatePill state={item.state} size="sm" /></td>
                <td className="px-5 py-3 text-zinc-400 font-mono text-xs">{item.type}</td>
                <td className="px-5 py-3 max-w-md">
                  <div className="font-medium truncate">{item.topic || <span className="text-zinc-600">— pending —</span>}</div>
                  {item.hook && <div className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{item.hook}</div>}
                </td>
                <td className="px-5 py-3 text-zinc-400">{industryName ?? '—'}</td>
                <td className="px-5 py-3 text-zinc-500 font-mono text-xs uppercase">{item.language}</td>
                <td className="px-5 py-3 text-right text-xs font-mono text-zinc-500 tabular-nums">
                  {new Date(item.updatedAt).toLocaleString()}
                </td>
              </tr>
            ))}
            {data.items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-16 text-center text-zinc-500">
                  <Search className="h-6 w-6 mx-auto mb-2 text-zinc-700" />
                  <p>No items match this filter.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
