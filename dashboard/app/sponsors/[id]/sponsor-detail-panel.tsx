'use client';

import { clientApiOrigin } from '../../../lib/client-api';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  formatDate,
  formatDateTime,
  formatFitScore,
  SPONSOR_CONTACT_STATUSES,
  statusLabel,
  type OutreachEmailRecord,
  type SponsorContactRecord,
} from '../../../lib/sponsor-outreach-types';
import { SponsorPipelineSection } from '../../../components/sponsor-pipeline-section';
import type { SponsorPipelineSummary } from '../../../lib/sponsor-pipeline-types';
import type { PlannedContentLink } from '../../../lib/benson-intelligence-types';
import { contactConfidenceForStatus } from '@social-agent/core/sponsor-outreach/contact-confidence';

const API = clientApiOrigin();

function confidenceBadgeClass(tier: 'high' | 'medium' | 'low' | 'none'): string {
  switch (tier) {
    case 'high':
      return 'border-emerald-600/40 text-emerald-700';
    case 'medium':
      return 'border-sky-600/40 text-sky-700';
    case 'low':
      return 'border-amber-600/40 text-amber-700';
    default:
      return 'border-stone-500/40 text-stone-600';
  }
}

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
  const [outreachHistory, setOutreachHistory] = useState<OutreachEmailRecord[]>([]);
  const [duplicateContacts, setDuplicateContacts] = useState<SponsorContactRecord[]>([]);
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
          plannedContent?: PlannedContentLink[];
          outreachHistory?: OutreachEmailRecord[];
          duplicateContacts?: SponsorContactRecord[];
        }>;
      })
      .then((data) => {
        setContact(data.contact);
        setSourceOpportunity(data.sourceOpportunity);
        setPipeline(data.pipeline);
        setPlannedContent(data.plannedContent ?? []);
        setOutreachHistory(data.outreachHistory ?? []);
        setDuplicateContacts(data.duplicateContacts ?? []);
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
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold lowercase">contact details</h2>
          <span
            className={`text-2xs px-2 py-0.5 border ${confidenceBadgeClass(contactConfidenceForStatus(contact.contactVerificationStatus).tier)}`}
          >
            {contactConfidenceForStatus(contact.contactVerificationStatus).label}
          </span>
        </div>
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

      <section className="border border-paper-edge p-4 space-y-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold lowercase">pitches &amp; outreach</h2>
          {duplicateContacts.length > 0 && (
            <span className="text-2xs text-paper-muted border border-paper-edge px-2 py-0.5">
              {duplicateContacts.length} duplicate {duplicateContacts.length === 1 ? 'record' : 'records'} merged
              into this business
            </span>
          )}
        </div>
        {outreachHistory.length === 0 ? (
          <p className="text-paper-muted italic text-xs">
            No pitch drafted yet. Use <span className="font-bold">compose outreach</span> above to start one.
          </p>
        ) : (
          <ul className="space-y-2">
            {outreachHistory.map((email) => {
              const reviewable = ['draft', 'needs_approval', 'scheduled', 'sending'].includes(email.status);
              return (
                <li
                  key={email.id}
                  className="border border-paper-edge p-3 flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="font-bold truncate">{email.subject || 'No subject'}</div>
                    <div className="text-2xs text-paper-muted">
                      {statusLabel(email.status)} · {formatDateTime(email.updatedAt)}
                    </div>
                  </div>
                  {reviewable ? (
                    <Link
                      href={`/email/approvals?id=${email.id}`}
                      className="btn-secondary text-2xs shrink-0"
                    >
                      review draft
                    </Link>
                  ) : (
                    <span className="text-2xs text-paper-muted shrink-0">history — not editable</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
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
