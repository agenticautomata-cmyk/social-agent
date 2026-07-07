'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SponsorOpportunityRecord } from '../lib/sponsor-pipeline-types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function SponsorIntelligenceActions({
  contentItemId,
  sponsorContactId,
  onAction,
}: {
  contentItemId: string;
  sponsorContactId: string | null;
  onAction?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [leadId, setLeadId] = useState(sponsorContactId);
  const [pipelineOppId, setPipelineOppId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);
  const [editStatus, setEditStatus] = useState('contacted');
  const [editPlannerList, setEditPlannerList] = useState('');

  useEffect(() => {
    if (!leadId) return;
    void fetch(
      `${API}/api/sponsor-intelligence/from-opportunity/${contentItemId}/pipeline-opportunities`,
      { cache: 'no-store' },
    )
      .then((r) => r.json())
      .then((d: { opportunities: SponsorOpportunityRecord[] }) => {
        if (d.opportunities[0]) setPipelineOppId(d.opportunities[0].id);
      })
      .catch(() => {});
  }, [leadId, contentItemId]);

  async function startPitch() {
    setBusy('pitch');
    try {
      let contactId = leadId;
      if (!contactId) {
        const leadRes = await fetch(
          `${API}/api/sponsor-intelligence/from-opportunity/${contentItemId}/lead`,
          { method: 'POST' },
        );
        if (!leadRes.ok) throw new Error(await leadRes.text());
        const leadJson = (await leadRes.json()) as { contact: { id: string } };
        contactId = leadJson.contact.id;
        setLeadId(contactId);
      }
      const draftRes = await fetch(
        `${API}/api/sponsor-intelligence/from-opportunity/${contentItemId}/draft-outreach`,
        { method: 'POST' },
      );
      if (!draftRes.ok) throw new Error(await draftRes.text());
      const draftJson = (await draftRes.json()) as { emailId: string };
      router.push(`/email/approvals?id=${draftJson.emailId}`);
    } finally {
      setBusy(null);
    }
  }

  async function run(action: string, path: string, options?: RequestInit) {
    setBusy(action);
    try {
      const res = await fetch(
        `${API}/api/sponsor-intelligence/from-opportunity/${contentItemId}/${path}`,
        { method: 'POST', ...options },
      );
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as Record<string, unknown>;

      if (action === 'lead') {
        const contact = json.contact as { id: string };
        setLeadId(contact.id);
      }
      if (action === 'pipeline') {
        const opportunity = json.opportunity as { id: string };
        setPipelineOppId(opportunity.id);
        setLeadId((json.contactId as string) ?? leadId);
      }
      if (action === 'draft') {
        const contact = json.contact as { id: string };
        router.push(`/outreach/compose?sponsor=${contact.id}`);
        return;
      }
      if (action === 'dismiss') {
        setDismissed(true);
      }
      onAction?.();
    } finally {
      setBusy(null);
    }
  }

  async function runPipelineOpp(action: 'won' | 'lost' | 'update') {
    if (!pipelineOppId) return;
    setBusy(action);
    try {
      if (action === 'update' && pipelineOppId) {
        const res = await fetch(
          `${API}/api/sponsor-intelligence/pipeline-opportunity/${pipelineOppId}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: editStatus,
              plannerListName: editPlannerList.trim() || null,
            }),
          },
        );
        if (!res.ok) throw new Error(await res.text());
        setShowUpdate(false);
      } else if (action === 'won' && pipelineOppId) {
        const res = await fetch(
          `${API}/api/sponsor-intelligence/pipeline-opportunity/${pipelineOppId}/won`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
        );
        if (!res.ok) throw new Error(await res.text());
      } else if (action === 'lost' && pipelineOppId) {
        const res = await fetch(
          `${API}/api/sponsor-intelligence/pipeline-opportunity/${pipelineOppId}/lost`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
        );
        if (!res.ok) throw new Error(await res.text());
      }
      onAction?.();
    } finally {
      setBusy(null);
    }
  }

  if (dismissed) {
    return <span className="text-2xs text-paper-muted italic">dismissed</span>;
  }

  const btn = 'border border-paper-edge px-2 py-1 hover:border-paper-ink disabled:opacity-40 text-2xs';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void startPitch()}
          className="border-2 border-paper-ink px-3 py-1.5 hover:bg-paper-tint disabled:opacity-40 text-2xs font-bold min-h-[44px]"
        >
          {busy === 'pitch' ? '…' : 'start pitch →'}
        </button>
        {leadId ? (
          <Link href={`/sponsors/${leadId}`} className={`${btn} text-accent`}>
            view lead →
          </Link>
        ) : (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void run('lead', 'lead')}
            className={btn}
          >
            {busy === 'lead' ? '…' : 'create lead'}
          </button>
        )}
        <button
          type="button"
          disabled={!!busy}
          onClick={() =>
            void run('pipeline', 'create-pipeline-opportunity', {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            })
          }
          className={btn}
        >
          {busy === 'pipeline' ? '…' : 'create opportunity'}
        </button>
        <button
          type="button"
          disabled={!!busy || !pipelineOppId}
          onClick={() => setShowUpdate((v) => !v)}
          className={btn}
        >
          update opportunity
        </button>
        <button
          type="button"
          disabled={!!busy || !pipelineOppId}
          onClick={() => void runPipelineOpp('won')}
          className={btn}
        >
          {busy === 'won' ? '…' : 'mark won'}
        </button>
        <button
          type="button"
          disabled={!!busy || !pipelineOppId}
          onClick={() => void runPipelineOpp('lost')}
          className={btn}
        >
          {busy === 'lost' ? '…' : 'mark lost'}
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void run('draft', 'draft-outreach')}
          className={btn}
        >
          {busy === 'draft' ? '…' : 'create draft outreach'}
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void run('planner', 'add-to-planner')}
          className={btn}
        >
          {busy === 'planner' ? '…' : 'add to planner'}
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void run('dismiss', 'dismiss')}
          className={btn}
        >
          {busy === 'dismiss' ? '…' : 'mark not interested'}
        </button>
      </div>

      {showUpdate && pipelineOppId && (
        <div className="flex flex-wrap gap-2 items-center text-2xs border border-dashed border-paper-edge p-2">
          <select
            value={editStatus}
            onChange={(e) => setEditStatus(e.target.value)}
            className="border border-paper-edge px-1 py-0.5 bg-paper"
          >
            <option value="lead">lead</option>
            <option value="contacted">contacted</option>
            <option value="interested">interested</option>
            <option value="meeting_scheduled">meeting scheduled</option>
            <option value="proposal_sent">proposal sent</option>
            <option value="negotiating">negotiating</option>
          </select>
          <input
            value={editPlannerList}
            onChange={(e) => setEditPlannerList(e.target.value)}
            placeholder="planner list name"
            className="border border-paper-edge px-1 py-0.5 flex-1 min-w-[120px]"
          />
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void runPipelineOpp('update')}
            className={btn}
          >
            save
          </button>
        </div>
      )}
    </div>
  );
}
