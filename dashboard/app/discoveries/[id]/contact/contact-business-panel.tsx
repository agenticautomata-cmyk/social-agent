'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { clientApiUrl } from '../../../../lib/client-api';
import { useActionToast } from '../../../../components/action-toast';
import { useDiscoveryRecord } from '../../../../lib/use-discovery-record';
import {
  pipelineStatusLabel,
  RELATIONSHIP_STAGE_LABEL,
  type RelationshipStage,
} from '../../../../lib/sponsor-pipeline-types';

type SponsorContact = {
  id: string;
  businessName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  tiktok: string | null;
  category: string | null;
  status: string;
  contactVerificationStatus: string;
  lastContactedAt: string | null;
  nextFollowUpAt: string | null;
};

type ContactConfidence = {
  tier: 'high' | 'medium' | 'low' | 'none';
  label: string;
  usable: boolean;
};

type Relationship = {
  stage: RelationshipStage;
  hasFormalDeal: boolean;
  dealTitle: string | null;
  lastActivity: string | null;
  nextFollowUpAt: string | null;
};

type ContactData = {
  contact: SponsorContact;
  confidence: ContactConfidence;
  noContactMessage: string | null;
  relationship: Relationship | null;
};

const CHANNEL_OPTIONS: Array<{ id: 'email' | 'site_form' | 'dm' | 'phone' | 'in_person'; label: string }> = [
  { id: 'site_form', label: 'Submitted website form' },
  { id: 'email', label: 'Sent email' },
  { id: 'dm', label: 'Sent DM' },
  { id: 'phone', label: 'Called' },
  { id: 'in_person', label: 'Contacted in person' },
];

