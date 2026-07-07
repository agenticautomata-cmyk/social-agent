'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  formatDate,
  formatLabel,
  formatNumber,
  type VideoBusinessDetailResponse,
} from '../../../../lib/video-business-intelligence-types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function BusinessDetailPanel({ slug }: { slug: string }) {
  const [data, setData] = useState<VideoBusinessDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetch(`${API}/api/sponsor-intelligence/video-businesses/${encodeURIComponent(slug)}`, {
      cache: 'no-store',
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        return res.json() as Promise<VideoBusinessDetailResponse>;
      })
      .then(setData)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load business');
      })
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading) {
    return <p className="text-sm text-paper-muted lowercase">loading business…</p>;
  }

  if (error || !data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-700 lowercase">{error ?? 'Business not found'}</p>
        <Link href="/sponsor-intelligence/businesses" className="text-xs link lowercase">
          back to sponsor intelligence v1
        </Link>
      </div>
    );
  }

  const { business, videos } = data;

  return (
    <div className="space-y-8">
      <section className="border-2 border-paper-edge p-5 bg-paper space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold lowercase">{business.businessName.toLowerCase()}</h2>
            <div className="flex flex-wrap gap-2 mt-2 text-2xs uppercase tracking-wider">
              <span
                className={`px-1.5 py-0.5 border ${
                  business.businessType === 'local'
                    ? 'border-emerald-700/40 text-emerald-800'
                    : 'border-paper-edge text-paper-muted'
                }`}
              >
                {business.businessType}
              </span>
              {business.eligibleForSponsorRecommendation && (
                <span className="px-1.5 py-0.5 border border-emerald-700/40 text-emerald-800">
                  sponsor candidate
                </span>
              )}
            </div>
          </div>
          {business.eligibleForSponsorRecommendation && (
            <div className="text-right">
              <div className="text-2xs uppercase tracking-wider text-paper-muted">sponsor score</div>
              <div className="text-3xl font-bold tabular-nums text-emerald-800">
                {business.sponsorScore.toFixed(1)}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <div className="text-2xs uppercase text-paper-muted">videos</div>
            <div className="font-semibold tabular-nums">{business.videoCount}</div>
          </div>
          <div>
            <div className="text-2xs uppercase text-paper-muted">total views</div>
            <div className="font-semibold tabular-nums">{formatNumber(business.totalViews)}</div>
          </div>
          <div>
            <div className="text-2xs uppercase text-paper-muted">engagement</div>
            <div className="font-semibold tabular-nums">
              {formatNumber(business.totalEngagement)}
            </div>
          </div>
          <div>
            <div className="text-2xs uppercase text-paper-muted">avg views / mention</div>
            <div className="font-semibold tabular-nums">
              {formatNumber(business.avgViewsPerMention)}
            </div>
          </div>
          <div>
            <div className="text-2xs uppercase text-paper-muted">location</div>
            <div>{formatLabel(business.primaryLocation)}</div>
          </div>
          <div>
            <div className="text-2xs uppercase text-paper-muted">category</div>
            <div>{formatLabel(business.primaryCategory)}</div>
          </div>
          <div>
            <div className="text-2xs uppercase text-paper-muted">first mention</div>
            <div>{formatDate(business.firstMentionDate)}</div>
          </div>
          <div>
            <div className="text-2xs uppercase text-paper-muted">last mention</div>
            <div>{formatDate(business.lastMentionDate)}</div>
          </div>
        </div>

        {business.eligibleForSponsorRecommendation && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 border-t border-paper-edge pt-4 text-2xs">
            <div>
              <span className="text-paper-muted uppercase">mention freq</span>
              <div className="tabular-nums">{business.scoreBreakdown.mentionFrequency}%</div>
            </div>
            <div>
              <span className="text-paper-muted uppercase">views</span>
              <div className="tabular-nums">{business.scoreBreakdown.totalViews}%</div>
            </div>
            <div>
              <span className="text-paper-muted uppercase">engagement</span>
              <div className="tabular-nums">{business.scoreBreakdown.engagement}%</div>
            </div>
            <div>
              <span className="text-paper-muted uppercase">local bonus</span>
              <div className="tabular-nums">{business.scoreBreakdown.localBonus}%</div>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold lowercase">videos mentioning this business ({videos.length})</h3>
        <div className="overflow-x-auto border-2 border-paper-edge">
          <table className="w-full text-xs lowercase">
            <thead className="bg-paper-warm text-2xs uppercase tracking-wider text-paper-muted">
              <tr>
                <th className="text-left px-3 py-2">posted</th>
                <th className="text-left px-3 py-2">caption</th>
                <th className="text-right px-3 py-2">views</th>
                <th className="text-right px-3 py-2">likes</th>
                <th className="text-right px-3 py-2">comments</th>
                <th className="text-right px-3 py-2">shares</th>
                <th className="text-left px-3 py-2">category</th>
                <th className="text-left px-3 py-2">location</th>
                <th className="text-left px-3 py-2">link</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((video) => (
                <tr key={video.videoId} className="border-t border-paper-edge">
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(video.publishedAt)}</td>
                  <td className="px-3 py-2 max-w-md">
                    <div className="truncate">{(video.title || video.caption || '—').slice(0, 120)}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatNumber(video.views)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatNumber(video.likes)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatNumber(video.comments)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatNumber(video.shares)}</td>
                  <td className="px-3 py-2">{formatLabel(video.contentCategory)}</td>
                  <td className="px-3 py-2">{formatLabel(video.locationTag)}</td>
                  <td className="px-3 py-2">
                    {video.postUrl ? (
                      <a
                        href={video.postUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link"
                      >
                        tiktok →
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
