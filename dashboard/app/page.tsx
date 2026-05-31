import Link from 'next/link';
import { api, type Campaign } from '../lib/api';
import { StatePill } from '../components/state-pill';
import { PlatformIcon } from '../components/icons';
import { getBranding, isBensonBranding } from '../lib/branding';
import {
  isOpportunitiesUiEnabled,
  opportunitiesUiCopy,
} from '../lib/opportunities-ui';
import {
  getTerminology,
  getTerminologyOverviewGreeting,
  getTerminologyOverviewSubline,
  isBensonTerminology,
} from '../lib/terminology';

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
    const requests: [Promise<{ campaigns: Campaign[] }> | null, Promise<MetricsRes>] = [
      isOpportunitiesUiEnabled ? null : api.get<{ campaigns: Campaign[] }>('/campaigns'),
      api.get<MetricsRes>('/metrics/overview'),
    ];
    const [c, m] = await Promise.all([
      requests[0] ?? Promise.resolve({ campaigns: [] as Campaign[] }),
      requests[1],
    ]);
    campaigns = c.campaigns;
    metrics = m;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  if (error) {
    return (
      <div className="border border-signal-alert p-6">
        <h2 className="text-signal-alert font-bold mb-2">[error] api unreachable</h2>
        <pre className="text-xs text-signal-alert whitespace-pre-wrap">{error}</pre>
        <p className="text-xs text-paper-muted mt-4">
          <span className="text-paper-ink">$ pnpm dev:db && pnpm seed && pnpm dev:api</span>
        </p>
      </div>
    );
  }

  const totalsByState = new Map<string, number>();
  for (const r of metrics?.states ?? []) totalsByState.set(r.state, r.count);

  const tiles: Array<{ label: string; count: number; tone: string; sub: string }> = [
    { label: 'planned',   count: totalsByState.get('planned') ?? 0, tone: 'text-paper-ink', sub: 'planned' },
    { label: 'in_flight', count: sumIn(totalsByState, ['script_drafted','script_approved','assets_ready','video_generating','video_ready','post_production','ready_to_publish']), tone: 'text-paper-ink', sub: 'in_flight' },
    { label: 'scheduled', count: totalsByState.get('scheduled') ?? 0, tone: 'text-paper-ink', sub: 'scheduled' },
    { label: 'published', count: totalsByState.get('published') ?? 0, tone: 'text-accent', sub: 'published' },
    { label: 'failed',    count: totalsByState.get('failed') ?? 0, tone: 'text-signal-alert', sub: 'failed' },
  ];

  const maxStateCount = Math.max(1, ...(metrics?.states.map((s) => s.count) ?? [1]));
  const branding = getBranding();
  const t = getTerminology();
  const tileSub = t.pages.overview.tileSubs;
  const resolvedTiles = tiles.map((tile) => ({
    ...tile,
    sub: tileSub[tile.sub as keyof typeof tileSub] ?? tile.sub,
  }));

  const overviewGreeting = isBensonBranding
    ? branding.overviewGreeting
    : isBensonTerminology
      ? getTerminologyOverviewGreeting()
      : isOpportunitiesUiEnabled
        ? '// opportunities across your workspace'
        : branding.overviewGreeting;
  const overviewSubline = isBensonBranding
    ? branding.overviewSubline
    : isBensonTerminology
      ? getTerminologyOverviewSubline()
      : isOpportunitiesUiEnabled
        ? 'Review pending items in approvals.'
        : undefined;

  return (
    <div className="space-y-16">
      {/* Heading */}
      <section>
        <div className="section-mark mb-3"><span>// §1 overview</span></div>
        <h1 className="text-5xl font-bold tracking-tightest cursor lowercase">overview</h1>
        <p className="text-paper-muted mt-2 italic">{overviewGreeting}</p>
        {overviewSubline && (
          <p className="text-paper-soft mt-1 text-sm">{overviewSubline}</p>
        )}
      </section>

      {/* Stats — hairline column rules, no boxes */}
      <section className="grid grid-cols-2 md:grid-cols-5 col-rule border-t-2 border-paper-ink pt-6">
        {resolvedTiles.map((tile) => (
          <div key={tile.label} className="px-6 first:pl-0 py-2">
            <div className="text-2xs text-paper-muted uppercase tracking-wider mb-3">{tile.label}</div>
            <div className={`text-5xl font-bold tabular-nums ${tile.tone}`}>
              {tile.count.toString().padStart(2, '0')}
            </div>
            <div className="text-xs text-paper-muted mt-2">// {tile.sub}</div>
          </div>
        ))}
      </section>

      {/* Campaigns — hidden when opportunities UI is enabled */}
      {!isOpportunitiesUiEnabled && (
      <section>
        <div className="section-mark mb-4"><span>{t.pages.overview.sourcesSection}</span></div>
        <div className="border-t-2 border-b-2 border-paper-ink">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-2xs uppercase tracking-wider text-paper-muted">
                <th className="text-left py-2 pr-4 font-medium">name</th>
                <th className="text-left py-2 px-4 font-medium">mode</th>
                <th className="text-left py-2 px-4 font-medium">cadence</th>
                <th className="text-left py-2 px-4 font-medium">platforms</th>
                <th className="text-right py-2 pl-4 font-medium">weekly</th>
              </tr>
            </thead>
            <tbody className="border-t border-paper-ink">
              {campaigns.map((c) => {
                const total =
                  c.weeklyTestimonials + c.weeklyCaseStudies + c.weeklyExplainers +
                  c.weeklyEducational + c.weeklyFounderMessages + c.weeklyIndustryInsights;
                return (
                  <tr key={c.id} className="border-t border-paper-edge align-top">
                    <td className="py-4 pr-4">
                      <Link href={`/campaigns/${c.id}`} className="link font-bold">{c.name}</Link>
                      <div className="text-xs text-paper-muted mt-1 italic">└─ {c.description?.toLowerCase()}</div>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`bracket ${c.autonomyMode === 'auto' ? 'text-accent' : c.autonomyMode === 'hitl' ? 'text-signal-warn' : 'text-paper-muted'}`}>
                        {c.autonomyMode}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-paper-soft">{c.postingSchedule}</td>
                    <td className="py-4 px-4">
                      <span className="inline-flex gap-3 text-paper-soft">
                        <PlatformIcon platform="instagram" className="h-3 w-3" />
                        <PlatformIcon platform="tiktok" className="h-3 w-3" />
                      </span>
                    </td>
                    <td className="py-4 pl-4 text-right tabular-nums">
                      <span className="font-bold">{total}</span>
                      <span className="text-paper-muted text-xs"> /wk</span>
                    </td>
                  </tr>
                );
              })}
              {campaigns.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-paper-muted">
                    [empty] run <code className="font-bold text-paper-ink">pnpm seed</code>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end mt-3">
          <Link href="/campaigns" className="link text-xs text-paper-muted hover:text-accent">{t.pages.overview.manageLink}</Link>
        </div>
      </section>
      )}

      {/* State distribution — ASCII bars */}
      <section>
        <div className="section-mark mb-4"><span>// §3 state distribution</span></div>
        <div className="space-y-1 font-mono text-sm">
          {metrics?.states.length ? (
            metrics.states
              .sort((a, b) => b.count - a.count)
              .map((s) => {
                const pct = (s.count / maxStateCount) * 100;
                const fill = '█'.repeat(Math.max(1, Math.round((pct / 100) * 60)));
                return (
                  <div key={s.state} className="flex items-baseline gap-4">
                    <div className="w-44 flex-shrink-0">
                      <StatePill state={s.state} />
                    </div>
                    <div className={`flex-1 ${s.state === 'published' ? 'text-accent' : s.state === 'failed' ? 'text-signal-alert' : s.state === 'script_drafted' ? 'text-signal-warn' : 'text-paper-soft'} overflow-hidden whitespace-nowrap`}>
                      {fill}
                    </div>
                    <div className="w-12 text-right tabular-nums font-bold">{s.count}</div>
                  </div>
                );
              })
          ) : (
            <div className="text-paper-muted italic">{t.pages.overview.noItems}</div>
          )}
        </div>
        {isOpportunitiesUiEnabled && (
          <div className="flex justify-end mt-3">
            <Link href="/opportunities" className="link text-xs text-paper-muted hover:text-accent">
              {opportunitiesUiCopy.overview.viewLink}
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

function sumIn(m: Map<string, number>, keys: string[]): number {
  let s = 0;
  for (const k of keys) s += m.get(k) ?? 0;
  return s;
}
