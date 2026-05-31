/** Shared terminology data and helpers — no feature-flag or Node imports. */

export type TerminologyCopy = {
  nav: {
    campaigns: string;
    queue: string;
  };
  fields: {
    title: string;
    angle: string;
    summary: string;
    category: string;
    source: string;
    opportunity: string;
  };
  meta: {
    industry: string;
    campaign: string;
  };
  pages: {
    campaigns: {
      section: string;
      title: string;
      subtitle: string;
    };
    campaignDetail: {
      backLink: string;
      sectionPrefix: string;
      industriesSection: string;
      industriesField: string;
      categoriesColumn: string;
      weeklySub: string;
    };
    queue: {
      section: string;
      title: string;
      subtitle: string;
      emptyFilter: string;
    };
    approvals: {
      subtitle: string;
      emptyInbox: string;
      rejectPlaceholder: string;
      bensonAttribution: string;
    };
    overview: {
      sourcesSection: string;
      manageLink: string;
      noItems: string;
      tileSubs: {
        planned: string;
        inFlight: string;
        scheduled: string;
        published: string;
        failed: string;
      };
    };
    runs: {
      subtitle: string;
      empty: string;
    };
  };
};

export const LEGACY_STATE_LABELS: Record<string, string> = {
  planned: 'planned',
  script_drafted: 'awaiting_approval',
  script_approved: 'approved',
  script_rejected: 'rejected',
  assets_ready: 'assets_ready',
  video_generating: 'generating',
  video_ready: 'video_ready',
  post_production: 'post_production',
  ready_to_publish: 'ready',
  scheduled: 'scheduled',
  published: 'published',
  failed: 'failed',
  cancelled: 'cancelled',
};

export const BENSON_STATE_LABELS: Record<string, string> = {
  planned: 'discovered',
  script_drafted: 'pending_review',
  script_approved: 'approved',
  script_rejected: 'rejected',
  assets_ready: 'processing',
  video_generating: 'processing',
  video_ready: 'processing',
  post_production: 'processing',
  ready_to_publish: 'processing',
  scheduled: 'processing',
  published: 'published',
  failed: 'failed',
  cancelled: 'archived',
};

export const LEGACY_FILTER_LABELS: Record<string, string> = {
  '': 'all',
  planned: 'planned',
  script_drafted: 'drafted',
  video_generating: 'generating',
  video_ready: 'video_ready',
  ready_to_publish: 'ready',
  scheduled: 'scheduled',
  published: 'published',
  failed: 'failed',
};

export const BENSON_FILTER_LABELS: Record<string, string> = {
  '': 'all',
  planned: 'discovered',
  script_drafted: 'pending_review',
  video_generating: 'processing',
  video_ready: 'processing',
  ready_to_publish: 'processing',
  scheduled: 'processing',
  published: 'published',
  failed: 'failed',
};

export const legacyTerminology: TerminologyCopy = {
  nav: { campaigns: 'campaigns', queue: 'queue' },
  fields: {
    title: 'topic',
    angle: 'hook',
    summary: 'script',
    category: 'industry',
    source: 'campaign',
    opportunity: 'content',
  },
  meta: { industry: 'industry', campaign: 'campaign' },
  pages: {
    campaigns: {
      section: '// §1 campaigns',
      title: 'campaigns',
      subtitle: '// quotas, autonomy, posting cadence',
    },
    campaignDetail: {
      backLink: '← back to campaigns',
      sectionPrefix: '// campaign /',
      industriesSection: '// industries',
      industriesField: 'industries',
      categoriesColumn: 'name',
      weeklySub: 'items / week',
    },
    queue: {
      section: '// §1 queue',
      title: 'queue',
      subtitle: '// every content item, every state',
      emptyFilter: '// [empty] no items match this filter.',
    },
    approvals: {
      subtitle:
        '// scripts awaiting human review. reject sends back to planner with feedback;\nscript-writer regenerates with the rejection reason in the prompt.',
      emptyInbox: 'no scripts pending approval.',
      rejectPlaceholder: 'why reject? (sent back to script-writer for regeneration)',
      bensonAttribution: '',
    },
    overview: {
      sourcesSection: '// §2 campaigns',
      manageLink: 'manage →',
      noItems: '// no items yet — trigger the planner',
      tileSubs: {
        planned: 'awaiting script',
        inFlight: 'workers active',
        scheduled: 'publish queue',
        published: 'live on platforms',
        failed: 'needs review',
      },
    },
    runs: {
      subtitle: '// audit log · every state transition by every worker',
      empty: '// [empty] no runs yet — start the workers and trigger the planner.',
    },
  },
};

