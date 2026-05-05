import Link from 'next/link';
import { ArrowUpRight, Languages, Clock4, Building2 } from 'lucide-react';
import { api, type Campaign } from '../../lib/api';
import { PlatformIcon } from '../../components/icons';

export default async function CampaignsPage() {
  const { campaigns } = await api.get<{ campaigns: Campaign[] }>('/campaigns');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
        <p className="text-sm text-zinc-400 mt-1">Configure quotas, autonomy, posting cadence.</p>
      </div>

      <div className="grid gap-4">
        {campaigns.map((c) => {
          const total =
            c.weeklyTestimonials +
            c.weeklyCaseStudies +
            c.weeklyExplainers +
            c.weeklyEducational +
            c.weeklyFounderMessages +
            c.weeklyIndustryInsights;
          return (
            <Link
              key={c.id}
              href={`/campaigns/${c.id}`}
              className="group block rounded-xl border border-border bg-bg-card p-6 hover:border-accent/40 transition"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-lg tracking-tight group-hover:text-accent transition">
                      {c.name}
                    </h3>
                    <ArrowUpRight className="h-4 w-4 text-zinc-600 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition" />
                  </div>
                  <p className="text-sm text-zinc-400">{c.description}</p>
                </div>
                <ModeBadge mode={c.autonomyMode} />
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-zinc-500 mb-5">
                <span className="inline-flex items-center gap-1.5"><Clock4 className="h-3 w-3" /> {c.postingSchedule} · {c.postingTimezone}</span>
                <span className="inline-flex items-center gap-1.5"><Languages className="h-3 w-3" /> {(c.languages ?? ['en']).join(', ')}</span>
                <span className="inline-flex items-center gap-1.5"><Building2 className="h-3 w-3" /> 7 industries</span>
                <span className="inline-flex items-center gap-2 ml-auto">
                  <PlatformIcon platform="instagram" className="h-3.5 w-3.5" />
                  <PlatformIcon platform="tiktok" className="h-3.5 w-3.5" />
                </span>
              </div>

              <div className="grid grid-cols-3 md:grid-cols-6 gap-3 pt-4 border-t border-border">
                <Quota label="Testimonials" n={c.weeklyTestimonials} />
                <Quota label="Case studies" n={c.weeklyCaseStudies} />
                <Quota label="Explainers" n={c.weeklyExplainers} />
                <Quota label="Educational" n={c.weeklyEducational} />
                <Quota label="Founder" n={c.weeklyFounderMessages} />
                <Quota label="Insights" n={c.weeklyIndustryInsights} />
              </div>

              <div className="mt-4 pt-4 border-t border-border flex items-baseline justify-between">
                <span className="text-[11px] uppercase tracking-wider text-zinc-500">Total weekly target</span>
                <span className="font-mono text-lg tabular-nums">
                  {total}
                  <span className="text-xs text-zinc-500 ml-1">items / week</span>
                </span>
              </div>
            </Link>
          );
        })}
      </div>
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
    <span className={`inline-flex items-center text-[11px] font-mono px-2.5 py-1 rounded-full ring-1 ${styles[mode] ?? styles.manual}`}>
      {mode}
    </span>
  );
}

function Quota({ label, n }: { label: string; n: number }) {
  return (
    <div>
      <div className="text-[11px] text-zinc-500 mb-1">{label}</div>
      <div className="text-lg font-mono tabular-nums">
        {n}
        <span className="text-[10px] text-zinc-600 ml-0.5">/wk</span>
      </div>
    </div>
  );
}
