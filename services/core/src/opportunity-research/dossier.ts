import { randomUUID } from 'node:crypto';
import type {
  ClaimedFact,
  ClaimLabel,
  OfficialBusinessInfo,
  OpportunityResearchDossier,
  ResearchCitation,
} from './types.js';
import { emptyStages } from './stages.js';

export function emptyClaim<T = string>(label: ClaimLabel = 'not_found'): ClaimedFact<T> {
  return { value: null, label, citations: [] };
}

export function claimFrom(
  value: string | null | undefined,
  label: ClaimLabel,
  citations: ResearchCitation[] = [],
  note?: string | null,
): ClaimedFact {
  if (value == null || value === '') {
    return { value: null, label: label === 'verified' ? 'not_found' : label, citations, note };
  }
  return { value, label, citations, note: note ?? null };
}

export function emptyBusinessInfo(): OfficialBusinessInfo {
  return {
    officialName: emptyClaim(),
    parentCompany: emptyClaim(),
    category: emptyClaim(),
    website: emptyClaim(),
    locationPage: emptyClaim(),
    streetAddress: emptyClaim(),
    cityStateZip: emptyClaim(),
    phone: emptyClaim(),
    hours: emptyClaim(),
    openingDate: emptyClaim(),
    grandOpening: emptyClaim(),
    appointmentsRequired: emptyClaim(),
    offerings: { value: null, label: 'not_found', citations: [] },
    socials: { value: null, label: 'not_found', citations: [] },
    mapLink: emptyClaim(),
  };
}

export function createEmptyDossier(input: {
  contentItemId: string;
  researchRunId?: string;
  emailSource?: string | null;
  articleUrls?: string[];
  gmailMessageIds?: string[];
}): OpportunityResearchDossier {
  const now = new Date();
  const staleAfter = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
  return {
    schemaVersion: 1,
    researchRunId: input.researchRunId ?? randomUUID(),
    contentItemId: input.contentItemId,
    researchedAt: now.toISOString(),
    fingerprint: 'empty',
    status: 'queued',
    currentStageId: null,
    stages: emptyStages(),
    business: emptyBusinessInfo(),
    contacts: [],
    programs: [],
    news: [],
    provenance: {
      emailSource: input.emailSource ?? null,
      articleUrls: input.articleUrls ?? [],
      gmailMessageIds: input.gmailMessageIds ?? [],
    },
    fit: [],
    contentRecommendations: [],
    outreachPrep: null,
    missingOrConflicting: [],
    recommendedNextAction: 'Run Research this to build a source-backed opportunity dossier.',
    lastSuccessfulResearchAt: null,
    lastFailedResearchAt: null,
    staleAfter,
    changedFacts: [],
    history: [],
    autoOutreach: false,
    telegramNotified: false,
  };
}

/** Prefer official over directory when both present and conflict. */
export function preferOfficialClaim(
  official: ClaimedFact | null | undefined,
  directory: ClaimedFact | null | undefined,
): ClaimedFact {
  if (official?.value && official.label !== 'not_found' && official.label !== 'blocked') {
    if (
      directory?.value &&
      directory.value !== official.value &&
      (directory.label === 'verified' || directory.label === 'partially_verified')
    ) {
      return {
        ...official,
        label: official.label === 'verified' ? 'verified' : 'partially_verified',
        note: `Preferred official source over directory (${directory.value})`,
      };
    }
    return official;
  }
  if (directory?.value) {
    return {
      ...directory,
      label: directory.label === 'verified' ? 'partially_verified' : directory.label,
      note: directory.note ?? 'Directory source — confirm against official when available',
    };
  }
  return official ?? directory ?? emptyClaim();
}
