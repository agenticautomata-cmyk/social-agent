import Link from 'next/link';
import { api, type Campaign } from '../../../lib/api';
import { StatePill } from '../../../components/state-pill';
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

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Link href="/campaigns" className="text-sm text-zinc-500 hover:text-zinc-300">← Campaigns</Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{campaign.name}</h1>
          <p className="text-sm text-zinc-400 mt-1">{campaign.description}</p>
        </div>
        <div className="flex gap-2">
          <PlannerButton campaignId={campaign.id} />
          <AutonomyToggle campaignId={campaign.id} current={campaign.autonomyMode} />
        </div>
      </div>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Posting schedule" value={`${campaign.postingSchedule}`} sub={campaign.postingTimezone} />
        <Tile label="Languages" value={(campaign.languages ?? ['en']).join(', ')} />
        <Tile label="Total /week" value={String(
          campaign.weeklyTestimonials + campaign.weeklyCaseStudies + campaign.weeklyExplainers +
          campaign.weeklyEducational + campaign.weeklyFounderMessages + campaign.weeklyIndustryInsights
        )} />
        <Tile label="Industries" value={String(industries.length)} />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Pipeline</h2>
        <div className="rounded-lg border border-border bg-bg-card p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {orderedStates.map((s) => (
              <div key={s} className="rounded border border-border p-3">
                <div className="mb-2"><StatePill state={s} /></div>
                <div className="text-2xl font-semibold">{stateCounts[s] ?? 0}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Industries</h2>
        <div className="rounded-lg border border-border bg-bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-500 bg-bg-subtle">
              <tr>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Slug</th>
                <th className="text-right px-4 py-3">Weight</th>
              </tr>
            </thead>
            <tbody>
              {industries.map((ind) => (
                <tr key={ind.id} className="border-t border-border">
                  <td className="px-4 py-3">{ind.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-400">{ind.slug}</td>
                  <td className="px-4 py-3 text-right">{ind.weight}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Brand</h2>
        <div className="rounded-lg border border-border bg-bg-card p-5 space-y-3 text-sm">
          <Field label="Voice" value={campaign.brandVoice} />
          <Field label="Default CTA" value={campaign.brandDefaultCta} />
        </div>
      </section>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-lg font-mono mt-1">{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">{label}</div>
      <div className="text-zinc-300">{value || <span className="text-zinc-600">—</span>}</div>
    </div>
  );
}
