'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { InventoryCategoryFilterBar } from '../../components/inventory-category-filter-bar';
import {
  appendExcludeCategories,
  useInventoryCategoryFilter,
} from '../../lib/inventory-category-filter';
import { PageHeader } from '../../components/page-header';
import type { BensonHubResponse } from '../../lib/benson-intelligence-types';
import { formatDateTime } from '../../lib/datetime';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function SectionCard({
  sectionKey,
  section,
}: {
  sectionKey: string;
  section: BensonHubResponse['sections'][keyof BensonHubResponse['sections']];
}) {
  return (
    <article className="border-2 border-paper-edge p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold lowercase">{section.headline.toLowerCase()}</h3>
          <p className="text-2xs text-paper-muted mt-1 italic">{section.summary}</p>
        </div>
        <Link href={section.href} className="bracket text-2xs shrink-0 hover:text-accent">
          open →
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        {section.metrics.map((m) => (
          <div key={`${sectionKey}-${m.label}`} className="border border-paper-edge px-3 py-2 min-w-[5rem]">
            <div className="text-2xs uppercase text-paper-muted">{m.label}</div>
            <div className="text-lg font-bold tabular-nums">{m.value}</div>
          </div>
        ))}
      </div>

      {section.highlights.length > 0 && (
        <ul className="text-xs text-paper-soft space-y-1 list-disc list-inside">
          {section.highlights.map((h) => (
            <li key={h} className="lowercase">{h.toLowerCase()}</li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function BensonHubPanel() {
  const categoryFilter = useInventoryCategoryFilter();
  const { excludedCategories, hydrated } = categoryFilter;
  const [data, setData] = useState<BensonHubResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!hydrated) return Promise.resolve();
    setLoading(true);
    setError(null);
    return fetch(appendExcludeCategories(`${API}/api/benson`, excludedCategories), {
      cache: 'no-store',
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        return res.json() as Promise<BensonHubResponse>;
      })
      .then(setData)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load Benson hub');
      })
      .finally(() => setLoading(false));
  }, [excludedCategories, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    void reload();
  }, [reload, hydrated]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Briefing hub"
        subtitle="Content, sponsors, pipeline, and outreach in one view."
        action={{ label: 'Ask Benson', href: '/ask-benson' }}
      />

      <InventoryCategoryFilterBar {...categoryFilter} loading={loading} />

      {data?.demoMode && (
        <div className="border border-dashed border-paper-edge px-4 py-2 text-xs text-paper-muted">
          demo mode — connected systems with live inventory data
        </div>
      )}

      {error && (
        <div className="border-2 border-accent px-4 py-3 text-sm text-accent">
          // error: {error}
        </div>
      )}

      {loading && !data && (
        <div className="py-16 text-center text-paper-muted italic">// loading executive summary…</div>
      )}

      {data && (
        <>
          {data.briefingPriorities.length > 0 && (
            <section className="border-2 border-paper-ink bg-paper-tint px-5 py-4 space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider">today&apos;s priorities</h2>
              <ol className="space-y-2 text-sm">
                {data.briefingPriorities.map((p) => (
                  <li key={p.rank} className="flex gap-3">
                    <span className="font-bold tabular-nums text-paper-muted">{p.rank}.</span>
                    {p.href ? (
                      <Link href={p.href} className="hover:text-accent lowercase">
                        {p.label.toLowerCase()}
                      </Link>
                    ) : (
                      <span className="lowercase">{p.label.toLowerCase()}</span>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard sectionKey="content" section={data.sections.content} />
            <SectionCard sectionKey="sponsors" section={data.sections.sponsors} />
            <SectionCard sectionKey="pipeline" section={data.sections.pipeline} />
            <SectionCard sectionKey="analytics" section={data.sections.analytics} />
            <SectionCard sectionKey="outreach" section={data.sections.outreach} />
          </div>

          <p className="text-2xs text-paper-muted italic">
            generated {formatDateTime(data.generatedAt)} — scores connect editor, planner, sponsors, pipeline, and analytics without new sources.
          </p>
        </>
      )}
    </div>
  );
}
