'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { clientApiUrl } from '../../../../lib/client-api';
import { formatDate } from '../../../../lib/datetime';
import type {
  CommentInsight,
  OperatorRecommendation,
  PostPackage,
  TikTokCommandCenter,
} from '../../../../lib/tiktok-operator-types';
import { RECOMMENDATION_LABELS } from '../../../../lib/tiktok-operator-types';

function copyText(text: string) {
  void navigator.clipboard.writeText(text);
}

function MetricPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-paper-edge px-3 py-2 min-w-[7rem]">
      <div className="text-2xs uppercase text-paper-muted tracking-wider">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

function PackageEditor({
  pkg,
  onChange,
  onSave,
  busy,
}: {
  pkg: PostPackage;
  onChange: (patch: Partial<PostPackage>) => void;
  onSave: () => void;
  busy: boolean;
}) {
  const hashtagLine = pkg.hashtags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ');

  return (
    <div className="border-2 border-paper-ink bg-paper-tint p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold lowercase">Ready for TikTok</h3>
        <span className="text-2xs uppercase text-paper-muted">{pkg.status.replace(/_/g, ' ')}</span>
      </div>
      <label className="block text-2xs uppercase text-paper-muted">
        hook
        <input
          className="mt-1 w-full border border-paper-edge bg-paper px-2 py-1 text-sm"
          value={pkg.hook ?? ''}
          onChange={(e) => onChange({ hook: e.target.value })}
        />
      </label>
      <label className="block text-2xs uppercase text-paper-muted">
        caption
        <textarea
          className="mt-1 w-full border border-paper-edge bg-paper px-2 py-2 text-sm min-h-[120px]"
          value={pkg.caption}
          onChange={(e) => onChange({ caption: e.target.value })}
        />
      </label>
      <label className="block text-2xs uppercase text-paper-muted">
        hashtags (comma-separated)
        <input
          className="mt-1 w-full border border-paper-edge bg-paper px-2 py-1 text-sm"
          value={pkg.hashtags.join(', ')}
          onChange={(e) =>
            onChange({
              hashtags: e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        />
      </label>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-2xs text-paper-muted">
        <div>cover: {pkg.coverText ?? '—'}</div>
        <div>first comment: {pkg.firstComment ?? '—'}</div>
        <div>suggested time: {pkg.suggestedPostTime ? formatDate(pkg.suggestedPostTime) : '—'}</div>
        <div>theme: {pkg.contentTheme ?? '—'}</div>
      </div>
      {pkg.checklist.length > 0 && (
        <ul className="text-xs space-y-1 list-disc pl-4">
          {pkg.checklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost text-xs" onClick={() => copyText(pkg.caption)}>
          Copy caption
        </button>
        <button type="button" className="btn-ghost text-xs" onClick={() => copyText(hashtagLine)}>
          Copy hashtags
        </button>
        <button
          type="button"
          className="btn-ghost text-xs"
          onClick={() =>
            copyText(
              [pkg.hook, pkg.caption, hashtagLine, pkg.coverText, pkg.firstComment]
                .filter(Boolean)
                .join('\n\n'),
            )
          }
        >
          Copy full package
        </button>
        <a
          href="https://www.tiktok.com/upload"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary text-xs py-2 min-h-[36px] px-3"
        >
          Open TikTok
        </a>
        <button type="button" className="btn-ghost text-xs" disabled={busy} onClick={onSave}>
          Save edits
        </button>
      </div>
    </div>
  );
}

function RecommendationCard({
  rec,
  onAccept,
  onDismiss,
  onPrepare,
  onSequel,
  onProof,
  onRepeat,
  busy,
}: {
  rec: OperatorRecommendation;
  onAccept: () => void;
  onDismiss: () => void;
  onPrepare: () => void;
  onSequel: () => void;
  onProof: () => void;
  onRepeat: () => void;
  busy: string | null;
}) {
  const perf = rec.supportingMetrics.performanceIndex as number | undefined;
  return (
    <article className="border-2 border-paper-edge p-4 space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-2xs uppercase border border-paper-edge px-1.5 py-0.5">
          {RECOMMENDATION_LABELS[rec.recommendationType] ?? rec.recommendationType}
        </span>
        {perf != null && (
          <span className="text-2xs text-accent font-bold tabular-nums">{perf.toFixed(1)}× avg</span>
        )}
        <span className="text-2xs text-paper-muted ml-auto">{rec.status}</span>
      </div>
      <h4 className="font-bold lowercase leading-snug">{rec.title.toLowerCase()}</h4>
      <p className="text-sm text-paper-muted">{rec.explanation}</p>
      {rec.sourceVideo && (
        <p className="text-2xs text-paper-dim truncate">
          source: {rec.sourceVideo.title ?? rec.sourceVideo.caption ?? rec.sourceVideo.videoId}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary text-xs py-2 min-h-[36px] px-3" disabled={!!busy} onClick={onPrepare}>
          Prepare for TikTok
        </button>
        <button type="button" className="btn-ghost text-xs" disabled={!!busy} onClick={onAccept}>
          Accept
        </button>
        {rec.recommendationType === 'make_sequel' && (
          <button type="button" className="btn-ghost text-xs" disabled={!!busy} onClick={onSequel}>
            Make a sequel
          </button>
        )}
        {rec.recommendationType === 'build_sponsor_proof' && rec.sourceVideo && (
          <button type="button" className="btn-ghost text-xs" disabled={!!busy} onClick={onProof}>
            Build sponsor proof
          </button>
        )}
        {rec.recommendationType === 'repeat_format' && rec.sourceVideo && (
          <button type="button" className="btn-ghost text-xs" disabled={!!busy} onClick={onRepeat}>
            Repeat this format
          </button>
        )}
        <button type="button" className="btn-ghost text-xs text-paper-muted" disabled={!!busy} onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </article>
  );
}

export function TikTokOperatorPanel() {
  const searchParams = useSearchParams();
  const focusRec = searchParams.get('rec');
  const focusPkg = searchParams.get('pkg');

  const [data, setData] = useState<TikTokCommandCenter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [activePackage, setActivePackage] = useState<PostPackage | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetch(clientApiUrl('/api/tiktok-operator/command-center'), { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        return res.json() as Promise<TikTokCommandCenter>;
      })
      .then((hub) => {
        setData(hub);
        const pkg =
          (focusPkg && hub.postPackages.find((p) => p.id === focusPkg)) ||
          hub.readyToExecute[0] ||
          null;
        setActivePackage(pkg);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [focusPkg]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const focusedRec = useMemo(
    () => (focusRec && data ? data.recommendations.find((r) => r.id === focusRec) : null),
    [data, focusRec],
  );

  async function apiPost(path: string, body?: unknown) {
    const res = await fetch(clientApiUrl(path), {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function apiPatch(path: string, body: unknown) {
    const res = await fetch(clientApiUrl(path), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function handlePrepare(rec: OperatorRecommendation) {
    setBusy(rec.id);
    try {
      const json = (await apiPost(`/api/tiktok-operator/recommendations/${rec.id}/prepare`)) as {
        package: PostPackage;
      };
      setActivePackage(json.package);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Prepare failed');
    } finally {
      setBusy(null);
    }
  }

  if (loading && !data) {
    return <div className="py-16 text-center text-paper-muted italic">// loading TikTok command center…</div>;
  }

  if (error && !data) {
    return (
      <div className="border-2 border-accent px-4 py-3 text-sm text-accent">
        // error: {error}
        <button type="button" className="block mt-2 underline" onClick={() => void reload()}>
          retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-10">
      {!data.hasData && (
        <div className="border border-dashed border-paper-edge p-6 text-center space-y-2">
          <p className="font-bold lowercase">no TikTok data yet</p>
          <p className="text-sm text-paper-muted italic">
            Connect TikTok or import CSV — Benson will turn performance into operator moves.
          </p>
          <Link href="/analytics/tiktok/connect" className="btn-primary text-xs inline-block mt-2">
            Connect TikTok
          </Link>
        </div>
      )}

      {(data.capabilities.reauthorizeNeeded || data.capabilities.permissionsMissing.length > 0) && (
        <div className="border border-paper-edge px-4 py-3 text-xs space-y-1">
          <div className="font-bold uppercase tracking-wider text-2xs">TikTok API readiness</div>
          {data.capabilities.reauthorizeNeeded && (
            <p className="text-accent">Reauthorize TikTok — connection expired or errored.</p>
          )}
          {data.capabilities.permissionsMissing.map((p) => (
            <p key={p} className="text-paper-muted">
              {p}
            </p>
          ))}
          {!data.capabilities.inboxUploadReady && (
            <p className="text-paper-muted italic">
              Inbox upload & direct post unavailable — manual handoff mode active.
            </p>
          )}
        </div>
      )}

      <section className="border-2 border-paper-ink bg-paper-tint px-5 py-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider">Today&apos;s TikTok moves</h2>
            <p className="text-sm text-paper-muted mt-1">{data.briefing.summary}</p>
          </div>
          <button
            type="button"
            className="btn-ghost text-xs"
            disabled={!!busy}
            onClick={async () => {
              setBusy('briefing');
              try {
                await apiPost('/api/tiktok-operator/briefing/refresh');
                await reload();
              } finally {
                setBusy(null);
              }
            }}
          >
            Refresh briefing
          </button>
        </div>
        <ol className="space-y-3">
          {data.briefing.actions.map((action) => (
            <li key={action.rank} className="flex flex-wrap gap-3 items-start border-l-4 border-accent pl-3">
              <span className="font-bold tabular-nums text-accent">{action.rank}.</span>
              <div className="flex-1 min-w-0">
                <div className="font-bold lowercase">{action.label.toLowerCase()}</div>
                <p className="text-2xs text-paper-muted mt-0.5">{action.reason}</p>
              </div>
              {action.href && (
                <Link href={action.href} className="btn-ghost text-2xs py-1 px-2">
                  Do this next
                </Link>
              )}
            </li>
          ))}
        </ol>
      </section>

      {data.signals && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider">Performance signals</h2>
          <div className="flex flex-wrap gap-2">
            <MetricPill label="median views" value={data.signals.medianViews.toLocaleString()} />
            <MetricPill label="outperforming" value={data.signals.outperformingCount} />
            <MetricPill label="needs follow-up" value={data.signals.needsFollowUpCount} />
            <MetricPill label="sponsor proof" value={data.signals.sponsorProofCandidates} />
            <MetricPill label="momentum fading" value={data.signals.momentumFadingCount} />
          </div>
          {data.signals.bestPostingWindows.length > 0 && (
            <p className="text-2xs text-paper-muted">
              Post window opening soon:{' '}
              {data.signals.bestPostingWindows.map((w) => w.label).join(' · ')}
            </p>
          )}
        </section>
      )}

      {activePackage && (
        <PackageEditor
          pkg={activePackage}
          busy={!!busy}
          onChange={(patch) => setActivePackage((p) => (p ? { ...p, ...patch } : p))}
          onSave={async () => {
            if (!activePackage) return;
            setBusy('save-pkg');
            try {
              await apiPatch(`/api/tiktok-operator/packages/${activePackage.id}`, {
                hook: activePackage.hook,
                caption: activePackage.caption,
                hashtags: activePackage.hashtags,
              });
              await reload();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Save failed');
            } finally {
              setBusy(null);
            }
          }}
        />
      )}

      {activePackage && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-ghost text-xs"
            disabled={!!busy}
            onClick={async () => {
              setBusy('handoff');
              try {
                await apiPost(`/api/tiktok-operator/packages/${activePackage.id}/handoff`);
                await reload();
              } finally {
                setBusy(null);
              }
            }}
          >
            Mark handed off
          </button>
          <button
            type="button"
            className="btn-primary text-xs py-2 min-h-[36px] px-3"
            disabled={!!busy}
            onClick={async () => {
              setBusy('posted');
              try {
                await apiPost(`/api/tiktok-operator/packages/${activePackage.id}/posted`, {
                  postedUrl: null,
                });
                await reload();
              } finally {
                setBusy(null);
              }
            }}
          >
            Mark posted manually
          </button>
          <Link href="/planner" className="btn-ghost text-xs">
            Add to planner
          </Link>
          <Link href="/media-kits" className="btn-ghost text-xs">
            Media kits
          </Link>
        </div>
      )}

      <section className="space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider">Do this next</h2>
        {focusedRec && (
          <p className="text-2xs text-paper-muted italic">// focused recommendation from action center</p>
        )}
        {data.recommendations.length === 0 ? (
          <p className="text-sm text-paper-muted italic border border-dashed border-paper-edge p-6 text-center">
            No recommendations yet — Benson will notice outperformers after sync.
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {(focusedRec ? [focusedRec] : data.recommendations.slice(0, 12)).map((rec) => (
              <RecommendationCard
                key={rec.id}
                rec={rec}
                busy={busy}
                onAccept={async () => {
                  setBusy(rec.id);
                  try {
                    await apiPost(`/api/tiktok-operator/recommendations/${rec.id}/accept`);
                    await reload();
                  } finally {
                    setBusy(null);
                  }
                }}
                onDismiss={async () => {
                  setBusy(rec.id);
                  try {
                    await apiPost(`/api/tiktok-operator/recommendations/${rec.id}/dismiss`);
                    await reload();
                  } finally {
                    setBusy(null);
                  }
                }}
                onPrepare={() => void handlePrepare(rec)}
                onSequel={async () => {
                  if (!rec.sourceVideo) return;
                  setBusy(rec.id);
                  try {
                    const json = (await apiPost('/api/tiktok-operator/sequel', {
                      creatorVideoId: rec.sourceVideo.id,
                      recommendationId: rec.id,
                    })) as { package: PostPackage };
                    setActivePackage(json.package);
                    await reload();
                  } finally {
                    setBusy(null);
                  }
                }}
                onProof={async () => {
                  if (!rec.sourceVideo) return;
                  setBusy(rec.id);
                  try {
                    await apiPost('/api/tiktok-operator/sponsor-proof', {
                      creatorVideoId: rec.sourceVideo.id,
                    });
                    await reload();
                  } finally {
                    setBusy(null);
                  }
                }}
                onRepeat={async () => {
                  if (!rec.sourceVideo) return;
                  setBusy(rec.id);
                  try {
                    await apiPost('/api/tiktok-operator/repeat-format', {
                      creatorVideoId: rec.sourceVideo.id,
                    });
                    await reload();
                  } finally {
                    setBusy(null);
                  }
                }}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider">Comment-driven opportunities</h2>
        {data.commentInsights.length === 0 ? (
          <p className="text-sm text-paper-muted italic border border-dashed border-paper-edge p-6 text-center">
            No comment insights yet — inferred from high-comment videos until comment sync ships.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.commentInsights.slice(0, 8).map((insight: CommentInsight) => (
              <article key={insight.id} className="border border-paper-edge p-4 space-y-2">
                <div className="text-2xs uppercase text-paper-muted">{insight.insightType.replace(/_/g, ' ')}</div>
                <p className="font-bold lowercase">{insight.clusterSummary ?? 'Comment opportunity'}</p>
                <p className="text-2xs text-paper-muted">{insight.recommendation}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-ghost text-2xs"
                    disabled={!!busy}
                    onClick={async () => {
                      setBusy(insight.id);
                      try {
                        const json = (await apiPost(
                          `/api/tiktok-operator/comment-insights/${insight.id}/reply-package`,
                        )) as { package: PostPackage };
                        setActivePackage(json.package);
                        await reload();
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    Create reply video package
                  </button>
                  <button
                    type="button"
                    className="btn-ghost text-2xs text-paper-muted"
                    disabled={!!busy}
                    onClick={async () => {
                      setBusy(insight.id);
                      try {
                        await apiPatch(`/api/tiktok-operator/comment-insights/${insight.id}`, {
                          status: 'dismissed',
                        });
                        await reload();
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    Dismiss
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {data.sponsorProofAssets.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider">Sponsor proof assets</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.sponsorProofAssets.map((proof) => (
              <article key={proof.id} className="border border-paper-edge p-4 space-y-2">
                <h4 className="font-bold lowercase">{proof.proofHeadline.toLowerCase()}</h4>
                <p className="text-sm text-paper-muted">{proof.proofSummary}</p>
                {proof.shareUrl && (
                  <a href={proof.shareUrl} className="text-2xs link" target="_blank" rel="noopener noreferrer">
                    View TikTok
                  </a>
                )}
                <Link href="/media-kits" className="btn-ghost text-2xs inline-block">
                  Add to media kit
                </Link>
              </article>
            ))}
          </div>
        </section>
      )}

      {data.formatTemplates.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider">Repeatable formats</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.formatTemplates.map((fmt) => (
              <article key={fmt.id} className="border border-paper-edge p-4 space-y-1">
                <h4 className="font-bold lowercase">{fmt.formatName.toLowerCase()}</h4>
                <p className="text-2xs text-paper-muted">{fmt.structure}</p>
                {fmt.avgPerformanceIndex != null && (
                  <p className="text-2xs tabular-nums">{fmt.avgPerformanceIndex.toFixed(1)}× avg proof</p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {error && (
        <div className="border border-accent text-accent text-xs px-3 py-2">// {error}</div>
      )}
    </div>
  );
}
