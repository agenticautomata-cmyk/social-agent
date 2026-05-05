import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  Clock,
  Send,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';
import { api, type Campaign } from '../lib/api';
import { StatePill } from '../components/state-pill';
import { PlatformIcon } from '../components/icons';

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
      <div className="rounded-xl border border-rose-900/50 bg-rose-950/20 p-6">
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

  const tiles: Array<{ label: string; count: number; color: string; icon: LucideIcon; sub?: string }> = [
    { label: 'Planned',   count: totalsByState.get('planned') ?? 0,                                            color: 'text-zinc-200',     icon: CalendarClock,                                                                  sub: 'awaiting script'  },
    { label: 'In flight', count: sumIn(totalsByState, ['script_drafted','script_approved','assets_ready','video_generating','video_ready','post_production','ready_to_publish']), color: 'text-sky-400', icon: Activity, sub: 'workers active' },
    { label: 'Scheduled', count: totalsByState.get('scheduled') ?? 0,                                          color: 'text-emerald-400',  icon: Clock,                                                                          sub: 'publish queue'    },
    { label: 'Published', count: totalsByState.get('published') ?? 0,                                         color: 'text-emerald-300',  icon: Send,                                                                            sub: 'live on platforms' },
    { label: 'Failed',    count: totalsByState.get('failed') ?? 0,                                            color: 'text-rose-400',     icon: AlertTriangle,                                                                  sub: 'needs review'     },
  ];

  return (
    <div className="space-y-10">
      <section className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-zinc-400 mt-1">Pipeline health across all campaigns.</p>
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="tile-glow rounded-xl border border-border bg-bg-card p-4 transition hover:border-border-subtle"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] uppercase tracking-wider text-zinc-500">{t.label}</span>
              <t.icon className={`h-3.5 w-3.5 ${t.color}`} strokeWidth={2.25} />
            </div>
            <div className={`text-3xl font-semibold tabular-nums ${t.color}`}>{t.count}</div>
            {t.sub && <div className="text-[11px] text-zinc-500 mt-1">{t.sub}</div>}
          </div>
        ))}
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-lg font-semibold tracking-tight">Campaigns</h2>
          <Link href="/campaigns" className="text-sm text-accent hover:text-accent-400 inline-flex items-center gap-1 group">
            Manage
            <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
          </Link>
        </div>
        <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-zinc-500 bg-bg-subtle/50">
              <tr>
                <th className="text-left px-5 py-3 font-medium">Campaign</th>
                <th className="text-left px-5 py-3 font-medium">Mode</th>
                <th className="text-left px-5 py-3 font-medium">Schedule</th>
                <th className="text-left px-5 py-3 font-medium">Platforms</th>
                <th className="text-right px-5 py-3 font-medium">Weekly target</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-bg-subtle/40 transition group">
                  <td className="px-5 py-4">
                    <Link href={`/campaigns/${c.id}`} className="font-medium hover:text-accent inline-flex items-center gap-1.5 group">
                      {c.name}
                      <ArrowUpRight className="h-3 w-3 opacity-0 -translate-x-1 transition group-hover:opacity-100 group-hover:translate-x-0" />
                    </Link>
                    <div className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{c.description}</div>
                  </td>
                  <td className="px-5 py-4">
                    <ModeBadge mode={c.autonomyMode} />
                  </td>
                  <td className="px-5 py-4 font-mono text-xs text-zinc-400">
                    {c.postingSchedule}
                    <span className="text-zinc-600"> · {c.postingTimezone}</span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 text-zinc-500">
                      <PlatformIcon platform="instagram" className="h-4 w-4" />
                      <PlatformIcon platform="tiktok" className="h-4 w-4" />
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <span className="font-mono text-zinc-200 tabular-nums">
                      {c.weeklyTestimonials + c.weeklyCaseStudies + c.weeklyExplainers + c.weeklyEducational + c.weeklyFounderMessages + c.weeklyIndustryInsights}
                    </span>
                    <span className="text-zinc-500 text-xs ml-1">/wk</span>
                  </td>
                </tr>
              ))}
              {campaigns.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-zinc-500">
                    No campaigns yet. Run <code className="kbd">pnpm seed</code>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4 tracking-tight">State distribution</h2>
        <div className="rounded-xl border border-border bg-bg-card p-6">
          {metrics?.states.length ? (
            <div className="space-y-2.5">
              {metrics.states
                .sort((a, b) => b.count - a.count)
                .map((s) => {
                  const max = Math.max(...metrics!.states.map((x) => x.count));
                  return (
                    <div key={s.state} className="flex items-center gap-4">
                      <div className="w-44 flex-shrink-0">
                        <StatePill state={s.state} size="sm" />
                      </div>
                      <div className="flex-1 h-1.5 bg-bg-subtle rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-accent/60 to-accent rounded-full transition-all"
                          style={{ width: `${Math.max(2, (s.count / max) * 100)}%` }}
                        />
                      </div>
                      <div className="w-10 text-right text-xs font-mono text-zinc-400 tabular-nums">{s.count}</div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="text-sm text-zinc-500 text-center py-6">
              No content items yet — run the planner to start the pipeline.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ModeBadge({ mode }: { mode: string }) {
  const styles: Record<string, string> = {
    auto: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20',
    hitl: 'bg-amber-500/10 text-amber-400 ring-amber-500/20',
    manual: 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/20',
  };
  return (
    <span className={`inline-flex items-center text-[11px] font-mono px-2 py-0.5 rounded-full ring-1 ${styles[mode] ?? styles.manual}`}>
      {mode}
    </span>
  );
}

function sumIn(m: Map<string, number>, keys: string[]): number {
  let s = 0;
  for (const k of keys) s += m.get(k) ?? 0;
  return s;
}
