'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  formatDate,
  formatDateTime,
  formatFitScore,
  SPONSOR_CONTACT_STATUSES,
  statusLabel,
  type SponsorContactRecord,
} from '../../../lib/sponsor-outreach-types';
import { SponsorPipelineSection } from '../../../components/sponsor-pipeline-section';
import type { SponsorPipelineSummary } from '../../../lib/sponsor-pipeline-types';
import type { PlannedContentLink } from '../../../lib/benson-intelligence-types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type SourceOpportunity = {
  id: string;
  title: string;
  whyItMatters: string;
  sourceUrl: string | null;
};

export function SponsorDetailPanel({ id }: { id: string }) {
  const [contact, setContact] = useState<SponsorContactRecord | null>(null);
  const [pipeline, setPipeline] = useState<SponsorPipelineSummary | null>(null);
  const [plannedContent, setPlannedContent] = useState<PlannedContentLink[]>([]);
  const [sourceOpportunity, setSourceOpportunity] = useState<SourceOpportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    return fetch(`${API}/api/sponsors/${id}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<{
          contact: SponsorContactRecord;
          sourceOpportunity: SourceOpportunity | null;
          pipeline: SponsorPipelineSummary;
        }>;
      })
      .then((data) => {
        setContact(data.contact);
        setSourceOpportunity(data.sourceOpportunity);
        setPipeline(data.pipeline);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function saveField(field: string, value: unknown) {
    if (!contact) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/sponsors/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { contact: SponsorContactRecord };
      setContact(json.contact);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="py-12 text-paper-muted italic">// loading…</div>;
  if (error || !contact) {
    return <div className="border-2 border-accent px-4 py-3 text-sm text-accent">// {error ?? 'not found'}</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-4 text-sm">
        <Link href={`/outreach/compose?sponsor=${contact.id}`} className="bracket hover:text-accent">
          compose outreach →
        </Link>
        {contact.sourceOpportunityId && (
          <Link href={`/review/inventory?id=${contact.sourceOpportunityId}`} className="bracket hover:text-accent">
            source opportunity →
          </Link>
        )}
      </div>

      <section className="space-y-3 text-sm">
        <h2 className="font-bold lowercase">company</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block space-y-1">
            <span className="text-2xs uppercase text-paper-muted">company</span>
            <input
              defaultValue={contact.businessName}
              onBlur={(e) => {
                if (e.target.value.trim() && e.target.value !== contact.businessName) {
                  void saveField('businessName', e.target.value.trim());
                }
              }}
              className="w-full border border-paper-edge px-2 py-1.5 bg-paper text-sm font-bold"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-2xs uppercase text-paper-muted">contact name</span>
            <input
              defaultValue={contact.contactName ?? ''}
              onBlur={(e) => {
                const v = e.target.value.trim() || null;
                if (v !== (contact.contactName ?? null)) void saveField('contactName', v);
              }}
              className="w-full border border-paper-edge px-2 py-1.5 bg-paper text-sm"
            />
          </label>
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="border border-paper-edge p-3">
          <div className="text-2xs text-paper-muted">fit score</div>
          <div className="text-xl font-bold">{formatFitScore(contact.sponsorFitScore)}</div>
        </div>
        <div className="border border-paper-edge p-3">
          <div className="text-2xs text-paper-muted">status</div>
          <select
            value={contact.status}
            disabled={saving}
            onChange={(e) => void saveField('status', e.target.value)}
            className="text-sm font-bold bg-transparent border-none p-0 lowercase"
          >
            {SPONSOR_CONTACT_STATUSES.map((s) => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>
        </div>
        <div className="border border-paper-edge p-3">
          <div className="text-2xs text-paper-muted">last contacted</div>
          <input
            type="date"
            defaultValue={
              contact.lastContactedAt
                ? contact.lastContactedAt.slice(0, 10)
                : ''
            }
            disabled={saving}
            onChange={(e) => {
              const v = e.target.value;
              void saveField('lastContactedAt', v ? `${v}T12:00:00.000Z` : null);
            }}
            className="text-sm bg-transparent border border-paper-edge px-2 py-1 w-full mt-1"
          />
        </div>
        <div className="border border-paper-edge p-3">
          <div className="text-2xs text-paper-muted">next follow-up</div>
          <div className="text-sm">{formatDate(contact.nextFollowUpAt)}</div>
        </div>
      </section>

      <section className="space-y-3 text-sm">
        <h2 className="font-bold lowercase">contact details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {([
            ['email', contact.email],
            ['phone', contact.phone],
            ['website', contact.website],
            ['instagram', contact.instagram],
            ['tiktok', contact.tiktok],
            ['category', contact.category],
          ] as const).map(([field, value]) => (
            <label key={field} className="block space-y-1">
              <span className="text-2xs uppercase text-paper-muted">{field}</span>
              <input
                defaultValue={value ?? ''}
                onBlur={(e) => {
                  if (e.target.value !== (value ?? '')) void saveField(field, e.target.value || null);
                }}
                className="w-full border border-paper-edge px-2 py-1.5 bg-paper text-sm"
              />
            </label>
          ))}
        </div>
        <label className="block space-y-1">
          <span className="text-2xs uppercase text-paper-muted">notes</span>
          <textarea
            defaultValue={contact.notes ?? ''}
            rows={4}
            onBlur={(e) => {
              if (e.target.value !== (contact.notes ?? '')) void saveField('notes', e.target.value || null);
            }}
            className="w-full border border-paper-edge px-2 py-1.5 bg-paper text-sm"
          />
        </label>
      </section>

      {pipeline && (
        <SponsorPipelineSection sponsorId={contact.id} pipeline={pipeline} onUpdate={() => void reload()} />
      )}

      {plannedContent.length > 0 && (
        <section className="border border-paper-edge p-4 space-y-3">
          <h2 className="font-bold lowercase">planned content</h2>
          <ul className="space-y-2 text-sm">
            {plannedContent.map((item) => (
              <li key={`${item.contentItemId}-${item.listName}`}>
                <Link
                  href={`/review/inventory?id=${item.contentItemId}`}
                  className="hover:text-accent font-bold lowercase"
                >
                  {item.title.toLowerCase()}
                </Link>
                <span className="text-2xs text-paper-muted ml-2">
                  {item.listName.toLowerCase()} · {item.status}
                  {item.plannedDate ? ` · ${item.plannedDate}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sourceOpportunity && (
        <section className="border border-paper-edge p-4 space-y-2">
          <h2 className="font-bold lowercase">benson recommendation</h2>
          <p className="text-sm text-paper-soft">{sourceOpportunity.whyItMatters}</p>
          {sourceOpportunity.sourceUrl && (
            <a href={sourceOpportunity.sourceUrl} target="_blank" rel="noopener noreferrer" className="link text-xs">
              {sourceOpportunity.sourceUrl}
            </a>
          )}
        </section>
      )}
    </div>
  );
}
