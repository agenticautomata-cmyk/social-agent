/**
 * Opportunity research runner — tracked stages, bounded public web search,
 * structured dossier, no auto-outreach, idempotent refresh.
 */

import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems, creatorResearchJobs } from '../schema.js';
import { searchWeb, type WebResearchResult } from '../web-research/index.js';
import { stripTrackingParams } from '../newsletter-intelligence/editorial-opportunity/canonical-url.js';
import { fetchEditorialArticle } from '../newsletter-intelligence/editorial-opportunity/article-fetch.js';
import { buildContentRecommendations, buildOutreachPrep } from './content-ideas.js';
import { createEmptyDossier, preferOfficialClaim } from './dossier.js';
import { assessKcKellieFit } from './fit.js';
import {
  diffChangedFacts,
  dossierFingerprint,
  mergeContacts,
  mergePrograms,
  shouldNotifyTelegram,
} from './merge.js';
import { rankContacts } from './ranking.js';
import {
  loadOpportunityResearch,
  preserveVerifiedOnFailure,
  readDossierFromMetadata,
  saveOpportunityResearch,
} from './persist.js';
import { setStage } from './stages.js';
import { synthesizeOpportunityResearch } from './synthesize.js';
import type {
  OpportunityResearchDossier,
  OpportunityResearchRunResult,
  ResearchStageId,
} from './types.js';

export const OPPORTUNITY_RESEARCH_SEARCH_COUNT = 5;

function businessNameFromItem(item: typeof contentItems.$inferSelect): string {
  const meta = (item.metadata ?? {}) as Record<string, unknown>;
  if (typeof meta.businessName === 'string' && meta.businessName.trim()) return meta.businessName.trim();
  const editorial = meta.editorialOpportunity as { summary?: string } | undefined;
  const topic = item.topic ?? 'Opportunity';
  const beforeEm = topic.split('—')[0]?.trim();
  return beforeEm || topic;
}

function seedFromMetadata(item: typeof contentItems.$inferSelect, runId: string): OpportunityResearchDossier {
  const meta = (item.metadata ?? {}) as Record<string, unknown>;
  const editorial = (meta.editorialOpportunity as Record<string, unknown> | undefined) ?? {};
  const provenance = (meta.provenance as Record<string, unknown> | undefined) ?? {};
  const articleUrls = [
    ...((provenance.articleUrls as string[]) ?? []),
    typeof editorial.canonicalArticleUrl === 'string' ? editorial.canonicalArticleUrl : null,
  ]
    .filter((u): u is string => Boolean(u))
    .map(stripTrackingParams);

  const dossier = createEmptyDossier({
    contentItemId: item.id,
    researchRunId: runId,
    emailSource: typeof editorial.emailSource === 'string' ? editorial.emailSource : null,
    articleUrls: [...new Set(articleUrls)],
    gmailMessageIds: (provenance.gmailMessageIds as string[]) ?? [],
  });

  if (typeof editorial.address === 'string' && editorial.address) {
    dossier.business.streetAddress = {
      value: editorial.address,
      label: 'partially_verified',
      citations: articleUrls[0]
        ? [{ url: articleUrls[0], title: 'Discovery article', retrievedAt: new Date().toISOString(), sourceType: 'article' }]
        : [],
      note: 'From monitored editorial discovery',
    };
  }
  if (typeof editorial.location === 'string' && editorial.location) {
    dossier.business.cityStateZip = {
      value: editorial.location,
      label: 'partially_verified',
      citations: [],
      note: 'From monitored editorial discovery',
    };
  }
  if (typeof editorial.openingOrAnnouncementDate === 'string' && editorial.openingOrAnnouncementDate) {
    dossier.business.openingDate = {
      value: editorial.openingOrAnnouncementDate,
      label: 'partially_verified',
      citations: [],
      note: 'From monitored editorial discovery',
    };
  }
  dossier.business.officialName = {
    value: businessNameFromItem(item),
    label: 'partially_verified',
    citations: [],
  };
  return dossier;
}

