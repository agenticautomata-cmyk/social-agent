import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { creatorPartnerships } from '../schema.js';
import { readPartnershipMetadata } from '../creator-partnership/partnership-sources.js';
import { searchWeb, type SearchWebOptions } from '../web-research/index.js';
import { shouldSkipBackgroundLlm } from '../llm-spend/index.js';
import {
  mergeFieldClaim,
  readProgramLibraryPayload,
  claimValue,
  type PartnershipProgramLibraryMetadata,
} from './metadata.js';
import {
  buildResearchedClaim,
  buildUrlResolutionMap,
  isUntrustedEvidenceUrl,
  resolveEvidenceUrl,
} from './evidence-authority.js';
import { recomputeProgramLibraryClaimSemantics } from './claim-semantics.js';
import type { ProgramLibraryEnrichOptions } from './types.js';

const RECENT_VERIFY_MS = 7 * 24 * 60 * 60 * 1000;

export type EnrichProgramLibraryResult = {
  programId: string;
  skipped: boolean;
  skipReason?: string;
  searchCalls: number;
  changes: string[];
  verificationDisplayState: string;
};

export async function verifyProgramMissingInfo(
  programId: string,
  options: ProgramLibraryEnrichOptions = {},
): Promise<EnrichProgramLibraryResult> {
  const searchFn = options.testSearchWeb ?? searchWeb;

  if (!options.testSkipBudgetGate && !options.operatorAuthorized) {
    const gate = await shouldSkipBackgroundLlm('web_search');
    if (gate.skip) {
      return {
        programId,
        skipped: true,
        skipReason: gate.reason ?? 'background_budget_gate',
        searchCalls: 0,
        changes: [],
        verificationDisplayState: 'needs_verification',
      };
    }
  }

  const [row] = await db
    .select()
    .from(creatorPartnerships)
    .where(eq(creatorPartnerships.id, programId))
    .limit(1);
  if (!row) throw new Error('program_not_found');

  const metadata = readPartnershipMetadata(row.metadata) as PartnershipProgramLibraryMetadata;
  const payload = readProgramLibraryPayload(metadata);
  if (!payload) throw new Error('not_program_library_record');

  if (
    !options.force &&
    !options.skipRecentVerifyCheck &&
    payload.lastVerifiedAt &&
    Date.now() - Date.parse(payload.lastVerifiedAt) < RECENT_VERIFY_MS
  ) {
    return {
      programId,
      skipped: true,
      skipReason: 'recently_verified',
      searchCalls: 0,
      changes: [],
      verificationDisplayState: payload.verificationDisplayState,
    };
  }

  const searchOpts: SearchWebOptions = {
    context: options.operatorAuthorized ? 'user' : 'background',
    caller:
      options.caller ??
      (options.operatorAuthorized
        ? 'program_library.operator_verification'
        : 'program_library.verify_missing_info'),
    module: 'program_library',
    partnershipId: programId,
    trigger: options.trigger ?? (options.operatorAuthorized ? 'operator_verification' : 'verify_missing_info'),
    process: options.process ?? 'api',
  };

  let searchCalls = 0;
  const changes: string[] = [];
  const conflicts = [...payload.conflictingClaims];
  let next = { ...payload };

  const query = `${payload.brandName} official affiliate creator influencer program commission application`;
  const result = await searchFn(query, 'Find official brand program page, application URL, commission terms.', searchOpts);
  searchCalls += result.skipped ? 0 : 1;

  if (result.skipped || !result.ok) {
    return {
      programId,
      skipped: true,
      skipReason: result.skipped ? 'search_skipped' : 'search_failed',
      searchCalls,
      changes,
      verificationDisplayState: payload.verificationDisplayState,
    };
  }

  const citation = result.citations.find((c) => c.url && !isUntrustedEvidenceUrl(c.url)) ?? result.citations[0];
  const summary = result.summary ?? '';

  if (citation?.url && !isUntrustedEvidenceUrl(citation.url) && !next.evidenceUrls.includes(citation.url)) {
    next.evidenceUrls = [...next.evidenceUrls, citation.url];
    changes.push('Added official evidence URL');
  }

  const affiliateNetwork = claimValue(next.affiliateNetwork);
  let citationResolved = false;
  if (citation?.url && !isUntrustedEvidenceUrl(citation.url)) {
    citationResolved = await resolveEvidenceUrl(citation.url);
  }

  const commissionMatch = summary.match(/(\d{1,2}(?:\.\d+)?(?:\s*[-–]\s*\d{1,2}(?:\.\d+)?)?%)/);
  if (commissionMatch && citation?.url && !isUntrustedEvidenceUrl(citation.url)) {
    const merged = mergeFieldClaim({
      existing: next.commissionBenefit,
      incoming: buildResearchedClaim({
        value: commissionMatch[1]!.replace(/\s+/g, ''),
        url: citation.url,
        brandName: payload.brandName,
        affiliateNetwork,
        urlResolved: citationResolved,
      }),
      field: 'commission/benefit',
      conflicts,
    });
    if (merged.changed) {
      next.commissionBenefit = merged.claim;
      changes.push('Updated commission/benefit from official evidence');
    }
    if (merged.conflictAdded) changes.push('Commission conflict surfaced');
  }

  if (
    citation?.url &&
    !isUntrustedEvidenceUrl(citation.url) &&
    /affiliate|creator|influencer|partner|referral|ambassador/i.test(citation.url)
  ) {
    const merged = mergeFieldClaim({
      existing: next.officialProgramUrl,
      incoming: buildResearchedClaim({
        value: citation.url,
        url: citation.url,
        brandName: payload.brandName,
        affiliateNetwork,
        urlResolved: citationResolved,
      }),
      field: 'official program URL',
      conflicts,
    });
    if (merged.changed) {
      next.officialProgramUrl = merged.claim;
      changes.push('Updated official program URL');
    }
  }

  next.conflictingClaims = conflicts;
  next.lastVerifiedAt = new Date().toISOString();

  const semanticsUrls = [...next.evidenceUrls];
  if (citation?.url) semanticsUrls.push(citation.url);
  const resolutionMap = await buildUrlResolutionMap(semanticsUrls, resolveEvidenceUrl);
  const semantics = recomputeProgramLibraryClaimSemantics(next, resolutionMap);
  next = semantics.payload;
  if (semantics.notes.length) changes.push(...semantics.notes);

  await db
    .update(creatorPartnerships)
    .set({
      metadata: {
        ...metadata,
        programLibrary: next,
      },
      updatedAt: new Date(),
    })
    .where(eq(creatorPartnerships.id, programId));

  return {
    programId,
    skipped: false,
    searchCalls,
    changes,
    verificationDisplayState: next.verificationDisplayState,
  };
}
