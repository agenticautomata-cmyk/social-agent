import Link from 'next/link';
import { api, type Campaign } from '../lib/api';
import { StatePill } from '../components/state-pill';

interface MetricsRes {
  states: Array<{ state: string; count: number }>;
  last7d: Array<{ day: string; planned: number; published: number }>;
  platforms: Array<{ platform: string; published: number }>;
}

export default async function HomePage() {
  let campaigns: Campaign[] = [];
  let metrics: MetricsRes | null = null;
  let error: string | null = null;

  try {
    const [c, m] = await Promise.all([
      api.get<{ campaigns: Campaign[] }>('/campaigns'),
      api.get<MetricsRes>('/metrics/overview'),
    ]);
    campaigns = c.campaigns;
    metrics = m;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  if (error) {
    return (
      <div className="rounded-lg border border-rose-900 bg-rose-950/40 p-6">
        <h2 className="text-rose-300 font-semibold mb-2">API unreachable</h2>
        <p className="text-sm text-rose-400/80 mb-3">
          Could not reach the API at <code className="font-mono">{process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}</code>.
        </p>
        <p className="text-xs font-mono text-rose-500">{error}</p>
        <p className="text-xs text-zinc-400 mt-4">
          Boot the stack: <code className="font-mono text-zinc-200">pnpm dev:db && pnpm seed && pnpm dev:api</code>
        </p>
      </div>
    );
  }

  const totalsByState = new Map<string, number>();
  for (const r of metrics?.states ?? []) totalsByState.set(r.state, r.count);

  const statTiles: Array<[string, number, string]> = [
    ['Planned', totalsByState.get('planned') ?? 0, 'text-zinc-300'],
    ['In flight', sumIn(totalsByState, ['script_drafted', 'script_approved', 'assets_ready', 'video_generating', 'video_ready', 'post_production', 'ready_to_publish']), 'text-sky-300'],
    ['Scheduled', totalsByState.get('scheduled') ?? 0, 'text-emerald-300'],
    ['Published', totalsByState.get('published') ?? 0, 'text-emerald-200'],
    ['Failed', totalsByState.get('failed') ?? 0, 'text-rose-300'],
  ];

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold mb-1">Overview</h1>
        <p className="text-sm text-zinc-400">Pipeline health across all campaigns.</p>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {statTiles.map(([label, count, color]) => (
          <div key={label} className="rounded-lg border border-border bg-bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
            <div className={`text-3xl font-semibold mt-2 ${color}`}>{count}</div>
          </div>
        ))}
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-semibold">Campaigns</h2>
          <Link href="/campaigns" className="text-sm text-accent hover:underline">Manage →</Link>
        </div>
        <div className="rounded-lg border border-border bg-bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-500 bg-bg-subtle">
              <tr>
                <th className="text-left px-4 py-3">Campaign</th>
                <th className="text-left px-4 py-3">Mode</th>
                <th className="text-left px-4 py-3">Schedule</th>
                <th className="text-right px-4 py-3">Weekly target</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-bg-subtle">
                  <td className="px-4 py-3">
                    <Link href={`/campaigns/${c.id}`} className="font-medium hover:text-accent">
                      {c.name}
                    </Link>
                    <div className="text-xs text-zinc-500">{c.description}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-mono px-2 py-0.5 rounded ${c.autonomyMode === 'auto' ? 'bg-emerald-900/40 text-emerald-300' : c.autonomyMode === 'hitl' ? 'bg-amber-900/40 text-amber-300' : 'bg-zinc-800 text-zinc-400'}`}>
                      {c.autonomyMode}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-400">{c.postingSchedule} {c.postingTimezone}</td>
                  <td className="px-4 py-3 text-right text-zinc-300">
                    {c.weeklyTestimonials + c.weeklyCaseStudies + c.weeklyExplainers + c.weeklyEducational + c.weeklyFounderMessages + c.weeklyIndustryInsights}
                    <span className="text-zinc-500"> /wk</span>
                  </td>
                </tr>
              ))}
              {campaigns.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                    No campaigns yet. Run <code className="font-mono text-zinc-300">pnpm seed</code> to create the demo campaign.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">State distribution</h2>
        <div className="rounded-lg border border-border bg-bg-card p-5">
          {metrics?.states.length ? (
            <div className="space-y-2">
              {metrics.states
                .sort((a, b) => b.count - a.count)
                .map((s) => (
                  <div key={s.state} className="flex items-center gap-3">
                    <div className="w-44"><StatePill state={s.state} /></div>
                    <div className="flex-1 h-2 bg-bg-subtle rounded overflow-hidden">
                      <div
                        className="h-full bg-accent/60"
                        style={{ width: `${Math.min(100, (s.count / Math.max(...metrics!.states.map((x) => x.count))) * 100)}%` }}
                      />
                    </div>
                    <div className="w-12 text-right text-sm font-mono text-zinc-400">{s.count}</div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="text-sm text-zinc-500">No content items yet — run the planner.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function sumIn(m: Map<string, number>, keys: string[]): number {
  let s = 0;
  for (const k of keys) s += m.get(k) ?? 0;
  return s;
}
