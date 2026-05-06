import Link from 'next/link';
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
    <div className="space-y-12">
      <Link href="/campaigns" className="link text-sm text-paper-muted hover:text-paper-ink">← back to campaigns</Link>

      {/* Heading */}
      <section>
        <div className="section-mark mb-3"><span>// campaign / {campaign.name.toLowerCase().replace(/\s+/g, '_')}</span></div>
        <div className="flex items-end justify-between gap-6">
          <div>
            <h1 className="text-5xl font-bold tracking-tightest cursor lowercase">{campaign.name.toLowerCase()}</h1>
            <p className="text-paper-muted mt-2 italic">└─ {campaign.description?.toLowerCase()}</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <PlannerButton campaignId={campaign.id} />
            <AutonomyToggle campaignId={campaign.id} current={campaign.autonomyMode} />
          </div>
        </div>
      </section>

      {/* Key fields */}
      <section className="grid grid-cols-2 lg:grid-cols-4 col-rule border-t-2 border-b-2 border-paper-ink py-6">
        <Field label="cadence" value={campaign.postingSchedule} sub={campaign.postingTimezone} />
        <Field label="languages" value={(campaign.languages ?? ['en']).join(', ')} />
        <Field label="weekly" value={totalWeekly.toString()} sub="items / week" highlight />
        <Field label="industries" value={industries.length.toString()} />
      </section>

      {/* Pipeline */}
      <section>
        <div className="section-mark mb-4"><span>// pipeline</span></div>
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {orderedStates.map((s) => {
            const count = stateCounts[s] ?? 0;
            return (
              <div key={s} className="border-t border-paper-ink pt-2">
                <div className="mb-2"><StatePill state={s} /></div>
                <div className="text-3xl font-bold tabular-nums">{count.toString().padStart(2, '0')}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Publishing targets */}
      <section>
        <div className="section-mark mb-4"><span>// publishing_targets</span></div>
        <div className="grid sm:grid-cols-2 gap-0 border-t-2 border-b-2 border-paper-ink">
          <PlatformRow platform="instagram" handle="@demobrand" />
          <PlatformRow platform="tiktok" handle="@demobrand" border />
        </div>
      </section>

      {/* Industries table */}
      <section>
        <div className="section-mark mb-4"><span>// industries</span></div>
        <div className="border-t-2 border-b-2 border-paper-ink">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-2xs uppercase tracking-wider text-paper-muted">
                <th className="text-left py-2 pr-4 font-medium">name</th>
                <th className="text-left py-2 px-4 font-medium">slug</th>
                <th className="text-right py-2 pl-4 font-medium">rotation_weight</th>
              </tr>
            </thead>
            <tbody className="border-t border-paper-ink">
              {industries.map((ind, idx) => (
                <tr key={ind.id} className="border-t border-paper-edge">
                  <td className="py-2 pr-4">
                    <span className="text-paper-muted text-xs tabular-nums mr-2">{(idx + 1).toString().padStart(2, '0')}.</span>
                    {ind.name}
                  </td>
                  <td className="py-2 px-4 text-paper-soft">{ind.slug}</td>
                  <td className="py-2 pl-4 text-right tabular-nums">{ind.weight}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Brand */}
      <section>
        <div className="section-mark mb-4"><span>// brand</span></div>
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="text-2xs uppercase tracking-wider text-paper-muted mb-1">voice</dt>
            <dd>{campaign.brandVoice || <span className="text-paper-muted italic">// none</span>}</dd>
          </div>
          <div>
            <dt className="text-2xs uppercase tracking-wider text-paper-muted mb-1">default_cta</dt>
            <dd>{campaign.brandDefaultCta || <span className="text-paper-muted italic">// none</span>}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function Field({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className="px-6 first:pl-0">
      <div className="text-2xs uppercase tracking-wider text-paper-muted mb-2">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${highlight ? 'text-accent' : ''}`}>{value}</div>
      {sub && <div className="text-2xs text-paper-muted mt-1">// {sub}</div>}
    </div>
  );
}

function PlatformRow({ platform, handle, border }: { platform: 'instagram' | 'tiktok'; handle: string; border?: boolean }) {
  return (
    <div className={`flex items-center gap-4 py-4 px-6 ${border ? 'border-l border-paper-edge' : ''}`}>
      <PlatformIcon platform={platform} className="h-4 w-4" />
      <div className="flex-1">
        <div className="text-sm font-bold lowercase">{platform}</div>
        <div className="text-2xs text-paper-muted">{handle}</div>
      </div>
      <span className="bracket text-2xs text-accent">active</span>
    </div>
  );
}
