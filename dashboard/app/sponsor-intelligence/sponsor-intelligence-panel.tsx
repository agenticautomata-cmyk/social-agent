'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { SponsorIntelligenceActions } from '../../components/sponsor-intelligence-actions';
import {
  scoreTone,
  type SponsorIntelligenceResponse,
  type SponsorRecommendation,
} from '../../lib/sponsor-intelligence-types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function ScorePill({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-2xs">
      <span className="text-paper-muted uppercase tracking-wider">{label}</span>
      <div className={`tabular-nums ${scoreTone(value)}`}>{value}</div>
    </div>
  );
}

function RecommendationCard({
  item,
  onAction,
}: {
  item: SponsorRecommendation;
  onAction: () => void;
}) {
  return (
    <article className="border-2 border-paper-edge p-4 space-y-3 bg-paper">
      <div>
        <h4 className="font-bold lowercase leading-snug">{item.businessName.toLowerCase()}</h4>
        <div className="text-2xs text-paper-muted mt-1">
          {item.category?.replace(/_/g, ' ') ?? 'general'}
          {item.sourceName ? ` · ${item.sourceName.toLowerCase()}` : ''}
        </div>
      </div>

      <p className="text-xs font-medium text-paper-ink italic">{item.recommendedPitchAngle}</p>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 border-y border-paper-edge py-3">
        <ScorePill label="sponsor fit" value={item.scores.sponsorFit} />
        <ScorePill label="audience" value={item.scores.audienceFit} />
        <ScorePill label="revenue" value={item.scores.revenuePotential} />
        <ScorePill label="confidence" value={item.scores.confidence} />
        <ScorePill label="priority" value={item.scores.contactFirst} />
      </div>

      <div className="space-y-2 text-xs text-paper-soft">
        <div>
          <span className="text-2xs uppercase text-paper-muted">Why Benson recommends</span>
          <p className="mt-0.5">{item.whyBensonRecommends}</p>
        </div>
        <div>
          <span className="text-2xs uppercase text-paper-muted">Expected audience fit</span>
          <p className="mt-0.5">{item.expectedAudienceFit}</p>
        </div>
        <div>
          <span className="text-2xs uppercase text-paper-muted">Content angle</span>
          <p className="mt-0.5">{item.suggestedContentAngle}</p>
        </div>
        <div>
          <span className="text-2xs uppercase text-paper-muted">Sponsorship angle</span>
          <p className="mt-0.5">{item.suggestedSponsorshipAngle}</p>
        </div>
      </div>

      <SponsorIntelligenceActions
        contentItemId={item.contentItemId}
        sponsorContactId={item.sponsorContactId}
        onAction={onAction}
      />

      <Link
        href={`/review/inventory?id=${item.contentItemId}`}
        className="inline-block text-2xs border border-paper-edge px-2 py-1 hover:border-paper-ink"
      >
        open opportunity
      </Link>
    </article>
  );
}

export function SponsorIntelligencePanel() {
  const [data, setData] = useState<SponsorIntelligenceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetch(`${API}/api/sponsor-intelligence?limit=6`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        return res.json() as Promise<SponsorIntelligenceResponse>;
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="space-y-10">
      {data?.demoMode && (
        <div className="border border-dashed border-paper-edge px-4 py-2 text-xs text-paper-muted">
          demo mode — rule-based scoring from inventory, CRM, planner, and analytics data
        </div>
      )}

      {data && (
        <section className="flex flex-wrap gap-3 text-2xs text-paper-muted">
          <span>{data.counts.totalEligible} eligible sponsors</span>
          <span>{data.counts.withLeads} with leads</span>
          <span>{data.counts.dismissed} dismissed</span>
          {data.analyticsAvailable && <span>analytics boost active</span>}
        </section>
      )}

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/sponsors" className="bracket hover:text-accent">sponsor CRM →</Link>
        <Link href="/outreach/compose" className="bracket hover:text-accent">compose outreach →</Link>
      </div>

      {error && (
        <div className="border-2 border-accent px-4 py-3 text-sm text-accent">// error: {error}</div>
      )}

      {loading && !data && (
        <div className="py-16 text-center text-paper-muted italic">// loading sponsor intelligence…</div>
      )}

      {data?.sections.map((section) => (
        <section key={section.id} className="space-y-4">
          <div className="border-l-4 border-paper-ink pl-4">
            <h2 className="text-lg font-bold lowercase">{section.title.toLowerCase()}</h2>
            <p className="text-2xs text-paper-muted mt-1 italic">{section.description}</p>
          </div>

          {section.items.length === 0 ? (
            <p className="text-sm text-paper-muted italic py-6 border border-dashed border-paper-edge text-center">
              // no strong matches in this lane right now
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {section.items.map((item) => (
                <RecommendationCard
                  key={`${section.id}-${item.contentItemId}`}
                  item={item}
                  onAction={() => void reload()}
                />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
