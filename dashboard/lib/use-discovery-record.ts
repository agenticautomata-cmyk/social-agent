'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { clientApiUrl } from './client-api';

export type VerifiedField = {
  value?: unknown;
  status?: string;
  source?: string | null;
};

export type AssistancePackage = {
  whyItMayFit?: Record<string, string>;
  contentOptions?: string[];
  visitPlan?: {
    suggestedTiming?: string;
    address?: string | null;
    mapUrl?: string | null;
    parkingNotes?: string | null;
    filmingRequirements?: string;
    shotList?: string[];
    questionsToAsk?: string[];
    verifyBeforeLeaving?: string[];
    weatherDependent?: boolean;
  };
  contentPackage?: {
    recommendedFormat?: string;
    openingHook?: string;
    hookOptions?: string[];
    talkingPoints?: string[];
    shotList?: string[];
    caption?: string;
    callToAction?: string;
    sourceAttribution?: string;
    disclosure?: string | null;
    searchPhrases?: string[];
    hashtags?: string[];
    unknowns?: string[];
    verificationQuestions?: string[];
  };
  businessAction?: {
    contactChannel?: string | null;
    outreachRecommendation?: string;
    draftOutreach?: string | null;
    visitNormallyInstead?: boolean;
  };
  generatedAt?: string;
};

export type DiscoveryRecord = {
  contentItemId: string;
  normalizedEntityName: string;
  entityType: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  processingStatus: string;
  creatorRelevanceStatus: string;
  lifecycleStatus: string;
  enrichmentComplete: boolean;
  title: string;
  summary: string | null;
  locationName: string | null;
  category: string | null;
  interest: {
    id: string;
    interestLevel: string;
    enrichmentStatus: string;
    nextAction: string | null;
    researchJobId: string | null;
  } | null;
  researchJob: {
    id: string;
    status: string;
    errorMessage: string | null;
    retryCount: number;
  } | null;
  enrichment: Record<string, VerifiedField> | null;
  assistancePackage: AssistancePackage | null;
};

/** Loads a discovery record, optionally kicking off a specific interest action if the
 * assistance package isn't generated yet, and polling while research is in flight. */
export function useDiscoveryRecord(contentItemId: string, ensureAction?: string) {
  const [record, setRecord] = useState<DiscoveryRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const triggered = useRef(false);

  const load = useCallback(async () => {
    const res = await fetch(clientApiUrl(`/api/creator-interest/records/${contentItemId}`), {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Failed to load record (${res.status})`);
    const data = (await res.json()) as { record: DiscoveryRecord };
    setRecord(data.record);
    return data.record;
  }, [contentItemId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rec = await load();
        if (
          !cancelled &&
          ensureAction &&
          !triggered.current &&
          !rec.assistancePackage &&
          !rec.researchJob
        ) {
          triggered.current = true;
          await fetch(clientApiUrl(`/api/creator-interest/records/${contentItemId}/interest`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: ensureAction, sourceScreen: 'discovery_workflow' }),
          });
          if (!cancelled) await load();
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Load failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentItemId]);

  useEffect(() => {
    if (record?.researchJob?.status !== 'researching' && record?.researchJob?.status !== 'queued') return;
    const timer = window.setInterval(() => {
      void load();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [record?.researchJob?.status, load]);

  return { record, error, loading, reload: load, setRecord };
}
