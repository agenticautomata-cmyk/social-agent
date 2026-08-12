import { eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { creatorPartnerships } from '../schema.js';
import { readPartnershipMetadata } from '../creator-partnership/partnership-sources.js';
import { shouldSkipBackgroundLlm } from '../llm-spend/index.js';
import {
  claimValue,
  readProgramLibraryMode,
  readProgramLibraryPayload,
  type PartnershipProgramLibraryMetadata,
} from './metadata.js';
import { isProgramLibraryTestArtifact } from './test-artifacts.js';
import { verifyProgramMissingInfo, type EnrichProgramLibraryResult } from './enrich.js';
import { getProgramLibraryRecord } from './list.js';
import type { ProgramLibraryEnrichOptions, ProgramLibraryPayload, VerificationDisplayState } from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_VERIFY_MS = 7 * DAY_MS;
const STALE_FULLY_VERIFIED_MS = 30 * DAY_MS;
const ENRICHMENT_BACKOFF_MS = 24 * 60 * 60 * 1000;

export type EnrichmentAttemptResult =
  | 'success'
  | 'no_result'
  | 'failed'
  | 'skipped_budget'
  | 'skipped_recent';

export type AutoEnrichmentSelection = {
  programId: string;
  brandName: string;
  priority: number;
  reason: string;
};

export type AutoEnrichmentCycleResult = {
  ran: boolean;
  skipReason?: string;
  programId?: string;
  brandName?: string;
  enrichResult?: EnrichProgramLibraryResult;
  searchCalls: number;
  modeAfter?: string;
  caller?: string;
  context?: string;
  process?: string;
};

function isFullyVerifiedState(state: VerificationDisplayState): boolean {
  return (
    state === 'verified_official' ||
    state === 'verified_network' ||
    state === 'secondary_source'
  );
}

function needsVerificationFocus(payload: ProgramLibraryPayload): boolean {
  return (
    payload.verificationDisplayState === 'needs_verification' ||
    payload.verificationDisplayState === 'operator_supplied' ||
    payload.operatorSuppliedMasterList === true
  );
}

function isRecentlyVerified(payload: ProgramLibraryPayload, now: Date): boolean {
  if (!payload.lastVerifiedAt) return false;
  const ageMs = now.getTime() - Date.parse(payload.lastVerifiedAt);
  const windowMs = isFullyVerifiedState(payload.verificationDisplayState)
    ? STALE_FULLY_VERIFIED_MS
    : RECENT_VERIFY_MS;
  return ageMs < windowMs;
}

function isInEnrichmentBackoff(metadata: PartnershipProgramLibraryMetadata, now: Date): boolean {
  const next = metadata.nextEligibleEnrichmentAt;
  if (!next) return false;
  return Date.parse(next) > now.getTime();
}

export function scoreProgramForAutoEnrichment(
  metadata: PartnershipProgramLibraryMetadata,
  payload: ProgramLibraryPayload,
  now: Date = new Date(),
): AutoEnrichmentSelection | null {
  const mode = readProgramLibraryMode(metadata);
  if (mode !== 'saved') return null;
  if (isProgramLibraryTestArtifact(metadata, payload)) return null;
  if (isInEnrichmentBackoff(metadata, now)) return null;
  if (isRecentlyVerified(payload, now)) return null;

  const officialUrl = claimValue(payload.officialProgramUrl);
  const applicationUrl = claimValue(payload.applicationUrl);
  const commission = claimValue(payload.commissionBenefit);
  const network = claimValue(payload.affiliateNetwork);
  const eligibility = claimValue(payload.eligibility);
  const cookie = claimValue(payload.cookieWindow);
  const contact = claimValue(payload.contactPath);
  const needsFocus = needsVerificationFocus(payload);

  if (needsFocus && !officialUrl && !applicationUrl) {
    return {
      programId: '',
      brandName: payload.brandName,
      priority: 100,
      reason: 'missing_official_or_application_url',
    };
  }
  if (needsFocus && !commission) {
    return {
      programId: '',
      brandName: payload.brandName,
      priority: 200,
      reason: 'missing_commission_or_benefit',
    };
  }
  if (!network) {
    return {
      programId: '',
      brandName: payload.brandName,
      priority: 300,
      reason: 'missing_affiliate_network',
    };
  }
  if (!eligibility || !cookie || !contact) {
    return {
      programId: '',
      brandName: payload.brandName,
      priority: 400,
      reason: 'missing_eligibility_cookie_or_contact',
    };
  }
  if (
    isFullyVerifiedState(payload.verificationDisplayState) &&
    payload.lastVerifiedAt &&
    now.getTime() - Date.parse(payload.lastVerifiedAt) >= STALE_FULLY_VERIFIED_MS
  ) {
    return {
      programId: '',
      brandName: payload.brandName,
      priority: 500,
      reason: 'stale_fully_verified',
    };
  }

  return null;
}

export async function selectProgramForAutoEnrichment(
  options: { now?: Date; excludeProgramIds?: string[] } = {},
): Promise<AutoEnrichmentSelection | null> {
  const now = options.now ?? new Date();
  const exclude = new Set(options.excludeProgramIds ?? []);

  const rows = await db
    .select()
    .from(creatorPartnerships)
    .where(sql`metadata ? 'programLibrary'`)
    .limit(200);

  let best: (AutoEnrichmentSelection & { programId: string; updatedAt: Date }) | null = null;

  for (const row of rows) {
    if (exclude.has(row.id)) continue;
    const metadata = readPartnershipMetadata(row.metadata) as PartnershipProgramLibraryMetadata;
    const payload = readProgramLibraryPayload(metadata);
    if (!payload) continue;
    if (isProgramLibraryTestArtifact(metadata, payload)) continue;

    const scored = scoreProgramForAutoEnrichment(metadata, payload, now);
    if (!scored) continue;

    const candidate = { ...scored, programId: row.id, updatedAt: row.updatedAt };
    if (
      !best ||
      candidate.priority < best.priority ||
      (candidate.priority === best.priority && candidate.updatedAt < best.updatedAt)
    ) {
      best = candidate;
    }
  }

  if (!best) return null;
  return {
    programId: best.programId,
    brandName: best.brandName,
    priority: best.priority,
    reason: best.reason,
  };
}

function mapEnrichmentOutcome(result: EnrichProgramLibraryResult): EnrichmentAttemptResult {
  if (result.skipped) {
    if (result.skipReason === 'background_budget_gate' || result.skipReason === 'recently_verified') {
      return result.skipReason === 'background_budget_gate' ? 'skipped_budget' : 'skipped_recent';
    }
    return 'no_result';
  }
  if (result.searchCalls === 0) return 'no_result';
  return result.changes.length > 0 ? 'success' : 'no_result';
}

export async function persistEnrichmentAttempt(
  programId: string,
  outcome: EnrichmentAttemptResult,
  now: Date = new Date(),
): Promise<void> {
  const [row] = await db
    .select()
    .from(creatorPartnerships)
    .where(eq(creatorPartnerships.id, programId))
    .limit(1);
  if (!row) return;

  const metadata = readPartnershipMetadata(row.metadata) as PartnershipProgramLibraryMetadata;
  const patch: PartnershipProgramLibraryMetadata = {
    ...metadata,
    lastEnrichmentAttemptAt: now.toISOString(),
    lastEnrichmentResult: outcome,
  };
  if (outcome === 'success' || outcome === 'skipped_budget' || outcome === 'skipped_recent') {
    delete patch.nextEligibleEnrichmentAt;
  } else {
    patch.nextEligibleEnrichmentAt = new Date(now.getTime() + ENRICHMENT_BACKOFF_MS).toISOString();
  }

  await db
    .update(creatorPartnerships)
    .set({
      metadata: patch,
      updatedAt: now,
    })
    .where(eq(creatorPartnerships.id, programId));
}

export async function runProgramLibraryAutoEnrichmentCycle(
  options: ProgramLibraryEnrichOptions & { now?: Date; testOnlyProgramId?: string } = {},
): Promise<AutoEnrichmentCycleResult> {
  const caller = 'program_library.auto_enrichment';
  const context = 'background';
  const process = 'worker';

  if (!options.testSkipBudgetGate && shouldSkipBackgroundLlm('web_search')) {
    return {
      ran: false,
      skipReason: 'background_budget_gate',
      searchCalls: 0,
      caller,
      context,
      process,
    };
  }

  let selection = options.testOnlyProgramId
    ? null
    : await selectProgramForAutoEnrichment({ now: options.now });

  if (options.testOnlyProgramId) {
    const [row] = await db
      .select()
      .from(creatorPartnerships)
      .where(eq(creatorPartnerships.id, options.testOnlyProgramId))
      .limit(1);
    const payload = row ? readProgramLibraryPayload(readPartnershipMetadata(row.metadata)) : null;
    if (row && payload) {
      selection = {
        programId: row.id,
        brandName: payload.brandName,
        priority: 0,
        reason: 'test_only',
      };
    }
  }

  if (!selection) {
    return {
      ran: false,
      skipReason: 'no_eligible_program',
      searchCalls: 0,
      caller,
      context,
      process,
    };
  }

  let capturedSearchOpts: unknown = null;
  const testSearchWeb = options.testSearchWeb
    ? (async (query: string, instructions: string, searchOpts: unknown) => {
        capturedSearchOpts = searchOpts;
        return options.testSearchWeb!(query, instructions, searchOpts as never);
      }) as typeof options.testSearchWeb
    : undefined;

  const enrichResult = await verifyProgramMissingInfo(selection.programId, {
    ...options,
    testSearchWeb: testSearchWeb as never,
    caller,
    process,
    trigger: 'auto_enrichment',
    skipRecentVerifyCheck: true,
  });

  const outcome = mapEnrichmentOutcome(enrichResult);
  if (outcome !== 'skipped_budget' && outcome !== 'skipped_recent') {
    await persistEnrichmentAttempt(selection.programId, outcome, options.now ?? new Date());
  }

  const [row] = await db
    .select()
    .from(creatorPartnerships)
    .where(eq(creatorPartnerships.id, selection.programId))
    .limit(1);
  const modeAfter = row
    ? (readProgramLibraryMode(readPartnershipMetadata(row.metadata)) ?? 'saved')
    : undefined;

  return {
    ran: true,
    programId: selection.programId,
    brandName: selection.brandName,
    enrichResult,
    searchCalls: enrichResult.searchCalls,
    modeAfter,
    caller,
    context,
    process,
    ...(capturedSearchOpts ? { _testSearchOpts: capturedSearchOpts } : {}),
  } as AutoEnrichmentCycleResult & { _testSearchOpts?: unknown };
}

export async function countSavedProgramsNeedingEnrichment(
  now: Date = new Date(),
): Promise<number> {
  const rows = await db
    .select()
    .from(creatorPartnerships)
    .where(sql`metadata ? 'programLibrary'`)
    .limit(200);

  let count = 0;
  for (const row of rows) {
    const metadata = readPartnershipMetadata(row.metadata) as PartnershipProgramLibraryMetadata;
    const payload = readProgramLibraryPayload(metadata);
    if (!payload) continue;
    if (isProgramLibraryTestArtifact(metadata, payload)) continue;
    if (scoreProgramForAutoEnrichment(metadata, payload, now)) count += 1;
  }
  return count;
}
