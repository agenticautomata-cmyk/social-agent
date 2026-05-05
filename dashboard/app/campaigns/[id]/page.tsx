import Link from 'next/link';
import { ChevronLeft, Languages, Clock4, Building2, Sparkles } from 'lucide-react';
import { api, type Campaign } from '../../../lib/api';
import { StatePill } from '../../../components/state-pill';
import { PlatformIcon } from '../../../components/icons';
import { AutonomyToggle } from './autonomy-toggle';
import { PlannerButton } from './planner-button';

interface Detail {
  campaign: Campaign;
  industries: Array<{ id: string; name: string; slug: string; weight: number }>;
  stateCounts: Record<string, number>;
}

export default async function CampaignDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await api.get<Detail>(`/campaigns/${id}`);
  const { campaign, industries, stateCounts } = detail;

  const orderedStates = [
    'planned', 'script_drafted', 'script_approved', 'assets_ready',
    'video_generating', 'video_ready', 'post_production',
    'ready_to_publish', 'scheduled', 'published', 'failed',
  ];

  const totalWeekly =
    campaign.weeklyTestimonials + campaign.weeklyCaseStudies + campaign.weeklyExplainers +
    campaign.weeklyEducational + campaign.weeklyFounderMessages + campaign.weeklyIndustryInsights;

  return (
    <div className="space-y-8">
      <Link href="/campaigns" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-200 transition">
        <ChevronLeft className="h-4 w-4" /> Campaigns
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{campaign.name}</h1>
          <p className="text-sm text-zinc-400 mt-1 max-w-2xl">{campaign.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <PlannerButton campaignId={campaign.id} />
          <AutonomyToggle campaignId={campaign.id} current={campaign.autonomyMode} />
        </div>
      </div>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile icon={Clock4} label="Posting" value={campaign.postingSchedule} sub={campaign.postingTimezone} />
        <Tile icon={Languages} label="Languages" value={(campaign.languages ?? ['en']).join(', ').toUpperCase()} />
        <Tile icon={Sparkles} label="Weekly target" value={String(totalWeekly)} sub="items per week" />
        <Tile icon={Building2} label="Industries" value={String(industries.length)} />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4 tracking-tight">Pipeline</h2>
        <div className="rounded-xl border border-border bg-bg-card p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {orderedStates.map((s) => (
              <div key={s} className="rounded-lg border border-border bg-bg-subtle/40 p-3.5 hover:border-border-subtle transition">
                <div className="mb-2.5">
                  <StatePill state={s} size="sm" />
                </div>
                <div className="text-2xl font-semibold tabular-nums text-zinc-100">{stateCounts[s] ?? 0}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4 tracking-tight">Publishing targets</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <PlatformCard platform="instagram" handle="@demobrand" />
          <PlatformCard platform="tiktok" handle="@demobrand" />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4 tracking-tight">Industries</h2>
        <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-zinc-500 bg-bg-subtle/50">
              <tr>
                <th className="text-left px-5 py-3 font-medium">Name</th>
                <th className="text-left px-5 py-3 font-medium">Slug</th>
                <th className="text-right px-5 py-3 font-medium">Rotation weight</th>
              </tr>
            </thead>
            <tbody>
              {industries.map((ind) => (
                <tr key={ind.id} className="border-t border-border">
                  <td className="px-5 py-3">{ind.name}</td>
                  <td className="px-5 py-3 font-mono text-xs text-zinc-400">{ind.slug}</td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums">{ind.weight}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4 tracking-tight">Brand</h2>
        <div className="rounded-xl border border-border bg-bg-card p-6 space-y-4 text-sm">
          <Field label="Voice" value={campaign.brandVoice} />
          <Field label="Default CTA" value={campaign.brandDefaultCta} />
        </div>
      </section>
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="tile-glow rounded-xl border border-border bg-bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</span>
        <Icon className="h-3.5 w-3.5 text-zinc-500" />
      </div>
      <div className="text-base font-mono text-zinc-100 tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function PlatformCard({ platform, handle }: { platform: 'instagram' | 'tiktok'; handle: string }) {
  return (
    <div className="rounded-xl border border-border bg-bg-card p-5 flex items-center gap-4">
      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${platform === 'instagram' ? 'bg-gradient-to-br from-fuchsia-500/20 to-amber-500/20 text-fuchsia-300' : 'bg-zinc-800 text-zinc-100'}`}>
        <PlatformIcon platform={platform} className="h-5 w-5" />
      </div>
      <div className="flex-1">
        <div className="font-medium capitalize">{platform}</div>
        <div className="text-xs text-zinc-500 font-mono">{handle}</div>
      </div>
      <span className="text-[11px] text-emerald-400 font-mono inline-flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-soft" />
        active
      </span>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1.5">{label}</div>
      <div className="text-zinc-200">{value || <span className="text-zinc-600">—</span>}</div>
    </div>
  );
}