export function ContactBusinessPanel({ contentItemId }: { contentItemId: string }) {
  const { record } = useDiscoveryRecord(contentItemId, 'contact_business');
  const [data, setData] = useState<ContactData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const { showToast } = useActionToast();

  const load = useCallback(async () => {
    try {
      const res = await fetch(clientApiUrl(`/api/creator-interest/records/${contentItemId}/contact`), {
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Failed to load contact info');
      setData(json as ContactData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [contentItemId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function recordAction(channel: (typeof CHANNEL_OPTIONS)[number]['id']) {
    setBusy(channel);
    try {
      const res = await fetch(clientApiUrl(`/api/creator-interest/records/${contentItemId}/contact-actions`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, note: note.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Could not record contact');
      setNote('');
      await load();
      showToast({
        title: 'Contact recorded',
        nextStep: 'This business now shows as contacted on /pipeline. A follow-up is scheduled automatically.',
      });
    } catch (err) {
      showToast({ title: "Couldn't record contact", nextStep: err instanceof Error ? err.message : null, tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  const businessAction = record?.assistancePackage?.businessAction;

  if (loading && !data) return <p className="text-sm text-paper-muted italic">Loading contact research…</p>;
  if (error && !data) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return null;

  const { contact, confidence, noContactMessage, relationship } = data;
  const contactPaths = [
    contact.email ? { label: 'Email', value: contact.email, href: `mailto:${contact.email}` } : null,
    contact.website ? { label: 'Website / contact form', value: contact.website, href: contact.website } : null,
    contact.instagram ? { label: 'Instagram DM', value: contact.instagram, href: contact.instagram } : null,
    contact.phone ? { label: 'Phone', value: contact.phone, href: `tel:${contact.phone}` } : null,
  ].filter(Boolean) as Array<{ label: string; value: string; href: string }>;

  return (
    <div className="space-y-6">
      <Link href={`/discoveries/${contentItemId}`} className="btn-ghost text-xs inline-flex">
        ← {record?.normalizedEntityName ?? contact.businessName}
      </Link>

      <header className="space-y-1">
        <p className="text-2xs uppercase tracking-wider text-paper-muted">Contact business</p>
        <h1 className="text-xl font-bold">{contact.businessName}</h1>
        {contact.category && <p className="text-sm text-paper-muted">{contact.category.replace(/_/g, ' ')}</p>}
      </header>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <section className="glass-panel p-4 space-y-2">
        <p className="text-2xs uppercase tracking-wider text-paper-muted">Relationship stage</p>
        <p className="text-sm font-bold">
          {relationship ? RELATIONSHIP_STAGE_LABEL[relationship.stage] : pipelineStatusLabel(contact.status)}
          {relationship?.hasFormalDeal && relationship.dealTitle ? ` · ${relationship.dealTitle}` : ''}
        </p>
        {contact.lastContactedAt && (
          <p className="text-xs text-paper-muted">Last contacted {new Date(contact.lastContactedAt).toLocaleString()}</p>
        )}
        {contact.nextFollowUpAt && (
          <p className="text-xs text-paper-muted">Follow-up due {new Date(contact.nextFollowUpAt).toLocaleDateString()}</p>
        )}
        <Link href="/pipeline" className="text-2xs text-accent underline">
          View in pipeline →
        </Link>
      </section>

      <section className="glass-panel p-4 space-y-2">
        <p className="text-2xs uppercase tracking-wider text-paper-muted">Verified contact paths</p>
        <span
          className={`inline-block text-2xs px-2 py-0.5 rounded-full border ${
            confidence.usable ? 'border-accent/40 text-accent' : 'border-paper-edge text-paper-muted'
          }`}
        >
          {confidence.label}
        </span>
        {contactPaths.length > 0 ? (
          <ul className="text-sm space-y-1 mt-1">
            {contactPaths.map((p) => (
              <li key={p.label}>
                <span className="text-paper-muted">{p.label}: </span>
                <a href={p.href} target="_blank" rel="noreferrer" className="text-accent underline break-all">
                  {p.value}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-paper-muted italic mt-1">{noContactMessage ?? 'No verified contact found.'}</p>
        )}
      </section>

      {businessAction ? (
        <section className="glass-panel p-4 space-y-2">
          <p className="text-2xs uppercase tracking-wider text-paper-muted">Draft pitch</p>
          {businessAction.outreachRecommendation && <p className="text-sm">{businessAction.outreachRecommendation}</p>}
          {businessAction.draftOutreach && (
            <pre className="whitespace-pre-wrap text-xs bg-paper-tint p-3 rounded-lg text-paper-soft">
              {businessAction.draftOutreach}
            </pre>
          )}
          <p className="text-2xs text-paper-dim">Review before send — Benson never sends automatically.</p>
          {businessAction.draftOutreach && (
            <Link
              href={`/outreach/compose?seed=${encodeURIComponent(businessAction.draftOutreach.slice(0, 500))}`}
              className="btn-ghost text-2xs min-h-[32px] px-2 inline-flex items-center"
            >
              Open compose draft
            </Link>
          )}
        </section>
      ) : null}

      <section className="glass-panel p-4 space-y-3">
        <p className="text-2xs uppercase tracking-wider text-paper-muted">Record what you actually did</p>
        <p className="text-2xs text-paper-dim">
          Only record this after you&rsquo;ve actually contacted the business — this updates the pipeline and
          schedules a real follow-up. It never sends anything on its own.
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note (what you said, who you reached)…"
          className="w-full text-sm p-2 rounded-lg border border-paper-edge bg-paper min-h-[60px]"
        />
        <div className="flex flex-wrap gap-2">
          {CHANNEL_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              disabled={!!busy}
              onClick={() => void recordAction(opt.id)}
              className="btn-ghost text-xs min-h-[40px] px-3"
            >
              {busy === opt.id ? 'Recording…' : opt.label}
            </button>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <Link href={`/discoveries/${contentItemId}/visit-plan`} className="btn-ghost text-xs min-h-[40px] px-3 inline-flex items-center">
          ← Visit plan
        </Link>
      </div>
    </div>
  );
}