export const bensonTerminology: TerminologyCopy = {
  nav: { campaigns: 'sources', queue: 'opportunities' },
  fields: {
    title: 'title',
    angle: 'angle',
    summary: 'summary',
    category: 'category',
    source: 'source',
    opportunity: 'opportunity',
  },
  meta: { industry: 'category', campaign: 'source' },
  pages: {
    campaigns: {
      section: '// §1 sources',
      title: 'sources',
      subtitle: '// workspace config, autonomy, scan cadence',
    },
    campaignDetail: {
      backLink: '← back to sources',
      sectionPrefix: '// source /',
      industriesSection: '// categories',
      industriesField: 'categories',
      categoriesColumn: 'category',
      weeklySub: 'opportunities / week',
    },
    queue: {
      section: '// §1 opportunities',
      title: 'opportunities',
      subtitle: '// every opportunity, every state',
      emptyFilter: '// [empty] no opportunities match this filter.',
    },
    approvals: {
      subtitle:
        '// summaries awaiting your review. reject sends opportunity back to Benson with feedback;\nthe scorer regenerates with the rejection reason.',
      emptyInbox: 'no opportunities pending review.',
      rejectPlaceholder: 'why reject? (sent back to scorer for regeneration)',
      bensonAttribution: 'Benson drafted this summary',
    },
    overview: {
      sourcesSection: '// §2 sources',
      manageLink: 'configure sources →',
      noItems: '// no opportunities yet — trigger a scan',
      tileSubs: {
        planned: 'awaiting summary',
        inFlight: 'Benson processing',
        scheduled: 'review queue',
        published: 'archived live',
        failed: 'needs review',
      },
    },
    runs: {
      subtitle: '// audit log · every opportunity state transition',
      empty: '// [empty] no runs yet — start the workers and trigger a scan.',
    },
  },
};

export function useBensonTerminologyMode(flags: {
  enableBensonTerminology: boolean;
  enableOpportunitiesUi: boolean;
}): boolean {
  return flags.enableBensonTerminology || flags.enableOpportunitiesUi;
}

export function getTerminologyForMode(useBenson: boolean): TerminologyCopy {
  return useBenson ? bensonTerminology : legacyTerminology;
}

export function displayStateForMode(state: string, useBenson: boolean): string {
  const labels = useBenson ? BENSON_STATE_LABELS : LEGACY_STATE_LABELS;
  return labels[state] ?? state;
}

export function displayFilterLabelForMode(stateValue: string, useBenson: boolean): string {
  const labels = useBenson ? BENSON_FILTER_LABELS : LEGACY_FILTER_LABELS;
  return labels[stateValue] ?? stateValue;
}

/** Approval card field labels for client components. */
export type ApprovalCardLabels = {
  angle: string;
  summary: string;
  metaIndustry: string;
  metaCampaign: string;
  rejectPlaceholder: string;
  attribution: string;
};

export function getApprovalCardLabelsForMode(useBenson: boolean): ApprovalCardLabels {
  const t = getTerminologyForMode(useBenson);
  return {
    angle: t.fields.angle,
    summary: t.fields.summary,
    metaIndustry: t.meta.industry,
    metaCampaign: t.meta.campaign,
    rejectPlaceholder: t.pages.approvals.rejectPlaceholder,
    attribution: t.pages.approvals.bensonAttribution,
  };
}

/** Overview greeting when terminology is on and branding is off. */
export function getTerminologyOverviewGreeting(): string {
  return '// opportunities across all sources';
}

export function getTerminologyOverviewSubline(): string | undefined {
  return 'Benson surfaces what matters — review pending items in approvals.';
}
