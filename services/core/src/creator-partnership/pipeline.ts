import { desc, eq, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { campaigns, contentItems, creatorPartnerships } from '../schema.js';
import { fetchUrlWithPipeline } from '../ask-benson/url-intake-pipeline.js';
import { extractUrls } from '../ask-benson/collect-from-link.js';
import { emitDataChange } from '../data-revision/index.js';
import { inferNamesFromSubmission, isCreatorPartnershipIntake } from './detect.js';
import { buildCreatorPlay } from './creator-play.js';
import { inferMonetizationPaths, scoreCreatorPartnershipFit } from './fit-score.js';
import { buildPartnershipFingerprints } from './fingerprints.js';
import { persistPartnershipFingerprints } from './activities.js';
import { researchCreatorPartnership } from './research.js';
import { searchWeb } from '../web-research/index.js';
import {
  bindBensonAssistantResearchRun,
  patchBensonAssistantMessagesTerminal,
} from '../ask-benson/conversations.js';
import {
  buildBensonUiCardFromBrief,
  joinActivePartnershipResearchForChat,
  terminalChatPatchFromAuthority,
} from '../ask-benson/research-correlation.js';
import {
  claimPartnershipResearch,
  completePartnershipResearchFenced,
  failPartnershipResearchFenced,
  readPartnershipResearchAuthority,
  shouldAttemptPartnershipResearch,
  type ClaimPartnershipResearchResult,
} from './research-singleflight.js';
import {
  applyFieldVerificationResult,
  buildCallLocationScript,
  buildFieldVerificationTasks,
  shouldOfferRebuildCreatorPlay,
  type SaveFieldVerificationInput,
} from './field-verification.js';
import {
  attachPartnershipSource,
  findPartnershipIdByFingerprint,
  findPartnershipIdByNormalizedSource,
  readPartnershipMetadata,
  type PartnershipMetadata,
} from './partnership-sources.js';
import {
  buildOpportunityFingerprint,
  inferBrandSlugFromIntel,
  inferSourceRoleFromIntel,
  parsePartnershipUrl,
  retailerNameFromDomain,
  titleCaseSlug,
} from './url-intelligence.js';
import {
  buildCompletedDecisionBrief,
  buildProvisionalDecisionBrief,
  buildTitleFromUrlIntel,
  formatCompletedBriefAnswer,
} from './decision-brief.js';
import { sanitizeStoryAngles } from './story-angles.js';
import { rankPartnershipNextActions } from './next-actions.js';
import type {
  CreatorPartnershipView,
  FitScoreBreakdown,
  PartnershipPipelineStatus,
  PartnershipResearch,
} from './types.js';
import { CREATOR_PARTNERSHIP_CATEGORY } from './types.js';

const QUALIFIED_SCORE_THRESHOLD = 40;

export { STALE_RESEARCH_MS, RESEARCH_LEASE_MS } from './research-singleflight.js';

export { isCreatorPartnershipIntake };

export type SubmitCreatorPartnershipResult = {
  partnershipId: string;
  contentItemId: string;
  duplicate: boolean;
  researchStatus: string;
  decisionBrief: PartnershipMetadata['decisionBrief'];
  syncMs: number;
};

/**
 * Sync path: URL parse + source attach + provisional brief only.
 * Must NOT await page fetch, browser, or web search.
 */
export type PartnershipResearchTestHooks = {
  /** @internal test hook — mock searchWeb (no paid usage) */
  testSearchWeb?: typeof searchWeb;
  /** @internal test hook — skip async page fetch */
  testSkipPageFetch?: boolean;
  /** @internal test hook — replace entire research function */
  testResearchFn?: typeof researchCreatorPartnership;
  /** @internal test hook — observe atomic claim outcome */
  testOnClaim?: (claim: ClaimPartnershipResearchResult) => void;
};

export type SubmitCreatorPartnershipOptions = {
  /** Internal scripts/tests only — not exposed on public HTTP. */
  skipResearch?: boolean;
} & PartnershipResearchTestHooks;

export async function submitCreatorPartnership(
  input: {
    url?: string | null;
    text?: string | null;
    sourceScreen?: string;
    /** Arbitration route before commerce-candidate bridge (may be local_discovery). */
    initialIntakeRoute?: string;
  },
  options?: SubmitCreatorPartnershipOptions,
): Promise<SubmitCreatorPartnershipResult> {
  const syncStarted = Date.now();
  const submittedText = (input.text ?? '').trim() || null;
  const urls = input.url ? [input.url] : extractUrls(submittedText ?? '');
  const rawUrl = urls[0] ?? null;

  let urlIntel = rawUrl ? parsePartnershipUrl(rawUrl) : null;
  const submittedUrl = urlIntel?.normalizedUrl ?? rawUrl;

  const brandSlug = urlIntel ? inferBrandSlugFromIntel(urlIntel) : null;
  const retailerFromDomain = urlIntel ? retailerNameFromDomain(urlIntel) : null;

  // URL-only name inference — no page fetch on sync path.
  const names = inferNamesFromSubmission({
    url: submittedUrl,
    pageTitle: null,
    pageText: null,
    userMessage: submittedText,
  });
  if (!names.retailerName && retailerFromDomain) names.retailerName = retailerFromDomain;
  if (!names.brandName && brandSlug) names.brandName = titleCaseSlug(brandSlug);

  const title = buildTitleFromUrlIntel({
    brandName: names.brandName,
    retailerName: names.retailerName,
    brandSlug,
  });

  const fingerprint =
    urlIntel != null
      ? buildOpportunityFingerprint({
          registrableDomain: urlIntel.registrableDomain,
          brandSlug,
          retailerSlug: retailerFromDomain?.toLowerCase() ?? null,
          collectionSlug: brandSlug,
        })
      : null;

  // Source-level dedupe by normalized URL.
  if (submittedUrl) {
    const bySource = await findPartnershipIdByNormalizedSource(submittedUrl);
    if (bySource) {
      const refreshed = await touchExistingPartnershipSource({
        partnershipId: bySource.partnershipId,
        contentItemId: bySource.contentItemId,
        urlIntel,
        submittedText,
        sourceScreen: input.sourceScreen,
        brandName: names.brandName,
        retailerName: names.retailerName,
        title,
        fingerprint,
        skipResearch: options?.skipResearch,
        testSearchWeb: options?.testSearchWeb,
        testSkipPageFetch: options?.testSkipPageFetch,
        testResearchFn: options?.testResearchFn,
        testOnClaim: options?.testOnClaim,
      });
      return {
        ...refreshed,
        duplicate: true,
        syncMs: Date.now() - syncStarted,
      };
    }
  }

  // Opportunity fingerprint reuse — attach new source URL.
  if (fingerprint) {
    const byFp = await findPartnershipIdByFingerprint(fingerprint);
    if (byFp) {
      const refreshed = await touchExistingPartnershipSource({
        partnershipId: byFp.partnershipId,
        contentItemId: byFp.contentItemId,
        urlIntel,
        submittedText,
        sourceScreen: input.sourceScreen,
        brandName: names.brandName,
        retailerName: names.retailerName,
        title,
        fingerprint,
        skipResearch: options?.skipResearch,
        testSearchWeb: options?.testSearchWeb,
        testSkipPageFetch: options?.testSkipPageFetch,
        testResearchFn: options?.testResearchFn,
        testOnClaim: options?.testOnClaim,
      });
      return {
        ...refreshed,
        duplicate: true,
        syncMs: Date.now() - syncStarted,
      };
    }
  }

  const [campaign] = await db.select({ id: campaigns.id }).from(campaigns).limit(1);
  if (!campaign) throw new Error('no_campaign');

  const now = new Date();
  const provisionalSignals: string[] = [];
  if (urlIntel?.storeFilterTokens.length) {
    provisionalSignals.push('url_local_filter_present');
  }

  let metadata: PartnershipMetadata = {
    sourceScreen: input.sourceScreen ?? 'unknown',
    opportunityFingerprint: fingerprint ?? undefined,
    urlIntelligence: urlIntel ?? undefined,
    provisionalSignals,
    initialIntakeRoute: input.initialIntakeRoute ?? 'creator_partnership',
    pipelineOpenedAs:
      input.initialIntakeRoute && input.initialIntakeRoute !== 'creator_partnership'
        ? 'creator_opportunity_candidate'
        : 'creator_partnership',
  };

  if (urlIntel && submittedUrl) {
    const attached = attachPartnershipSource(metadata, {
      originalUrl: urlIntel.originalUrl,
      normalizedUrl: urlIntel.normalizedUrl,
      role: inferSourceRoleFromIntel(urlIntel),
      entityContext: {
        retailerName: names.retailerName,
        brandName: names.brandName,
        productName: names.productName,
      },
      provenance: { status: 'provisional', intakeRoute: 'creator_partnership' },
      parseSnapshot: urlIntel,
    });
    metadata = attached.metadata;
  }

  const [item] = await db
    .insert(contentItems)
    .values({
      campaignId: campaign.id,
      type: 'industry_insight',
      state: 'planned',
      topic: title,
      hook: names.productName ?? names.brandName,
      script: submittedText,
      sourceUrl: submittedUrl,
      discoveredAt: now,
      creatorValueStatus: 'researching',
      lifecycleStatus: 'active',
      metadata: {
        opportunityCategory: CREATOR_PARTNERSHIP_CATEGORY,
        opportunityType: CREATOR_PARTNERSHIP_CATEGORY,
        ingest: 'creator_partnership',
        userSubmission: true,
        sourceScreen: input.sourceScreen ?? 'unknown',
        partnership: {
          brandName: names.brandName,
          productName: names.productName,
          retailerName: names.retailerName,
        },
      },
    })
    .returning({ id: contentItems.id });

  const [partnership] = await db
    .insert(creatorPartnerships)
    .values({
      contentItemId: item!.id,
      submittedUrl,
      submittedText,
      brandName: names.brandName,
      productName: names.productName,
      retailerName: names.retailerName,
      pipelineStatus: 'discovered',
      researchStatus: 'queued',
      metadata,
    })
    .returning({ id: creatorPartnerships.id });

  const decisionBrief = urlIntel
    ? buildProvisionalDecisionBrief({
        partnershipId: partnership!.id,
        brandName: names.brandName,
        retailerName: names.retailerName,
        title,
        urlIntel,
        researchStatus: 'queued',
      })
    : undefined;

  if (decisionBrief) {
    metadata = { ...metadata, decisionBrief };
    await db
      .update(creatorPartnerships)
      .set({ metadata, updatedAt: new Date() })
      .where(eq(creatorPartnerships.id, partnership!.id));
  }

  if (!options?.skipResearch) {
    void runPartnershipResearch(partnership!.id, {
      trigger: 'user_submit',
      testSearchWeb: options?.testSearchWeb,
      testSkipPageFetch: options?.testSkipPageFetch,
      testResearchFn: options?.testResearchFn,
    }).catch((err) => {
      console.warn('[creator-partnership] research failed:', err);
    });
  }

  return {
    partnershipId: partnership!.id,
    contentItemId: item!.id,
    duplicate: false,
    researchStatus: 'queued',
    decisionBrief,
    syncMs: Date.now() - syncStarted,
  };
}

async function touchExistingPartnershipSource(input: {
  partnershipId: string;
  contentItemId: string;
  urlIntel: ReturnType<typeof parsePartnershipUrl> | null;
  submittedText: string | null;
  sourceScreen?: string;
  brandName: string | null;
  retailerName: string | null;
  title: string;
  fingerprint: string | null;
  skipResearch?: boolean;
  testSearchWeb?: typeof searchWeb;
  testSkipPageFetch?: boolean;
  testResearchFn?: typeof researchCreatorPartnership;
  testOnClaim?: (claim: ClaimPartnershipResearchResult) => void;
}): Promise<Omit<SubmitCreatorPartnershipResult, 'duplicate' | 'syncMs'>> {
  const [row] = await db
    .select()
    .from(creatorPartnerships)
    .where(eq(creatorPartnerships.id, input.partnershipId))
    .limit(1);
  if (!row) throw new Error('partnership_not_found');

  let metadata = readPartnershipMetadata(row.metadata);
  if (input.fingerprint) metadata.opportunityFingerprint = input.fingerprint;
  if (input.urlIntel) {
    const result = attachPartnershipSource(metadata, {
      originalUrl: input.urlIntel.originalUrl,
      normalizedUrl: input.urlIntel.normalizedUrl,
      role: inferSourceRoleFromIntel(input.urlIntel),
      entityContext: {
        retailerName: input.retailerName,
        brandName: input.brandName,
      },
      provenance: { status: 'observed', intakeRoute: 'creator_partnership' },
      parseSnapshot: input.urlIntel,
    });
    metadata = result.metadata;
    metadata.urlIntelligence = input.urlIntel;
  }

  // Do not clobber a completed brief when re-pasting / attaching sources.
  const researchDone =
    row.researchStatus === 'complete' || row.researchStatus === 'needs_verification';
  if (input.urlIntel && !researchDone) {
    metadata.decisionBrief = buildProvisionalDecisionBrief({
      partnershipId: input.partnershipId,
      brandName: input.brandName ?? row.brandName,
      retailerName: input.retailerName ?? row.retailerName,
      title: input.title,
      urlIntel: input.urlIntel,
      researchStatus: row.researchStatus,
    });
  }

  await db.execute(sql`
    UPDATE creator_partnerships
    SET
      metadata = ${JSON.stringify(metadata)}::jsonb
        || CASE
          WHEN research_status = 'researching' THEN jsonb_strip_nulls(
            jsonb_build_object(
              'researchRunId', metadata->'researchRunId',
              'researchStartedAt', metadata->'researchStartedAt'
            )
          )
          ELSE '{}'::jsonb
        END,
      submitted_text = COALESCE(${input.submittedText}, submitted_text),
      updated_at = now()
    WHERE id = ${input.partnershipId}::uuid
  `);

  const researchedAt = (row.research as PartnershipResearch | null)?.researchedAt;
  const metadataBeforeTouch = readPartnershipMetadata(row.metadata);
  const shouldAttempt = shouldAttemptPartnershipResearch({
    researchStatus: row.researchStatus,
    researchedAt,
    researchStartedAt: readMetadataString(metadataBeforeTouch, 'researchStartedAt'),
  });

  if (shouldAttempt && !input.skipResearch) {
    void runPartnershipResearch(input.partnershipId, {
      trigger: 'user_submit',
      testSearchWeb: input.testSearchWeb,
      testSkipPageFetch: input.testSkipPageFetch,
      testResearchFn: input.testResearchFn,
      testOnClaim: input.testOnClaim,
    }).catch((err) => {
      console.warn('[creator-partnership] refresh research failed:', err);
    });
  }

  return {
    partnershipId: input.partnershipId,
    contentItemId: input.contentItemId,
    researchStatus: row.researchStatus,
    decisionBrief: metadata.decisionBrief,
  };
}

function readMetadataString(metadata: PartnershipMetadata, key: string): string | null {
  const value = metadata[key];
  return typeof value === 'string' ? value : null;
}

export type RunPartnershipResearchOptions = {
  trigger?: string;
  force?: boolean;
  /** Internal scripts/tests only — not exposed on public HTTP. */
  skipResearch?: boolean;
  /** Chat correlation: provisional assistant row to bind after claim/join. */
  originAssistantMessageId?: string;
  creatorId?: string;
} & PartnershipResearchTestHooks;

export async function runPartnershipResearch(
  partnershipId: string,
  options?: RunPartnershipResearchOptions,
): Promise<void> {
  if (options?.skipResearch) return;

  const [plRow] = await db
    .select({ metadata: creatorPartnerships.metadata })
    .from(creatorPartnerships)
    .where(eq(creatorPartnerships.id, partnershipId))
    .limit(1);
  if (plRow?.metadata && typeof plRow.metadata === 'object') {
    const meta = plRow.metadata as Record<string, unknown>;
    if (
      meta.programLibrarySkipAutoResearch === true ||
      meta.programLibraryMode === 'saved' ||
      meta.programLibraryMode === 'inactive'
    ) {
      return;
    }
  }

  const claim = await claimPartnershipResearch(partnershipId, {
    force: options?.force,
    trigger: options?.trigger,
  });
  options?.testOnClaim?.(claim);

  const originAssistantMessageId = options?.originAssistantMessageId;
  const creatorId = options?.creatorId;

  if (!claim.claimed || !claim.researchRunId) {
    if (originAssistantMessageId && creatorId) {
      await joinActivePartnershipResearchForChat({
        creatorId,
        messageId: originAssistantMessageId,
        partnershipId,
      });
    }
    return;
  }

  const researchRunId = claim.researchRunId;

  if (originAssistantMessageId && creatorId) {
    await bindBensonAssistantResearchRun({
      creatorId,
      messageId: originAssistantMessageId,
      partnershipId,
      researchRunId,
    });
  }

  const [row] = await db
    .select()
    .from(creatorPartnerships)
    .where(eq(creatorPartnerships.id, partnershipId))
    .limit(1);
  if (!row) throw new Error('partnership_not_found');

  const [item] = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.id, row.contentItemId))
    .limit(1);

  let brandName = row.brandName;
  let productName = row.productName;
  let retailerName = row.retailerName;
  let title = item?.topic ?? row.brandName ?? 'Partnership';
  let pageTitle: string | null = null;
  let pageText: string | null = item?.script ?? null;

  // Async-only network fetch.
  if (row.submittedUrl && !options?.testSkipPageFetch) {
    const page = await fetchUrlWithPipeline(row.submittedUrl).catch(() => null);
    pageTitle = page?.title ?? null;
    pageText = page?.text ?? pageText;
    const names = inferNamesFromSubmission({
      url: row.submittedUrl,
      pageTitle: pageTitle ?? item?.topic ?? null,
      pageText,
      userMessage: row.submittedText,
    });
    brandName = names.brandName ?? brandName;
    productName = names.productName ?? productName;
    retailerName = names.retailerName ?? retailerName;
    title = names.title;
    await db
      .update(creatorPartnerships)
      .set({ brandName, productName, retailerName, updatedAt: new Date() })
      .where(eq(creatorPartnerships.id, partnershipId));
    if (item) {
      await db
        .update(contentItems)
        .set({ topic: title, hook: productName ?? brandName, updatedAt: new Date() })
        .where(eq(contentItems.id, item.id));
    }
  }

  try {
    const researchFn = options?.testResearchFn ?? researchCreatorPartnership;
    const researchDeps = options?.testResearchFn || !options?.testSearchWeb
      ? undefined
      : { searchWeb: options.testSearchWeb };
    const research = await researchFn(
      {
        title,
        brandName,
        productName,
        retailerName,
        submittedUrl: row.submittedUrl,
        submittedText: row.submittedText,
        pageTitle: pageTitle ?? title,
        pageText,
        partnershipId,
        researchRunId,
        trigger: options?.trigger ?? 'user_submit',
      },
      researchDeps,
    );

    const fitScoreBreakdown = await scoreCreatorPartnershipFit({
      title,
      brandName,
      research,
    });

    const monetizationPaths = inferMonetizationPaths(research);
    const pipelineStatus: PartnershipPipelineStatus =
      fitScoreBreakdown.composite >= QUALIFIED_SCORE_THRESHOLD ? 'qualified' : 'discovered';

    const fingerprints = buildPartnershipFingerprints({
      brandName,
      retailerName,
      research,
    });
    await persistPartnershipFingerprints(partnershipId, fingerprints);

    const storyAngles = sanitizeStoryAngles(research.storyAngleCandidates, research);
    const nextActions = rankPartnershipNextActions({
      partnershipId,
      research,
      nextActionInputs: research.nextActionInputs,
      storyAngles,
      fitScore: fitScoreBreakdown.composite,
    });

    const researchStatus = research.needsVerification.some((n) => /NEEDS VERIFICATION/i.test(n))
      ? 'needs_verification'
      : 'complete';

    let metadata = readPartnershipMetadata(row.metadata);
    const urlIntel = metadata.urlIntelligence ?? null;
    metadata.decisionBrief = buildCompletedDecisionBrief({
      partnershipId,
      title,
      brandName,
      retailerName,
      research,
      fitScore: fitScoreBreakdown.composite,
      researchStatus,
      storyAngles,
      nextActions,
      urlIntel,
    });

    // Promote candidate → confirmed creator partnership when research finds program evidence.
    const programEvidence =
      research.creatorProgram?.status === 'verified' ||
      research.creatorProgram?.status === 'inferred' ||
      (research.creatorProgram?.value?.trim().length ?? 0) > 0 ||
      monetizationPaths.length > 0;
    if (programEvidence || metadata.pipelineOpenedAs === 'creator_opportunity_candidate') {
      metadata.promotedToCreatorPartnership = programEvidence;
      metadata.creatorOpportunityStatus = programEvidence
        ? 'confirmed_or_inferred'
        : 'candidate_research_incomplete';
    }

    const terminal = await completePartnershipResearchFenced({
      partnershipId,
      researchRunId,
      patch: {
        research,
        fitScore: fitScoreBreakdown.composite,
        fitScoreBreakdown,
        monetizationPaths,
        needsVerification: research.needsVerification,
        pipelineStatus,
        researchStatus,
        researchError: null,
        metadata,
      },
    });
    if (!terminal.applied) return;

    await db
      .update(contentItems)
      .set({
        creatorValueStatus: 'actionable',
        metadata: {
          ...((item?.metadata ?? {}) as Record<string, unknown>),
          partnershipResearchComplete: true,
          partnershipFitScore: fitScoreBreakdown.composite,
        },
        updatedAt: new Date(),
      })
      .where(eq(contentItems.id, row.contentItemId));

    const brief = metadata.decisionBrief ?? null;
    const formatted = brief ? formatCompletedBriefAnswer(brief) : null;
    await patchBensonAssistantMessagesTerminal({
      ...(creatorId ? { creatorId } : {}),
      partnershipId,
      researchRunId,
      patch: {
        researchStatus,
        decisionBrief: brief,
        uiCard: buildBensonUiCardFromBrief(brief),
        answer: formatted?.answer,
        collection: {
          partnershipResearchStatus: researchStatus,
          decisionBrief: brief,
        },
      },
    });

    await emitDataChange({
      eventType: 'manual_update',
      domains: ['opportunities'],
      completedAt: new Date().toISOString(),
      source: 'partnership_research',
      recordIds: [partnershipId],
      success: true,
      metadata: { researchStatus, partnershipId },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failed = await failPartnershipResearchFenced({
      partnershipId,
      researchRunId,
      error: message,
    });
    if (!failed.applied) return;

    const authority = await readPartnershipResearchAuthority(partnershipId);
    const failedPatch =
      authority && authority.researchRunId === researchRunId
        ? terminalChatPatchFromAuthority({ ...authority, researchStatus: 'failed', researchError: message })
        : {
            researchStatus: 'failed' as const,
            answer: `I couldn’t finish researching that opportunity. ${message}`,
            collection: { partnershipResearchStatus: 'failed' },
          };
    if (failedPatch) {
      await patchBensonAssistantMessagesTerminal({
        ...(creatorId ? { creatorId } : {}),
        partnershipId,
        researchRunId,
        patch: failedPatch,
      });
    }

    await emitDataChange({
      eventType: 'manual_update',
      domains: ['opportunities'],
      completedAt: new Date().toISOString(),
      source: 'partnership_research',
      recordIds: [partnershipId],
      success: false,
      metadata: { researchStatus: 'failed', partnershipId, error: message },
    });
    throw err;
  }
}

export async function buildPartnershipCreatorPlay(partnershipId: string): Promise<void> {
  const [row] = await db
    .select()
    .from(creatorPartnerships)
    .where(eq(creatorPartnerships.id, partnershipId))
    .limit(1);
  if (!row) throw new Error('partnership_not_found');

  const research = row.research as PartnershipResearch | null;
  const fitScoreBreakdown = row.fitScoreBreakdown as FitScoreBreakdown | null;
  if (!research || !fitScoreBreakdown) throw new Error('research_required');

  const [item] = await db
    .select({ topic: contentItems.topic })
    .from(contentItems)
    .where(eq(contentItems.id, row.contentItemId))
    .limit(1);

  const creatorPlay = await buildCreatorPlay({
    title: item?.topic ?? row.brandName ?? 'Partnership',
    brandName: row.brandName,
    retailerName: row.retailerName,
    research,
    fitScore: fitScoreBreakdown,
    monetizationPaths: (row.monetizationPaths ?? []) as never[],
    submittedUrl: row.submittedUrl,
  });

  await db
    .update(creatorPartnerships)
    .set({
      creatorPlay,
      pipelineStatus: 'content_ready',
      updatedAt: new Date(),
    })
    .where(eq(creatorPartnerships.id, partnershipId));
}

export async function getPartnershipFieldVerification(partnershipId: string) {
  const [row] = await db
    .select()
    .from(creatorPartnerships)
    .where(eq(creatorPartnerships.id, partnershipId))
    .limit(1);
  if (!row) throw new Error('partnership_not_found');

  const research = (row.research as PartnershipResearch | null) ?? null;
  if (!research) throw new Error('research_required');

  return {
    tasks: buildFieldVerificationTasks({
      research,
      brandName: row.brandName,
      retailerName: row.retailerName,
    }),
    results: research.fieldVerificationResults ?? [],
  };
}

export async function getPartnershipCallLocationScript(partnershipId: string, locationIndex: number) {
  const [row] = await db
    .select()
    .from(creatorPartnerships)
    .where(eq(creatorPartnerships.id, partnershipId))
    .limit(1);
  if (!row) throw new Error('partnership_not_found');

  const research = row.research as PartnershipResearch | null;
  if (!research) throw new Error('research_required');

  const location = research.localLocations?.[locationIndex];
  if (!location) throw new Error('location_not_found');

  return buildCallLocationScript({
    location,
    locationIndex,
    research,
    brandName: row.brandName,
    retailerName: row.retailerName,
  });
}

export async function savePartnershipFieldVerification(
  partnershipId: string,
  input: SaveFieldVerificationInput,
): Promise<{ offerRebuildCreatorPlay: boolean }> {
  const [row] = await db
    .select()
    .from(creatorPartnerships)
    .where(eq(creatorPartnerships.id, partnershipId))
    .limit(1);
  if (!row) throw new Error('partnership_not_found');

  const research = row.research as PartnershipResearch | null;
  if (!research) throw new Error('research_required');

  const { research: updatedResearch, verifiedCount } = applyFieldVerificationResult(research, input, {
    brandName: row.brandName,
    retailerName: row.retailerName,
  });

  const remainingNeedsVerification = updatedResearch.needsVerification ?? [];
  const remainingTasks = buildFieldVerificationTasks({
    research: updatedResearch,
    brandName: row.brandName,
    retailerName: row.retailerName,
  });
  const researchStatus =
    remainingTasks.length > 0 ||
    remainingNeedsVerification.some((n) => /NEEDS VERIFICATION/i.test(n)) ||
    (updatedResearch.localLocations ?? []).some(
      (l) => l.availability !== 'confirmed_available' && l.availability !== 'confirmed_unavailable',
    )
      ? 'needs_verification'
      : 'complete';

  await db
    .update(creatorPartnerships)
    .set({
      research: updatedResearch,
      needsVerification: remainingNeedsVerification,
      researchStatus,
      updatedAt: new Date(),
    })
    .where(eq(creatorPartnerships.id, partnershipId));

  return { offerRebuildCreatorPlay: shouldOfferRebuildCreatorPlay(verifiedCount) };
}

export async function updatePartnershipStatus(input: {
  partnershipId: string;
  pipelineStatus: PartnershipPipelineStatus;
  followUpAt?: string | null;
  calendarReminderAt?: string | null;
}): Promise<void> {
  const patch: Partial<typeof creatorPartnerships.$inferInsert> = {
    pipelineStatus: input.pipelineStatus,
    updatedAt: new Date(),
  };
  if (input.followUpAt !== undefined) {
    patch.followUpAt = input.followUpAt ? new Date(input.followUpAt) : null;
  }
  if (input.calendarReminderAt !== undefined) {
    patch.calendarReminderAt = input.calendarReminderAt ? new Date(input.calendarReminderAt) : null;
  }
  await db.update(creatorPartnerships).set(patch).where(eq(creatorPartnerships.id, input.partnershipId));
}

export async function listCreatorPartnerships(limit = 40): Promise<CreatorPartnershipView[]> {
  const rows = await db
    .select()
    .from(creatorPartnerships)
    .where(
      or(
        sql`NOT (${creatorPartnerships.metadata} ? 'programLibrary')`,
        sql`${creatorPartnerships.metadata}->>'programLibraryMode' = 'activated'`,
      ),
    )
    .orderBy(desc(creatorPartnerships.updatedAt))
    .limit(Math.min(Math.max(limit, 1), 100));

  const views: CreatorPartnershipView[] = [];
  for (const row of rows) {
    const view = await getCreatorPartnership(row.id);
    if (view) views.push(view);
  }
  return views;
}

export async function getCreatorPartnership(
  partnershipId: string,
): Promise<CreatorPartnershipView | null> {
  const [row] = await db
    .select()
    .from(creatorPartnerships)
    .where(eq(creatorPartnerships.id, partnershipId))
    .limit(1);
  if (!row) return null;

  const [item] = await db
    .select({
      topic: contentItems.topic,
      script: contentItems.script,
      sourceUrl: contentItems.sourceUrl,
    })
    .from(contentItems)
    .where(eq(contentItems.id, row.contentItemId))
    .limit(1);

  return mapPartnershipView(row, item);
}

export async function getCreatorPartnershipByContentItem(
  contentItemId: string,
): Promise<CreatorPartnershipView | null> {
  const [row] = await db
    .select()
    .from(creatorPartnerships)
    .where(eq(creatorPartnerships.contentItemId, contentItemId))
    .limit(1);
  if (!row) return null;

  const [item] = await db
    .select({
      topic: contentItems.topic,
      script: contentItems.script,
      sourceUrl: contentItems.sourceUrl,
    })
    .from(contentItems)
    .where(eq(contentItems.id, contentItemId))
    .limit(1);

  return mapPartnershipView(row, item);
}

function mapPartnershipView(
  row: typeof creatorPartnerships.$inferSelect,
  item: { topic: string; script: string | null; sourceUrl: string | null } | undefined,
): CreatorPartnershipView {
  const metadata = readPartnershipMetadata(row.metadata);
  return {
    id: row.id,
    contentItemId: row.contentItemId,
    title: item?.topic ?? row.brandName ?? 'Creator partnership',
    summary: item?.script ?? null,
    sourceUrl: item?.sourceUrl ?? row.submittedUrl,
    submittedUrl: row.submittedUrl,
    submittedText: row.submittedText,
    brandName: row.brandName,
    productName: row.productName,
    retailerName: row.retailerName,
    pipelineStatus: row.pipelineStatus as CreatorPartnershipView['pipelineStatus'],
    monetizationPaths: (row.monetizationPaths ?? []) as CreatorPartnershipView['monetizationPaths'],
    fitScore: row.fitScore,
    fitScoreBreakdown: (row.fitScoreBreakdown as FitScoreBreakdown | null) ?? null,
    research: (row.research as PartnershipResearch | null) ?? null,
    creatorPlay: (row.creatorPlay as CreatorPartnershipView['creatorPlay']) ?? null,
    needsVerification: row.needsVerification ?? [],
    followUpAt: row.followUpAt?.toISOString() ?? null,
    calendarReminderAt: row.calendarReminderAt?.toISOString() ?? null,
    researchStatus: row.researchStatus,
    researchError: row.researchError,
    metadata,
    decisionBrief: metadata.decisionBrief ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
