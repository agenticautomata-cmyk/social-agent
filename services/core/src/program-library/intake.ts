import { extractUrls } from '../ask-benson/collect-from-link.js';
import type { AskBensonResponse } from '../ask-benson/types.js';
import {
  buildCanonicalProgramIdentity,
  extractBrandFromProgramUrl,
  extractProgramNameFromUrl,
  extractProgramNamesFromMessage,
  inferProgramTypeFromText,
  inferScopeFromText,
  isProgramLibrarySaveIntent,
  isProgramLibraryVerifyIntent,
} from './canonical.js';
import { formatProgramLibraryDeltaAnswer, saveProgramToLibrary } from './save.js';
import { PROGRAM_LIBRARY_OPERATOR_TITLE } from './labels.js';
import { getProgramLibraryRecord } from './list.js';
import { verifyProgramMissingInfo } from './enrich.js';
import { claimValue, readProgramLibraryPayload } from './metadata.js';
import { db } from '../db.js';
import { creatorPartnerships } from '../schema.js';
import { eq } from 'drizzle-orm';
import { readPartnershipMetadata } from '../creator-partnership/partnership-sources.js';

export type ProgramLibraryIntakeResult =
  | { handled: true; response: AskBensonResponse }
  | { handled: false };

function buildIntakeAnswer(input: {
  brandName: string;
  programName: string;
  created: boolean;
  changes: string[];
  verified: boolean;
  missingFields: string[];
  programId: string;
}): { answer: string; suggestedActions: Array<{ label: string; href: string }> } {
  const base = formatProgramLibraryDeltaAnswer({
    brandName: input.brandName,
    programName: input.programName,
    created: input.created,
    changes: input.changes,
  });

  const suggestedActions: Array<{ label: string; href: string }> = [
    {
      label: `Open ${PROGRAM_LIBRARY_OPERATOR_TITLE}`,
      href: `/program-library/${input.programId}`,
    },
  ];

  if (input.verified) {
    return { answer: base, suggestedActions };
  }

  if (input.missingFields.length === 0) {
    return { answer: base, suggestedActions };
  }

  suggestedActions.unshift({
    label: 'Verify missing info',
    href: `/program-library/${input.programId}`,
  });

  const answer = [
    'WHAT I DID',
    input.created
      ? `Saved **${input.programName}** to ${PROGRAM_LIBRARY_OPERATOR_TITLE}.`
      : `Reused **${input.programName}** in ${PROGRAM_LIBRARY_OPERATOR_TITLE}.`,
    '',
    'STILL NEEDED',
    `Missing fields require verification (${input.missingFields.join(', ')}).`,
    '',
    'NEXT',
    'Verify missing info',
  ].join('\n');

  return { answer, suggestedActions };
}

function missingProgramFields(payload: {
  commissionBenefit?: { value?: string | null } | null;
  cookieWindow?: { value?: string | null } | null;
  affiliateNetwork?: { value?: string | null } | null;
  officialProgramUrl?: { value?: string | null } | null;
}): string[] {
  const missing: string[] = [];
  if (!claimValue(payload.commissionBenefit)) missing.push('commission');
  if (!claimValue(payload.cookieWindow)) missing.push('cookie window');
  if (!claimValue(payload.affiliateNetwork)) missing.push('network/platform');
  if (!claimValue(payload.officialProgramUrl)) missing.push('official program URL');
  return missing;
}

export async function tryProgramLibraryIntake(input: {
  message: string;
  conversationId: string;
  sourceScreen?: string;
  /** @internal test hook — skip paid search when verifying */
  testVerifyProgramMissingInfo?: typeof verifyProgramMissingInfo;
}): Promise<ProgramLibraryIntakeResult> {
  const message = input.message.trim();
  if (!message) return { handled: false };

  const urls = extractUrls(message);
  const isSave = isProgramLibrarySaveIntent(message);
  if (!isSave) return { handled: false };

  const names = extractProgramNamesFromMessage(message);
  const programType = inferProgramTypeFromText(message);
  const scope = inferScopeFromText(message);
  const shouldVerify = isProgramLibraryVerifyIntent(message);

  let brandName = names.brandName;
  if (!brandName && urls[0]) {
    brandName = extractBrandFromProgramUrl(urls[0]);
  }
  if (!brandName) return { handled: false };

  const programName =
    names.programName ??
    (urls[0] ? extractProgramNameFromUrl(urls[0], brandName) : brandName);

  const result = await saveProgramToLibrary({
    brandName,
    programName,
    programType,
    scope,
    officialProgramUrl: urls[0] ?? null,
    evidenceUrls: urls,
    sourceScreen: input.sourceScreen ?? 'ask_benson',
    operatorSupplied: true,
    notes: urls.length > 0 ? `URL intake: ${urls.join(', ')}` : undefined,
  });

  let verified = false;
  let searchCalls = 0;
  if (shouldVerify) {
    const verifyFn = input.testVerifyProgramMissingInfo ?? verifyProgramMissingInfo;
    const verifyResult = await verifyFn(result.programId, {
      operatorAuthorized: true,
      force: true,
      skipRecentVerifyCheck: true,
      caller: 'program_library.ask_benson_verify',
      trigger: 'ask_benson_store_and_verify',
    });
    verified = !verifyResult.skipped;
    searchCalls = verifyResult.searchCalls;
  }

  const record = await getProgramLibraryRecord(result.programId);
  const [row] = await db
    .select()
    .from(creatorPartnerships)
    .where(eq(creatorPartnerships.id, result.programId))
    .limit(1);
  const payload = row
    ? readProgramLibraryPayload(readPartnershipMetadata(row.metadata))
    : null;
  const missingFields = payload
    ? missingProgramFields(payload)
    : ['commission', 'cookie window', 'network/platform'];

  const { answer, suggestedActions } = buildIntakeAnswer({
    brandName: record?.brandName ?? brandName,
    programName: record?.programName ?? programName,
    created: result.created,
    changes: result.changes,
    verified,
    missingFields,
    programId: result.programId,
  });

  return {
    handled: true,
    response: {
      ok: true,
      answer,
      evidence: result.changes.map((change) => ({
        label: PROGRAM_LIBRARY_OPERATOR_TITLE,
        value: change,
        source: 'program_library',
      })),
      suggestedActions,
      usedData: ['program_library'],
      confidence: 0.92,
      conversationId: input.conversationId,
      messageId: null,
      cached: false,
      tokenUsage: null,
      estimatedCost: null,
      programLibrary: {
        programId: result.programId,
        canonicalIdentity: result.canonicalIdentity,
        created: result.created,
        verified,
        searchCalls,
      },
    } as AskBensonResponse,
  };
}

export { buildCanonicalProgramIdentity, isProgramLibrarySaveIntent, isProgramLibraryVerifyIntent };
