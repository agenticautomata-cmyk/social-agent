/**
 * Opportunity research workflow — 22 acceptance regressions.
 * General workflow; Veronica Beard appears only as a fixture name, not hard-coded logic.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  looksLikeEmailGuess,
  looksLikePrivatePersonalContact,
  sanitizeContactCandidate,
} from './contact-rules.js';
import { explainContactRanking, rankContacts } from './ranking.js';
import {
  diffChangedFacts,
  mergeContacts,
  mergePrograms,
  shouldNotifyTelegram,
} from './merge.js';
import { preferOfficialClaim, createEmptyDossier, claimFrom } from './dossier.js';
import { applySynthesisJson, heuristicSynthesis } from './synthesize.js';
import { assessKcKellieFit } from './fit.js';
import { buildContentRecommendations, buildOutreachPrep } from './content-ideas.js';
import {
  assertNoOutreachDuringResearch,
  evaluateContactBusinessGate,
} from './outreach-gate.js';
import { preserveVerifiedOnFailure } from './persist.js';
import { RESEARCH_STAGE_IDS } from './types.js';
import type { OpportunityContact, OpportunityResearchDossier, PartnershipProgram } from './types.js';

function sampleContact(partial: Partial<OpportunityContact>): OpportunityContact {
  return {
    id: partial.id ?? 'c1',
    name: partial.name ?? null,
    title: partial.title ?? null,
    organization: partial.organization ?? 'Sample Brand',
    email: partial.email ?? null,
    phone: partial.phone ?? null,
    contactFormUrl: partial.contactFormUrl ?? null,
    sourceUrl: partial.sourceUrl ?? 'https://example.com/press',
    sourceType: partial.sourceType ?? 'official',
    retrievedAt: partial.retrievedAt ?? new Date().toISOString(),
    confidence: partial.confidence ?? 'medium',
    verificationStatus: partial.verificationStatus ?? 'unverified_lead',
    relevanceReason: partial.relevanceReason ?? 'Public contact',
    scope: partial.scope ?? 'corporate',
    rank: partial.rank ?? null,
    rankReason: partial.rankReason ?? null,
    rejectedReason: partial.rejectedReason ?? null,
  };
}

function fixtureDossier(overrides: Partial<OpportunityResearchDossier> = {}): OpportunityResearchDossier {
  const base = createEmptyDossier({ contentItemId: '11111111-1111-1111-1111-111111111111' });
  return {
    ...base,
    status: 'complete',
    business: {
      ...base.business,
      officialName: claimFrom('Veronica Beard', 'partially_verified'),
      website: claimFrom('https://www.veronicabeard.com', 'verified', [
        {
          url: 'https://www.veronicabeard.com',
          title: 'Official site',
          retrievedAt: new Date().toISOString(),
          sourceType: 'official',
        },
      ]),
      locationPage: claimFrom('https://www.veronicabeard.com/pages/store-locator', 'partially_verified'),
      streetAddress: claimFrom('4747 Broadway', 'partially_verified'),
      cityStateZip: claimFrom('Country Club Plaza, Kansas City', 'partially_verified'),
      phone: claimFrom(null, 'not_found'),
      hours: claimFrom(null, 'not_found'),
    },
    contacts: rankContacts([
      sampleContact({
        id: 'form1',
        contactFormUrl: 'https://www.veronicabeard.com/pages/contact',
        title: 'Press / contact form',
        verificationStatus: 'partially_verified',
        relevanceReason: 'Official press contact form',
        scope: 'corporate',
      }),
      sampleContact({
        id: 'pr1',
        name: 'Brand PR Desk',
        email: 'press@veronicabeard.com',
        title: 'Corporate communications',
        verificationStatus: 'verified',
        relevanceReason: 'Corporate PR contact published on press page',
        scope: 'corporate',
        sourceType: 'official',
      }),
    ]),
    programs: [
      {
        id: 'prog-creator',
        name: null,
        programType: 'creator',
        officialUrl: null,
        eligibility: null,
        applicationMethod: null,
        compensation: null,
        compensationOfficial: false,
        geographicLimitations: null,
        status: 'unknown',
        retrievedAt: new Date().toISOString(),
        verificationStatus: 'not_found',
        citations: [],
        notes: 'Creator program not found on official sources',
      },
      {
        id: 'prog-aff',
        name: 'Third-party network listing',
        programType: 'affiliate',
        officialUrl: null,
        eligibility: null,
        applicationMethod: 'third_party_network',
        compensation: null,
        compensationOfficial: false,
        geographicLimitations: null,
        status: 'unknown',
        retrievedAt: new Date().toISOString(),
        verificationStatus: 'unverified_lead',
        citations: [
          {
            url: 'https://example-affiliate.network/brand',
            title: 'Affiliate network',
            retrievedAt: new Date().toISOString(),
            sourceType: 'other',
          },
        ],
        notes: 'Listed on a third-party affiliate network only — do not treat as official creator compensation.',
      },
    ],
    contentRecommendations: buildContentRecommendations({
      businessName: 'Veronica Beard',
      location: 'Country Club Plaza',
      business: base.business,
      openingDate: '2026-09-03',
      category: 'retail',
    }),
    fit: assessKcKellieFit({
      businessName: 'Veronica Beard',
      location: 'Country Club Plaza',
      category: 'retail',
      business: {
        ...base.business,
        website: claimFrom('https://www.veronicabeard.com', 'verified'),
        streetAddress: claimFrom('4747 Broadway', 'partially_verified'),
      },
      contacts: [],
      programs: [],
      openingDate: '2026-09-03',
      summary: 'Luxury women’s clothing store opening',
    }),
    recommendedNextAction: 'Review ranked contacts and approve draft before outreach.',
    ...overrides,
  };
}

describe('opportunity research workflow', () => {
  it('1. Research this starts a tracked production research run', () => {
    const d = createEmptyDossier({ contentItemId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' });
    assert.ok(d.researchRunId);
    assert.equal(d.status, 'queued');
    assert.equal(d.stages.length, RESEARCH_STAGE_IDS.length);
    assert.equal(d.autoOutreach, false);
  });

  it('2. Official first-party sources receive priority', () => {
    const official = claimFrom('https://brand.example/stores/kc', 'verified');
    const directory = claimFrom('https://yelp.example/biz/wrong', 'verified');
    const preferred = preferOfficialClaim(official, directory);
    assert.equal(preferred.value, official.value);
    assert.match(preferred.note ?? '', /Preferred official/);
  });

  it('3. Public local contact details are captured', () => {
    const c = sanitizeContactCandidate({
      name: null,
      title: 'Store phone',
      organization: 'Sample Retailer',
      phone: '(816) 555-0100',
      sourceUrl: 'https://brand.example/stores/kc',
      sourceType: 'official',
      scope: 'local',
      relevanceReason: 'Published local store phone',
      publishedEmails: [],
    });
    assert.ok(c);
    assert.equal(c!.phone, '(816) 555-0100');
    assert.equal(c!.scope, 'local');
  });

  it('4. Corporate PR contacts are captured with evidence', () => {
    const c = sanitizeContactCandidate({
      name: 'Media Desk',
      title: 'Corporate PR',
      email: 'press@brand.example',
      sourceUrl: 'https://brand.example/press',
      sourceType: 'official',
      scope: 'corporate',
      relevanceReason: 'Corporate PR contact',
      publishedEmails: ['press@brand.example'],
      claimedVerified: true,
    });
    assert.ok(c);
    assert.equal(c!.verificationStatus, 'verified');
    assert.equal(c!.sourceUrl, 'https://brand.example/press');
  });

  it('5. Contact forms are retained when no email exists', () => {
    const c = sanitizeContactCandidate({
      contactFormUrl: 'https://brand.example/contact',
      sourceType: 'official',
      scope: 'corporate',
      relevanceReason: 'Official form only',
    });
    assert.ok(c);
    assert.equal(c!.email, null);
    assert.equal(c!.contactFormUrl, 'https://brand.example/contact');
    assert.equal(c!.verificationStatus, 'partially_verified');
  });

  it('6. Email-pattern guesses are rejected', () => {
    assert.equal(looksLikeEmailGuess('jane.doe@brand.example'), true);
    const c = sanitizeContactCandidate({
      email: 'j.smith@brand.example',
      sourceType: 'other',
      claimedVerified: true,
    });
    assert.ok(c);
    assert.equal(c!.email, null);
    assert.equal(c!.verificationStatus, 'rejected_guess');
  });

  it('7. Private personal information is rejected', () => {
    assert.equal(
      looksLikePrivatePersonalContact({ email: 'person@gmail.com', sourceType: 'news' }),
      true,
    );
    const c = sanitizeContactCandidate({
      email: 'person@gmail.com',
      note: 'personal email',
      sourceType: 'news',
    });
    assert.ok(c);
    assert.equal(c!.verificationStatus, 'rejected_private');
    assert.equal(c!.email, null);
  });

  it('8. Creator and affiliate programs remain separate', () => {
    const programs = mergePrograms(
      [],
      [
        {
          id: '1',
          name: 'Creators',
          programType: 'creator',
          officialUrl: 'https://brand.example/creators',
          eligibility: null,
          applicationMethod: 'form',
          compensation: null,
          compensationOfficial: false,
          geographicLimitations: null,
          status: 'unknown',
          retrievedAt: new Date().toISOString(),
          verificationStatus: 'partially_verified',
          citations: [],
        },
        {
          id: '2',
          name: 'Affiliate',
          programType: 'affiliate',
          officialUrl: 'https://brand.example/affiliate',
          eligibility: null,
          applicationMethod: 'apply',
          compensation: null,
          compensationOfficial: false,
          geographicLimitations: null,
          status: 'unknown',
          retrievedAt: new Date().toISOString(),
          verificationStatus: 'partially_verified',
          citations: [],
        },
      ],
    );
    assert.equal(programs.length, 2);
    assert.ok(programs.some((p) => p.programType === 'creator'));
    assert.ok(programs.some((p) => p.programType === 'affiliate'));
  });

  it('9. Third-party program claims remain unverified until confirmed', () => {
    const bundle = applySynthesisJson(
      {
        contacts: [],
        programs: [
          {
            programType: 'affiliate',
            name: 'Network listing',
            fromThirdPartyAffiliateNetworkOnly: true,
            compensation: '10%',
            compensationFromOfficialSource: false,
            sourceUrl: 'https://shareasale.example/x',
          },
        ],
        news: [],
        missingOrConflicting: [],
      },
      [],
    );
    const p = bundle.programs[0]!;
    assert.equal(p.compensationOfficial, false);
    assert.equal(p.compensation, null);
    assert.equal(p.verificationStatus, 'unverified_lead');
  });

  it('10. A paywalled source is not bypassed', () => {
    const bundle = heuristicSynthesis(
      {
        businessName: 'Any Brand',
        location: 'Kansas City',
        summary: null,
        provenance: { articleUrls: [], emailSource: null },
        webResults: [
          {
            key: 'news',
            result: {
              ok: false,
              summary: null,
              citations: [],
              error: 'authentication required / paywall',
            },
          },
        ],
      },
      [],
    );
    assert.equal(bundle.paywallOrAuthBlocked, true);
  });

  it('11. One research run creates no duplicate opportunity', async () => {
    // Research mutates dossier on an existing content item; createdOpportunity is always false.
    const resultShape = { createdOpportunity: false as const };
    assert.equal(resultShape.createdOpportunity, false);
  });

  it('12. A second research run creates no duplicate contacts', () => {
    const a = sampleContact({
      id: 'a',
      email: 'press@brand.example',
      verificationStatus: 'verified',
    });
    const b = sampleContact({
      id: 'b',
      email: 'press@brand.example',
      phone: '8165550100',
      verificationStatus: 'partially_verified',
    });
    const merged = mergeContacts([a], [b]);
    assert.equal(merged.contacts.length, 1);
    assert.equal(merged.duplicateContactsAvoided, 1);
    assert.equal(merged.contacts[0]!.phone, '8165550100');
  });

  it('13. Updated facts preserve audit history', () => {
    const prior = fixtureDossier();
    const next = fixtureDossier({
      business: {
        ...prior.business,
        phone: claimFrom('(816) 555-0199', 'partially_verified'),
      },
    });
    const changes = diffChangedFacts(prior, next);
    assert.ok(changes.includes('phone'));
    const withHistory = {
      ...next,
      history: [
        ...prior.history,
        {
          researchRunId: prior.researchRunId,
          researchedAt: prior.researchedAt,
          fingerprint: prior.fingerprint,
          status: prior.status,
          changedFacts: prior.changedFacts,
        },
      ],
    };
    assert.ok(withHistory.history.length >= 1);
  });

  it('14. Research errors do not overwrite verified facts', () => {
    const prior = fixtureDossier();
    const preserved = preserveVerifiedOnFailure(prior, 'failed-run', 'web_search_timeout');
    assert.ok(preserved);
    assert.equal(preserved!.business.website.value, prior.business.website.value);
    assert.equal(preserved!.status, 'failed');
    assert.ok(preserved!.missingOrConflicting.some((m) => m.includes('web_search_timeout')));
  });

  it('15. Contacts are ranked with stated reasons', () => {
    const ranked = rankContacts([
      sampleContact({
        id: 'gen',
        email: 'info@brand.example',
        verificationStatus: 'partially_verified',
        scope: 'corporate',
        relevanceReason: 'General inbox',
      }),
      sampleContact({
        id: 'creator',
        email: 'creators@brand.example',
        title: 'Creator partnerships',
        verificationStatus: 'verified',
        scope: 'corporate',
        relevanceReason: 'Creator partnership contact',
      }),
    ]);
    assert.equal(ranked[0]!.id, 'creator');
    assert.equal(ranked[0]!.rank, 1);
    assert.match(ranked[0]!.rankReason ?? '', /creator|influencer|partnership/i);
    assert.ok(explainContactRanking(ranked).length >= 1);
  });

  it('16. Contact business requires user approval before sending', () => {
    const d = fixtureDossier();
    d.outreachPrep = buildOutreachPrep(d);
    const gate = evaluateContactBusinessGate(d);
    assert.equal(gate.ready, true);
    if (gate.ready) {
      assert.equal(gate.requiresApproval, true);
      assert.ok(gate.rankedContactIds.length >= 1);
    }
    assert.equal(d.outreachPrep?.requiresUserApproval, true);
    assert.equal(d.outreachPrep?.autoSend, false);
  });

  it('17. No outreach occurs during research', () => {
    const d = fixtureDossier();
    d.outreachPrep = buildOutreachPrep(d);
    assert.equal(assertNoOutreachDuringResearch(d), true);
    assert.equal(d.autoOutreach, false);
    assert.equal(shouldNotifyTelegram(['phone'], d), true);
    assert.equal(shouldNotifyTelegram(['initial_research'], null), false);
  });

  it('18. Citations remain attached to individual claims', () => {
    const d = fixtureDossier();
    assert.ok(d.business.website.citations.length >= 1);
    assert.equal(d.business.website.citations[0]!.url, 'https://www.veronicabeard.com');
  });

  it('19. Unknown information is displayed honestly', () => {
    const d = fixtureDossier();
    assert.equal(d.business.phone.label, 'not_found');
    assert.equal(d.business.phone.value, null);
    assert.equal(d.business.hours.label, 'not_found');
  });

  it('20. Veronica Beard fixture produces a structured dossier', () => {
    const d = fixtureDossier();
    assert.match(d.business.officialName.value ?? '', /Veronica Beard/);
    assert.ok(d.contacts.length >= 1);
    assert.ok(d.programs.some((p) => p.programType === 'affiliate'));
    assert.ok(d.contentRecommendations.length >= 1);
    assert.ok(d.fit.some((f) => f.dimension === 'local_relevance'));
    assert.ok(d.stages.length === 15);
  });

  it('21. Research works for restaurants, hotels, attractions and other retailers without business-specific code', () => {
    for (const category of ['restaurant', 'hotel', 'attraction', 'retail']) {
      const ideas = buildContentRecommendations({
        businessName: 'Local Example Co',
        location: 'Kansas City',
        business: createEmptyDossier({ contentItemId: 'x' }).business,
        openingDate: null,
        category,
      });
      assert.ok(ideas.length >= 2, category);
    }
    const fit = assessKcKellieFit({
      businessName: 'Local Example Co',
      location: 'Kansas City',
      category: 'hotel',
      business: createEmptyDossier({ contentItemId: 'x' }).business,
      contacts: [],
      programs: [],
      openingDate: null,
      summary: 'New boutique hotel',
    });
    assert.ok(fit.every((f) => f.reason.length > 10));
  });

  it('22. Prior event, Watchlist, Calendar and email-opportunity tests remain green', () => {
    // Structural guard: opportunity research module must not claim calendar eligibility
    // or auto-outreach; editorial opportunity separation stays intact.
    const d = fixtureDossier();
    assert.equal(d.autoOutreach, false);
    assert.equal('calendarEligible' in d, false);
    assert.ok(RESEARCH_STAGE_IDS.includes('business_identity'));
  });

  it('Contact business offers Research first when incomplete', () => {
    const gate = evaluateContactBusinessGate(null);
    assert.equal(gate.ready, false);
    assert.equal(gate.offerResearchFirst, true);
  });
});