async function updateJobProgress(
  jobId: string | null | undefined,
  patch: {
    status?: 'queued' | 'researching' | 'complete' | 'needs_verification' | 'failed';
    enrichment?: Record<string, unknown>;
    errorMessage?: string | null;
  },
) {
  if (!jobId) return;
  await db
    .update(creatorResearchJobs)
    .set({
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.enrichment ? { enrichment: patch.enrichment } : {}),
      ...(patch.errorMessage !== undefined ? { errorMessage: patch.errorMessage } : {}),
      updatedAt: new Date(),
    })
    .where(eq(creatorResearchJobs.id, jobId));
}

export async function runOpportunityResearch(input: {
  contentItemId: string;
  researchJobId?: string | null;
  trigger?: string;
  searchWeb?: typeof searchWeb;
}): Promise<OpportunityResearchRunResult> {
  const loaded = await loadOpportunityResearch(input.contentItemId);
  if (!loaded) throw new Error('content_item_not_found');

  const { item } = loaded;
  const prior = loaded.dossier;
  const researchRunId = randomUUID();
  const search = input.searchWeb ?? searchWeb;
  const businessName = businessNameFromItem(item);
  const meta = (item.metadata ?? {}) as Record<string, unknown>;
  const location =
    item.locationName ??
    ((meta.editorialOpportunity as { location?: string } | undefined)?.location ?? null);

  let dossier = seedFromMetadata(item, researchRunId);
  dossier.status = 'running';
  dossier.currentStageId = 'business_identity';
  if (prior) {
    dossier.history = [
      ...prior.history,
      {
        researchRunId: prior.researchRunId,
        researchedAt: prior.researchedAt,
        fingerprint: prior.fingerprint,
        status: prior.status,
        changedFacts: prior.changedFacts,
      },
    ].slice(-20);
    dossier.lastSuccessfulResearchAt = prior.lastSuccessfulResearchAt;
    dossier.lastFailedResearchAt = prior.lastFailedResearchAt;
  }

  await saveOpportunityResearch(input.contentItemId, dossier);
  await updateJobProgress(input.researchJobId, {
    status: 'researching',
    enrichment: { opportunityResearch: { researchRunId, status: 'running', currentStageId: dossier.currentStageId } },
  });

  try {
    // Stage: news provenance / article access (respect paywall)
    dossier.currentStageId = 'news_opening_coverage';
    for (const url of dossier.provenance.articleUrls.slice(0, 2)) {
      const article = await fetchEditorialArticle(url);
      if (article.access === 'subscription_required' || article.access === 'blocked') {
        dossier.stages = setStage(
          dossier.stages,
          'news_opening_coverage',
          article.access === 'subscription_required' ? 'authentication_required' : 'blocked',
          article.blockedReason ?? article.access,
        );
      } else if (article.access === 'fetched') {
        dossier.stages = setStage(dossier.stages, 'news_opening_coverage', 'completed', 'article_fetched');
        if (article.text) {
          dossier.news.push({
            title: article.headline ?? 'Opening coverage',
            url: stripTrackingParams(article.canonicalUrl ?? url),
            retrievedAt: new Date().toISOString(),
            factSummary: article.text.slice(0, 400),
            isStrategySuggestion: false,
          });
        }
      } else {
        dossier.stages = setStage(dossier.stages, 'news_opening_coverage', 'no_result', article.access);
      }
    }
    if (!dossier.provenance.articleUrls.length) {
      dossier.stages = setStage(dossier.stages, 'news_opening_coverage', 'no_result', 'no_article_url');
    }

    const year = new Date().getFullYear();
    const searchTargets: Array<{ key: string; stage: ResearchStageId; query: string; instructions: string }> = [
      {
        key: 'identity_web',
        stage: 'business_identity',
        query: `${businessName} official website ${location ?? 'Kansas City'}`,
        instructions:
          'Find the official first-party website and parent company if stated. Prefer brand.com over directories. Cite URLs. Under 120 words. Say not found when unknown.',
      },
      {
        key: 'location',
        stage: 'local_location',
        query: `${businessName} ${location ?? 'Kansas City'} store address phone hours location page`,
        instructions:
          'Find official local location page, street address, phone, hours. Prefer official store locator over directories. Cite URLs. Under 120 words.',
      },
      {
        key: 'contacts_pr',
        stage: 'corporate_pr_marketing',
        query: `${businessName} press contact OR media relations OR PR email OR communications OR "media kit" OR contact form`,
        instructions:
          'Find only publicly published PR/media/partnership contacts or official forms. Never invent emails. Cite source URLs. Under 120 words.',
      },
      {
        key: 'programs',
        stage: 'creator_influencer_programs',
        query: `${businessName} official creator program OR influencer program OR ambassador program OR affiliate program application`,
        instructions:
          'Separate creator/influencer programs from affiliate programs. Do not claim compensation from third-party affiliate listings alone. Cite official URLs. Under 120 words.',
      },
      {
        key: 'news',
        stage: 'news_opening_coverage',
        query: `${businessName} ${location ?? 'Kansas City'} opening OR grand opening OR first-to-market ${year}`,
        instructions:
          'Summarize factual opening coverage only. Cite URLs. Do not invent dates. Under 120 words.',
      },
    ];

    const webResults: Array<{ key: string; result: WebResearchResult; stage: ResearchStageId }> = [];
    for (const target of searchTargets) {
      dossier.currentStageId = target.stage;
      await updateJobProgress(input.researchJobId, {
        enrichment: {
          opportunityResearch: {
            researchRunId,
            status: 'running',
            currentStageId: target.stage,
          },
        },
      });

      const result = await search(
        target.query,
        target.instructions,
        {
          context: 'user',
          caller: 'opportunity_research',
          module: 'opportunity-research',
          contentItemId: input.contentItemId,
          researchRunId,
          trigger: input.trigger ?? 'research_this',
        },
      );
      webResults.push({ key: target.key, result, stage: target.stage });

      if (result.skipped) {
        dossier.stages = setStage(dossier.stages, target.stage, 'skipped', result.error ?? 'search_skipped');
      } else if (!result.ok) {
        const blocked = /paywall|auth|login|captcha|robots/i.test(result.error ?? '');
        dossier.stages = setStage(
          dossier.stages,
          target.stage,
          blocked ? 'blocked' : 'failed',
          result.error ?? 'search_failed',
        );
      } else if (!result.summary) {
        dossier.stages = setStage(dossier.stages, target.stage, 'no_result', 'empty_summary');
      } else {
        dossier.stages = setStage(dossier.stages, target.stage, 'completed');
      }
    }

    dossier.currentStageId = 'official_web_social';
    const synthesized = await synthesizeOpportunityResearch({
      businessName,
      location,
      summary: item.script,
      provenance: {
        articleUrls: dossier.provenance.articleUrls,
        emailSource: dossier.provenance.emailSource,
      },
      webResults: webResults.map(({ key, result }) => ({ key, result })),
    });

    // Prefer official over seeded/directory; keep prior verified on conflict with weaker labels.
    dossier.business = {
      officialName: preferOfficialClaim(synthesized.business.officialName, dossier.business.officialName),
      parentCompany: preferOfficialClaim(synthesized.business.parentCompany, dossier.business.parentCompany),
      category: preferOfficialClaim(synthesized.business.category, dossier.business.category),
      website: preferOfficialClaim(synthesized.business.website, dossier.business.website),
      locationPage: preferOfficialClaim(synthesized.business.locationPage, dossier.business.locationPage),
      streetAddress: preferOfficialClaim(synthesized.business.streetAddress, dossier.business.streetAddress),
      cityStateZip: preferOfficialClaim(synthesized.business.cityStateZip, dossier.business.cityStateZip),
      phone: preferOfficialClaim(synthesized.business.phone, dossier.business.phone),
      hours: preferOfficialClaim(synthesized.business.hours, dossier.business.hours),
      openingDate: preferOfficialClaim(synthesized.business.openingDate, dossier.business.openingDate),
      grandOpening: preferOfficialClaim(synthesized.business.grandOpening, dossier.business.grandOpening),
      appointmentsRequired: preferOfficialClaim(
        synthesized.business.appointmentsRequired,
        dossier.business.appointmentsRequired,
      ),
      offerings: synthesized.business.offerings.value
        ? synthesized.business.offerings
        : dossier.business.offerings,
      socials: synthesized.business.socials.value ? synthesized.business.socials : dossier.business.socials,
      mapLink: preferOfficialClaim(synthesized.business.mapLink, dossier.business.mapLink),
    };

    dossier.stages = setStage(
      dossier.stages,
      'official_web_social',
      dossier.business.website.value || dossier.business.socials.value ? 'completed' : 'no_result',
    );
    dossier.stages = setStage(
      dossier.stages,
      'local_store_contact',
      synthesized.contacts.some((c) => c.scope === 'local') ? 'completed' : 'no_result',
    );
    dossier.stages = setStage(
      dossier.stages,
      'corporate_pr_marketing',
      synthesized.contacts.some((c) => c.scope === 'corporate') ? 'completed' : 'no_result',
    );
    dossier.stages = setStage(
      dossier.stages,
      'pr_agency',
      synthesized.contacts.some((c) => c.scope === 'agency') ? 'completed' : 'no_result',
    );
    dossier.stages = setStage(
      dossier.stages,
      'creator_influencer_programs',
      synthesized.programs.some((p) => ['creator', 'influencer', 'ambassador'].includes(p.programType))
        ? 'completed'
        : 'no_result',
    );
    dossier.stages = setStage(
      dossier.stages,
      'affiliate_programs',
      synthesized.programs.some((p) => p.programType === 'affiliate') ? 'completed' : 'no_result',
    );
    dossier.stages = setStage(
      dossier.stages,
      'media_press_partnership_pages',
      synthesized.contacts.some((c) => Boolean(c.contactFormUrl)) ||
        synthesized.programs.some((p) => p.programType === 'press_media')
        ? 'completed'
        : 'no_result',
    );
    dossier.stages = setStage(
      dossier.stages,
      'brand_positioning',
      synthesized.brandPositioning ? 'completed' : 'no_result',
      synthesized.brandPositioning,
    );
    if (synthesized.paywallOrAuthBlocked) {
      dossier.stages = setStage(
        dossier.stages,
        'news_opening_coverage',
        'authentication_required',
        'paywall_or_login_not_bypassed',
      );
    }

    const mergedContacts = mergeContacts(prior?.contacts ?? [], synthesized.contacts);
    dossier.contacts = rankContacts(mergedContacts.contacts);
    dossier.programs = mergePrograms(prior?.programs ?? [], synthesized.programs);
    dossier.news = [
      ...dossier.news,
      ...synthesized.news.filter((n) => !dossier.news.some((e) => e.url === n.url)),
    ];
    dossier.missingOrConflicting = [
      ...new Set([...(synthesized.missingOrConflicting ?? []), ...collectGaps(dossier)]),
    ];

    dossier.currentStageId = 'kckellie_fit';
    dossier.fit = assessKcKellieFit({
      businessName,
      location,
      category: (meta.opportunityCategory as string) ?? null,
      business: dossier.business,
      contacts: dossier.contacts,
      programs: dossier.programs,
      openingDate: dossier.business.openingDate.value,
      summary: item.script,
    });
    dossier.stages = setStage(dossier.stages, 'kckellie_fit', 'completed');

    dossier.currentStageId = 'content_opportunities';
    dossier.contentRecommendations = buildContentRecommendations({
      businessName,
      location,
      business: dossier.business,
      openingDate: dossier.business.openingDate.value,
      category: (meta.opportunityCategory as string) ?? dossier.business.category.value,
    });
    dossier.stages = setStage(dossier.stages, 'content_opportunities', 'completed');

    dossier.currentStageId = 'outreach_angles';
    dossier.outreachPrep = buildOutreachPrep(dossier);
    dossier.stages = setStage(dossier.stages, 'outreach_angles', 'completed', 'prep_only_no_send');

    dossier.currentStageId = 'risks_restrictions_gaps';
    dossier.stages = setStage(
      dossier.stages,
      'risks_restrictions_gaps',
      dossier.missingOrConflicting.length ? 'completed' : 'no_result',
    );

    dossier.fingerprint = dossierFingerprint({
      businessName: dossier.business.officialName.value,
      website: dossier.business.website.value,
      address: dossier.business.streetAddress.value,
      phone: dossier.business.phone.value,
      contactKeys: dossier.contacts.map((c) => `${c.email}|${c.contactFormUrl}|${c.phone}`),
      programKeys: dossier.programs.map((p) => `${p.programType}|${p.officialUrl}|${p.name}`),
    });
    dossier.changedFacts = diffChangedFacts(prior, dossier);
    dossier.researchedAt = new Date().toISOString();
    dossier.lastSuccessfulResearchAt = dossier.researchedAt;
    dossier.staleAfter = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    dossier.status = 'complete';
    dossier.currentStageId = null;
    dossier.autoOutreach = false;
    dossier.telegramNotified = shouldNotifyTelegram(dossier.changedFacts, prior);
    dossier.recommendedNextAction = recommendNext(dossier);

    await saveOpportunityResearch(input.contentItemId, dossier, {
      opportunityResearchFingerprint: dossier.fingerprint,
    });

    const needsVerification = dossier.contacts.some((c) => c.verificationStatus !== 'verified') ||
      dossier.business.website.label !== 'verified';

    await updateJobProgress(input.researchJobId, {
      status: needsVerification ? 'needs_verification' : 'complete',
      enrichment: {
        opportunityResearch: dossier,
        researchSummary: dossier.recommendedNextAction,
        citations: dossier.news.map((n) => ({ url: n.url, title: n.title })),
      },
      errorMessage: null,
    });

    return {
      researchRunId,
      contentItemId: input.contentItemId,
      dossier,
      createdOpportunity: false,
      duplicateContactsAvoided: mergedContacts.duplicateContactsAvoided,
      outreachSent: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const preserved = preserveVerifiedOnFailure(prior, researchRunId, message);
    if (preserved) {
      await saveOpportunityResearch(input.contentItemId, preserved);
    } else {
      dossier.status = 'failed';
      dossier.lastFailedResearchAt = new Date().toISOString();
      dossier.missingOrConflicting = [`research_error:${message}`];
      await saveOpportunityResearch(input.contentItemId, dossier);
    }
    await updateJobProgress(input.researchJobId, {
      status: 'failed',
      errorMessage: message,
    });
    throw err;
  }
}

function collectGaps(dossier: OpportunityResearchDossier): string[] {
  const gaps: string[] = [];
  if (!dossier.business.website.value) gaps.push('Official website not found');
  if (!dossier.business.locationPage.value) gaps.push('Local location page not found');
  if (!dossier.business.phone.value) gaps.push('Public phone not found');
  if (!dossier.business.hours.value) gaps.push('Published hours not found');
  if (!dossier.contacts.some((c) => c.email || c.contactFormUrl)) {
    gaps.push('No public email or contact form found');
  }
  if (!dossier.programs.length) gaps.push('No official creator/affiliate program confirmed');
  return gaps;
}

function recommendNext(dossier: OpportunityResearchDossier): string {
  const top = dossier.contacts.find((c) => c.rank != null);
  if (top?.email) {
    return `Review ranked contact (${top.rankReason}) and approve a tailored draft before any outreach.`;
  }
  if (top?.contactFormUrl) {
    return `Use the official contact/press form (${top.contactFormUrl}) after human review — do not invent an email.`;
  }
  if (dossier.business.locationPage.value || dossier.business.website.value) {
    return `Visit the official site/location page, confirm hours, then refresh research for contacts.`;
  }
  return 'Refresh research or manually verify the official website — dossier is incomplete.';
}

export async function getOpportunityResearchView(contentItemId: string) {
  const loaded = await loadOpportunityResearch(contentItemId);
  if (!loaded) return null;
  return {
    contentItemId,
    topic: loaded.item.topic,
    dossier: loaded.dossier,
    gate: loaded.dossier
      ? (await import('./outreach-gate.js')).evaluateContactBusinessGate(loaded.dossier)
      : (await import('./outreach-gate.js')).evaluateContactBusinessGate(null),
  };
}

export { readDossierFromMetadata };
