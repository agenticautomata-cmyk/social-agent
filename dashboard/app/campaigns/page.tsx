import Link from 'next/link';
import { api, type Campaign } from '../../lib/api';

export default async function CampaignsPage() {
  const { campaigns } = await api.get<{ campaigns: Campaign[] }>('/campaigns');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Campaigns</h1>
        <p className="text-sm text-zinc-400">Configure quotas, autonomy, posting cadence.</p>
      </div>

      <div className="space-y-3">
        {campaigns.map((c) => (
          <Link
            key={c.id}
            href={`/campaigns/${c.id}`}
            className="block rounded-lg border border-border bg-bg-card p-5 hover:border-accent/50"
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="font-semibold text-lg">{c.name}</div>
                <div className="text-sm text-zinc-400 mt-0.5">{c.description}</div>
              </div>
              <span className={`text-xs font-mono px-2 py-1 rounded ${
                c.autonomyMode === 'auto' ? 'bg-emerald-900/40 text-emerald-300' :
                c.autonomyMode === 'hitl' ? 'bg-amber-900/40 text-amber-300' :
                'bg-zinc-800 text-zinc-400'
              }`}>
                {c.autonomyMode}
              </span>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mt-4">
              <Quota label="Testimonials" n={c.weeklyTestimonials} />
              <Quota label="Case studies" n={c.weeklyCaseStudies} />
              <Quota label="Explainers" n={c.weeklyExplainers} />
              <Quota label="Educational" n={c.weeklyEducational} />
              <Quota label="Founder" n={c.weeklyFounderMessages} />
              <Quota label="Insights" n={c.weeklyIndustryInsights} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Quota({ label, n }: { label: string; n: number }) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-lg font-mono mt-0.5">{n}<span className="text-xs text-zinc-500">/wk</span></div>
    </div>
  );
}
