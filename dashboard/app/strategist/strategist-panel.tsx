'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  formatCost,
  formatNumber,
  formatPercentRate,
  type StrategistBriefingResponse,
} from '../../lib/strategist-types';
import { formatDateTime } from '../../lib/datetime';
import { BensonBriefingCard } from '../../components/benson-briefing-card';
import { OutcomeSummaryCard } from '../../components/outcome-summary-card';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function StrategistPanel() {
  const [data, setData] = useState<StrategistBriefingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetch(`${API}/api/strategist/briefing`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        return res.json() as Promise<StrategistBriefingResponse>;
      })
      .then(setData)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load strategist briefing');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="space-y-10">
      <BensonBriefingCard />
      <OutcomeSummaryCard compact />

      {loading && !data?.profile && (
        <p className="text-sm text-paper-muted lowercase">loading creator profile…</p>
      )}
      {error && <p className="text-sm text-red-700 lowercase">// {error}</p>}

      {data?.profile && (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-bold lowercase">creator profile snapshot</h2>
            <p className="text-xs text-paper-muted">
              Structured input sent to OpenAI — built from live analytics only.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="creator" value={`@${data.profile.creator}`} />
              <Stat label="data source" value={data.profile.dataSource} />
              <Stat label="30d views" value={formatNumber(data.profile.views30d)} />
              <Stat
                label="engagement rate"
                value={formatPercentRate(data.profile.engagementRate)}
              />
              <Stat
                label="videos / week"
                value={String(data.profile.postingFrequency.videosPerWeek)}
              />
              <Stat
                label="followers"
                value={
                  data.profile.audienceSignals.followersAvailable
                    ? formatNumber(data.profile.audienceSignals.followersCount ?? 0)
                    : 'unavailable'
                }
              />
              <Stat
                label="connected platforms"
                value={data.profile.audienceSignals.connectedPlatforms.join(', ') || 'none'}
              />
              <Stat label="total videos" value={String(data.profile.summaryStats.totalVideos)} />
            </div>
          </section>

          {data.profile.recommendedPostTimes.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-bold lowercase">saved posting-time analytics</h2>
              <p className="text-xs text-paper-muted">
                Exact local times from {data.profile.postingTimeAnalytics?.sampleSize ?? '—'} videos
                {data.profile.postingTimeAnalytics?.computedAt
                  ? ` · computed ${formatDateTime(data.profile.postingTimeAnalytics.computedAt)}`
                  : ''}
              </p>
              <ul className="grid md:grid-cols-2 gap-2 text-sm">
                {data.profile.recommendedPostTimes.map((slot) => (
                  <li key={slot.label} className="border border-paper-edge p-3 bg-paper">
                    <span className="font-semibold">{slot.label}</span>
                    <span className="text-paper-muted text-xs ml-2">
                      {slot.videoCount} videos · {formatNumber(slot.avgViews)} avg views ·{' '}
                      {slot.performanceIndex.toFixed(2)}× median
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.analysis && (
            <section className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold lowercase">full analysis</h2>
                <div className="text-2xs text-paper-muted tabular-nums">
                  {data.tokenUsage
                    ? `${data.tokenUsage.totalTokens.toLocaleString()} tokens · ${formatCost(data.estimatedCost)} · ${data.promptVersion}`
                    : null}
                </div>
              </div>

          <div className="grid md:grid-cols-2 gap-4">
            <AnalysisList
              title="what's working"
              items={
                data.analysis.whatsWorking && data.analysis.whatsWorking.length > 0
                  ? data.analysis.whatsWorking
                  : data.analysis.opportunities
              }
            />
            <AnalysisList
              title="what's not working"
              items={
                data.analysis.whatsNotWorking && data.analysis.whatsNotWorking.length > 0
                  ? data.analysis.whatsNotWorking
                  : data.analysis.risks
              }
            />
          </div>

          {data.analysis.recommendedActions && data.analysis.recommendedActions.length > 0 && (
            <AnalysisList title="recommended actions" items={data.analysis.recommendedActions} />
          )}

          <AnalysisList title="content recommendations" items={data.analysis.contentRecommendations} />
          <AnalysisList title="sponsor recommendations" items={data.analysis.sponsorRecommendations} />
          <AnalysisList title="schedule recommendations" items={data.analysis.scheduleRecommendations} />
          <AnalysisList title="experiments" items={data.analysis.experiments} />

          <div className="border-2 border-accent/30 p-4 bg-paper">
            <h3 className="text-2xs uppercase tracking-wider text-paper-muted">stop doing</h3>
            <p className="text-sm mt-2">{data.analysis.stopDoing}</p>
          </div>

          {data.analysis.bensonObservation && (
            <div className="border border-paper-edge p-4 bg-paper-tint italic text-sm">
              {data.analysis.bensonObservation}
            </div>
          )}
            </section>
          )}

          <details className="border-2 border-paper-edge p-4 bg-paper">
            <summary className="cursor-pointer text-sm font-bold lowercase">
              raw profile json (audit)
            </summary>
            <pre className="mt-4 text-2xs overflow-x-auto whitespace-pre-wrap break-words">
              {JSON.stringify(data.profile, null, 2)}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-paper-edge p-3">
      <div className="text-2xs uppercase tracking-wider text-paper-muted">{label}</div>
      <div className="font-semibold mt-1 lowercase break-words">{value}</div>
    </div>
  );
}

function AnalysisList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-sm font-bold uppercase tracking-wider mb-2">{title}</h3>
      <ul className="space-y-2 text-sm list-disc list-inside">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
