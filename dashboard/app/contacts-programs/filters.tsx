'use client';

import {
  KC_COMPENSATION_ACCESS_LABELS,
  KC_COMPENSATION_ACCESS_TYPES,
  KC_CONTACT_EVIDENCE_STATES,
  KC_EVIDENCE_STATE_LABELS,
  KC_FRESHNESS_LABELS,
  KC_ROUTE_TYPE_LABELS,
  KC_ROUTE_TYPES,
  type KcCompensationAccessType,
  type KcContactEvidenceState,
  type KcContactIntelligenceFilters,
  type KcFreshnessBucket,
  type KcRouteType,
} from '@/lib/contact-intelligence-ui';

const FRESHNESS: KcFreshnessBucket[] = ['fresh', 'aging', 'stale', 'unknown'];

type Props = {
  filters: KcContactIntelligenceFilters;
  onChange: (next: KcContactIntelligenceFilters) => void;
  categories: string[];
  areas: string[];
};

function TriState({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null | undefined;
  onChange: (v: boolean | null) => void;
}) {
  const current = value === true ? 'yes' : value === false ? 'no' : 'any';
  return (
    <label className="block text-2xs space-y-1">
      <span className="text-paper-muted uppercase tracking-wide">{label}</span>
      <select
        className="studio-input w-full text-sm min-h-[40px]"
        value={current}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === 'yes' ? true : v === 'no' ? false : null);
        }}
      >
        <option value="any">Any</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </label>
  );
}

export function ContactsProgramsFilters({ filters, onChange, categories, areas }: Props) {
  function patch(partial: Partial<KcContactIntelligenceFilters>) {
    onChange({ ...filters, ...partial });
  }

  return (
    <details className="glass-panel p-3">
      <summary className="text-sm font-semibold cursor-pointer min-h-[40px] flex items-center">
        Filters
      </summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-2xs space-y-1">
          <span className="text-paper-muted uppercase tracking-wide">Category</span>
          <select
            className="studio-input w-full text-sm min-h-[40px]"
            value={filters.category ?? ''}
            onChange={(e) => patch({ category: e.target.value || null })}
          >
            <option value="">Any</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-2xs space-y-1">
          <span className="text-paper-muted uppercase tracking-wide">Area</span>
          <select
            className="studio-input w-full text-sm min-h-[40px]"
            value={filters.area ?? ''}
            onChange={(e) => patch({ area: e.target.value || null })}
          >
            <option value="">Any</option>
            {areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-2xs space-y-1">
          <span className="text-paper-muted uppercase tracking-wide">Route type</span>
          <select
            className="studio-input w-full text-sm min-h-[40px]"
            value={filters.routeType ?? ''}
            onChange={(e) =>
              patch({ routeType: (e.target.value || null) as KcRouteType | null })
            }
          >
            <option value="">Any</option>
            {KC_ROUTE_TYPES.map((r) => (
              <option key={r} value={r}>
                {KC_ROUTE_TYPE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-2xs space-y-1">
          <span className="text-paper-muted uppercase tracking-wide">Evidence state</span>
          <select
            className="studio-input w-full text-sm min-h-[40px]"
            value={filters.evidenceState ?? ''}
            onChange={(e) =>
              patch({
                evidenceState: (e.target.value || null) as KcContactEvidenceState | null,
              })
            }
          >
            <option value="">Any</option>
            {KC_CONTACT_EVIDENCE_STATES.map((s) => (
              <option key={s} value={s}>
                {KC_EVIDENCE_STATE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-2xs space-y-1">
          <span className="text-paper-muted uppercase tracking-wide">Compensation / access</span>
          <select
            className="studio-input w-full text-sm min-h-[40px]"
            value={filters.compensationAccessType ?? ''}
            onChange={(e) =>
              patch({
                compensationAccessType: (e.target.value ||
                  null) as KcCompensationAccessType | null,
              })
            }
          >
            <option value="">Any</option>
            {KC_COMPENSATION_ACCESS_TYPES.map((t) => (
              <option key={t} value={t}>
                {KC_COMPENSATION_ACCESS_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-2xs space-y-1">
          <span className="text-paper-muted uppercase tracking-wide">Freshness</span>
          <select
            className="studio-input w-full text-sm min-h-[40px]"
            value={filters.freshness ?? ''}
            onChange={(e) =>
              patch({ freshness: (e.target.value || null) as KcFreshnessBucket | null })
            }
          >
            <option value="">Any</option>
            {FRESHNESS.map((f) => (
              <option key={f} value={f}>
                {KC_FRESHNESS_LABELS[f]}
              </option>
            ))}
          </select>
        </label>
        <TriState
          label="Direct email"
          value={filters.hasDirectEmail}
          onChange={(v) => patch({ hasDirectEmail: v })}
        />
        <TriState
          label="Application / form"
          value={filters.hasApplicationOrForm}
          onChange={(v) => patch({ hasApplicationOrForm: v })}
        />
        <TriState
          label="Needs verification"
          value={filters.needsVerification}
          onChange={(v) => patch({ needsVerification: v })}
        />
        <TriState
          label="Contacted"
          value={filters.contacted}
          onChange={(v) => patch({ contacted: v })}
        />
        <TriState
          label="Replied"
          value={filters.replied}
          onChange={(v) => patch({ replied: v })}
        />
        <label className="block text-2xs space-y-1 sm:col-span-2">
          <span className="text-paper-muted uppercase tracking-wide">Search</span>
          <input
            className="studio-input w-full text-sm min-h-[40px]"
            value={filters.q ?? ''}
            placeholder="Organization or contact"
            onChange={(e) => patch({ q: e.target.value || null })}
          />
        </label>
      </div>
    </details>
  );
}
