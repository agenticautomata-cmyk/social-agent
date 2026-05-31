import Link from 'next/link';
import { api, type Campaign } from '../../lib/api';
import { PlatformIcon } from '../../components/icons';
import { getTerminology } from '../../lib/terminology';

export default async function CampaignsPage() {
  const { campaigns } = await api.get<{ campaigns: Campaign[] }>('/campaigns');
  const t = getTerminology();

  return (
    <div className="space-y-12">
      <section>
        <div className="section-mark mb-3"><span>{t.pages.campaigns.section}</span></div>
        <h1 className="text-5xl font-bold tracking-tightest cursor lowercase">{t.pages.campaigns.title}</h1>
        <p className="text-paper-muted mt-2 italic">{t.pages.campaigns.subtitle}</p>
      </section>

      <section className="space-y-0">
        {campaigns.map((c, idx) => {
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
              className="group block border-t-2 border-paper-ink first:border-t-2 last:border-b-2 py-6 hover:bg-paper-tint transition-colors"
            >
              <div className="flex items-baseline justify-between gap-6 mb-3">
                <div className="flex items-baseline gap-3">
                  <span className="text-paper-muted text-sm tabular-nums">{(idx + 1).toString().padStart(2, '0')}.</span>
                  <h3 className="text-2xl font-bold lowercase group-hover:underline underline-offset-4">{c.name}</h3>
                </div>
                <span className={`bracket text-sm ${c.autonomyMode === 'auto' ? 'text-accent' : c.autonomyMode === 'hitl' ? 'text-signal-warn' : 'text-paper-muted'}`}>
                  {c.autonomyMode}
                </span>
              </div>

              <p className="text-paper-soft mb-4 max-w-3xl">└─ {c.description?.toLowerCase()}</p>

              <div className="grid grid-cols-2 md:grid-cols-6 gap-x-8 gap-y-3 text-sm">
                <Quota label="testimonials" n={c.weeklyTestimonials} />
                <Quota label="case_studies" n={c.weeklyCaseStudies} />
                <Quota label="explainers" n={c.weeklyExplainers} />
                <Quota label="educational" n={c.weeklyEducational} />
                <Quota label="founder" n={c.weeklyFounderMessages} />
                <Quota label="insights" n={c.weeklyIndustryInsights} />
              </div>

              <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 mt-5 text-2xs text-paper-muted">
                <span>cadence={c.postingSchedule}</span>
                <span>tz={c.postingTimezone}</span>
                <span>lang={(c.languages ?? ['en']).join(',')}</span>
                <span className="inline-flex items-center gap-2">
                  platforms=
                  <PlatformIcon platform="instagram" className="h-3 w-3" />
                  <PlatformIcon platform="tiktok" className="h-3 w-3" />
                </span>
                <span className="ml-auto font-bold text-paper-ink text-base tabular-nums">{total}<span className="text-paper-muted text-xs"> /wk</span></span>
              </div>
            </Link>
          );
        })}
      </section>
    </div>
  );
}

function Quota({ label, n }: { label: string; n: number }) {
  return (
    <div>
      <div className="text-2xs text-paper-muted">{label}</div>
      <div className="text-xl font-bold tabular-nums">
        {n}
        <span className="text-2xs text-paper-muted ml-1">/wk</span>
      </div>
    </div>
  );
}
