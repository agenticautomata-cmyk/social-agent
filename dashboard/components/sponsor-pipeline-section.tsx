'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  formatCurrency,
  pipelineStatusLabel,
  type SponsorOpportunityRecord,
  type SponsorPipelineSummary,
} from '../lib/sponsor-pipeline-types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function SponsorPipelineSection({
  sponsorId,
  pipeline,
  onUpdate,
}: {
  sponsorId: string;
  pipeline: SponsorPipelineSummary;
  onUpdate: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [plannerListName, setPlannerListName] = useState('');

  async function createOpportunity() {
    if (!title.trim()) return;
    setBusy('create');
    try {
      const res = await fetch(`${API}/api/pipeline/opportunities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sponsorContactId: sponsorId,
          title: title.trim(),
          estimatedValue: estimatedValue ? parseFloat(estimatedValue) : null,
          plannerListName: plannerListName.trim() || null,
          leadSource: 'crm',
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setTitle('');
      setEstimatedValue('');
      setPlannerListName('');
      setShowForm(false);
      onUpdate();
    } finally {
      setBusy(null);
    }
  }

  async function mark(id: string, action: 'won' | 'lost') {
    setBusy(`${action}-${id}`);
    try {
      const res = await fetch(`${API}/api/pipeline/opportunities/${id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(await res.text());
      onUpdate();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-4 border-2 border-paper-edge p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="font-bold lowercase">sponsor pipeline</h2>
        <Link href="/pipeline" className="bracket text-2xs hover:text-accent">
          full pipeline →
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="border border-paper-edge p-3">
          <div className="text-2xs text-paper-muted">open pipeline</div>
          <div className="font-bold tabular-nums">{formatCurrency(pipeline.openPipelineValue)}</div>
          <div className="text-2xs text-paper-muted">{pipeline.openOpportunities.length} deals</div>
        </div>
        <div className="border border-paper-edge p-3">
          <div className="text-2xs text-paper-muted">closed won value</div>
          <div className="font-bold tabular-nums">{formatCurrency(pipeline.closedValue)}</div>
          <div className="text-2xs text-paper-muted">{pipeline.wonCount} won</div>
        </div>
        <div className="border border-paper-edge p-3">
          <div className="text-2xs text-paper-muted">lost</div>
          <div className="font-bold tabular-nums">{pipeline.lostCount}</div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowForm((v) => !v)}
        className="text-2xs border border-paper-edge px-2 py-1 hover:border-paper-ink"
      >
        {showForm ? 'cancel' : '+ new opportunity'}
      </button>

      {showForm && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="deal title"
            className="border border-paper-edge px-2 py-1.5"
          />
          <input
            value={estimatedValue}
            onChange={(e) => setEstimatedValue(e.target.value)}
            placeholder="estimated value"
            type="number"
            className="border border-paper-edge px-2 py-1.5"
          />
          <input
            value={plannerListName}
            onChange={(e) => setPlannerListName(e.target.value)}
            placeholder="content plan list (e.g. shopping)"
            className="border border-paper-edge px-2 py-1.5"
          />
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void createOpportunity()}
            className="md:col-span-3 border-2 border-paper-ink px-3 py-1.5 text-sm font-bold hover:bg-paper-ink hover:text-paper"
          >
            {busy === 'create' ? '…' : 'create opportunity'}
          </button>
        </div>
      )}

      {pipeline.openOpportunities.length === 0 ? (
        <p className="text-xs text-paper-muted italic">// no open opportunities</p>
      ) : (
        <div className="space-y-3">
          {pipeline.openOpportunities.map((opp) => (
            <OpportunityRow
              key={opp.id}
              opp={opp}
              busy={busy}
              onWon={() => void mark(opp.id, 'won')}
              onLost={() => void mark(opp.id, 'lost')}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function OpportunityRow({
  opp,
  busy,
  onWon,
  onLost,
}: {
  opp: SponsorOpportunityRecord;
  busy: string | null;
  onWon: () => void;
  onLost: () => void;
}) {
  return (
    <article className="border border-paper-edge p-3 space-y-2">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <h3 className="font-bold text-sm lowercase">{opp.title.toLowerCase()}</h3>
          <div className="text-2xs text-paper-muted">
            {pipelineStatusLabel(opp.status)}
            {opp.estimatedValue != null ? ` · ${formatCurrency(opp.estimatedValue)}` : ''}
            {opp.plannerListName ? ` · plan: ${opp.plannerListName}` : ''}
          </div>
        </div>
        <div className="flex gap-2 text-2xs">
          <button
            type="button"
            disabled={!!busy}
            onClick={onWon}
            className="border border-paper-edge px-2 py-1 hover:border-paper-ink"
          >
            won
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={onLost}
            className="border border-paper-edge px-2 py-1 hover:border-paper-ink"
          >
            lost
          </button>
        </div>
      </div>
      {opp.notes && <p className="text-2xs text-paper-soft">{opp.notes}</p>}
    </article>
  );
}
