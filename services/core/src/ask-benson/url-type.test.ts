import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyStandaloneUrlType,
  extractLinkHubDestinations,
  hubOwnerFromPath,
  isInstagramPostUrl,
  isInstagramProfileUrl,
  isLinkHubUrl,
  isOpaqueContentId,
} from './url-type.js';
import { inferBusinessName, qualifyEntityFromUrl } from './url-entity-opportunity.js';
import { resolveEntityFromUrl } from './qualify-url-opportunity.js';
import { buildEvidenceFirstUrlAnswer, type UrlIntakeSummary } from './url-intake-answer.js';
import { buildUrlIntakeFailureAnswer } from './url-intake-pipeline.js';
import {
  inferBrandSlugFromIntel,
  parsePartnershipUrl,
} from '../creator-partnership/url-intelligence.js';
import {
  classifyUrlIntakeRoute,
  shouldOpenCreatorOpportunityPipeline,
} from '../creator-partnership/url-intake-route.js';

const IG_POST = 'https://www.instagram.com/p/DbtacOJzN1R/';
const IG_POST_TRACKED =
  'https://www.instagram.com/p/DbtacOJzN1R/?igsh=abc&utm_source=ig&fbclid=IwAR&igshid=xyz&igsi=1';
const IG_PROFILE = 'https://www.instagram.com/tezcartertv';
const LINKTREE = 'https://linktr.ee/TezCarterEvents';
const LINKTREE_TRACKED =
  'https://linktr.ee/TezCarterEvents?utm_source=ig&fbclid=IwAR123&igshid=foo';

function emptySummary(overrides: Partial<UrlIntakeSummary> = {}): UrlIntakeSummary {
  return {
    entity: null,
    locationScope: null,
    watchRuleSaved: false,
    qualifiedCount: 0,
    quarantinedCount: 0,
    quarantineReasons: [],
    needsLocationConfirmation: false,
    identifiedLocations: [],
    savedTitles: [],
    ...overrides,
  };
}

describe('standalone URL type routing', () => {
  it('classifies Instagram /p/ and /reel/ as social_post, ignoring tracking params', () => {
    assert.equal(classifyStandaloneUrlType(IG_POST), 'social_post');
    assert.equal(classifyStandaloneUrlType(IG_POST_TRACKED), 'social_post');
    assert.equal(classifyStandaloneUrlType('https://www.instagram.com/reel/DbtacOJzN1R/'), 'social_post');
    assert.equal(classifyStandaloneUrlType('https://www.instagram.com/reels/DbtacOJzN1R/'), 'social_post');
    assert.equal(isInstagramPostUrl(IG_POST), true);
    assert.equal(isInstagramProfileUrl(IG_POST), false);
  });

  it('classifies Instagram username paths as social_profile', () => {
    assert.equal(classifyStandaloneUrlType(IG_PROFILE), 'social_profile');
    assert.equal(classifyStandaloneUrlType(`${IG_PROFILE}?utm_source=ig`), 'social_profile');
    assert.equal(isInstagramProfileUrl(IG_PROFILE), true);
    assert.equal(isInstagramPostUrl(IG_PROFILE), false);
  });

  it('classifies Linktree as link_hub', () => {
    assert.equal(classifyStandaloneUrlType(LINKTREE), 'link_hub');
    assert.equal(classifyStandaloneUrlType(LINKTREE_TRACKED), 'link_hub');
    assert.equal(isLinkHubUrl(LINKTREE), true);
    assert.equal(hubOwnerFromPath(LINKTREE), 'Tez Carter Events');
  });

  it('rejects opaque social/content IDs as entity names', () => {
    assert.equal(isOpaqueContentId('DbtacOJzN1R'), true);
    assert.equal(isOpaqueContentId('Cxyz123Ab'), true);
    assert.equal(isOpaqueContentId('550e8400-e29b-41d4-a716-446655440000'), true);
    assert.equal(isOpaqueContentId('fbclid'), true);
    assert.equal(isOpaqueContentId('utm_source'), true);
    assert.equal(isOpaqueContentId('igshid'), true);
    assert.equal(isOpaqueContentId('TezCarterEvents'), false);
    assert.equal(isOpaqueContentId('tezcartertv'), false);
  });

  it('does not treat an Instagram post shortcode as a business name', () => {
    assert.equal(
      inferBusinessName({
        domain: 'instagram.com',
        sourceUrl: IG_POST,
        pageTitle: 'DbtacOJzN1R',
        entity: { businessName: 'DbtacOJzN1R', domain: 'instagram.com', officialDomain: 'instagram.com', locations: [], multiLocation: false },
      }),
      'Instagram',
    );
    const entity = resolveEntityFromUrl(IG_POST, 'DbtacOJzN1R');
    assert.notEqual((entity.businessName ?? '').toLowerCase(), 'dbtaco jzn1r');
    assert.notEqual(entity.businessName, 'DbtacOJzN1R');
    const qualified = qualifyEntityFromUrl({
      pageUrl: IG_POST,
      pageText: 'Instagram post caption about a weekend in Kansas City food and menu specials',
      entity,
      needsLocationConfirmation: false,
      businessName: 'DbtacOJzN1R',
    });
    assert.equal(qualified.accepted, false);
  });

  it('classifies outbound Linktree destinations by their own URL type', () => {
    const dests = extractLinkHubDestinations({
      hubUrl: LINKTREE,
      pageText: [
        'Tez Carter Events',
        'https://www.instagram.com/tezcartertv',
        'https://www.instagram.com/p/DbtacOJzN1R/',
        'https://www.eventbrite.com/e/tez-carter-live-tickets-123',
        'https://linktr.ee/TezCarterEvents',
      ].join('\n'),
    });
    assert.ok(dests.some((d) => d.type === 'social_profile'));
    assert.ok(dests.some((d) => d.type === 'social_post'));
    assert.ok(dests.some((d) => /eventbrite/i.test(d.url)));
    assert.equal(
      dests.some((d) => /linktr\.ee/i.test(d.url)),
      false,
    );
  });
});

describe('Ask Benson social + link-hub routing regressions', () => {
  it('A. Instagram post is SOCIAL_POST_INTAKE, never a brand slug or partnership', () => {
    const intel = parsePartnershipUrl(IG_POST_TRACKED);
    assert.equal(
      intel.heuristics.some((h) => h.label === 'likely_brand_slug'),
      false,
    );
    assert.equal(
      intel.heuristics.some((h) => h.label === 'likely_product_path'),
      false,
    );
    assert.equal(inferBrandSlugFromIntel(intel), null);
    assert.doesNotMatch(intel.normalizedUrl, /igshid|igsi|igsh|utm_|fbclid/i);

    const classified = classifyUrlIntakeRoute({ url: IG_POST, message: IG_POST });
    assert.equal(classified.route, 'social_post');
    const gate = shouldOpenCreatorOpportunityPipeline(IG_POST);
    assert.equal(gate.open, false);
    assert.equal(gate.initialRoute, 'social_post');

    const answer = buildEvidenceFirstUrlAnswer({
      pageUrl: IG_POST,
      summary: emptySummary({ qualificationOutcome: 'SOCIAL_POST_INTAKE' }),
    });
    const combined = [answer.answer, ...answer.suggestedActions].join(' ');
    assert.match(answer.answer, /instagram post/i);
    assert.doesNotMatch(answer.answer, /Dbtacojzn1r at Instagram/i);
    assert.doesNotMatch(answer.answer, /likely brand slug/i);
    assert.doesNotMatch(combined, /partnership/i);
    assert.doesNotMatch(combined, /call_location/i);
    assert.doesNotMatch(combined, /restaurant/i);
    assert.equal(answer.opportunityActions?.length ?? 0, 0);
  });

  it('B. Instagram profile is SOCIAL_PROFILE_SOURCE, not partnership or /menu copy', () => {
    const classified = classifyUrlIntakeRoute({ url: IG_PROFILE, message: IG_PROFILE });
    assert.equal(classified.route, 'social_profile');
    const gate = shouldOpenCreatorOpportunityPipeline(IG_PROFILE);
    assert.equal(gate.open, false);
    assert.equal(gate.reason, 'social_profile_route');

    const answer = buildEvidenceFirstUrlAnswer({
      pageUrl: IG_PROFILE,
      summary: emptySummary({
        qualificationOutcome: 'SOCIAL_PROFILE_SOURCE',
        instagramHandle: 'tezcartertv',
      }),
    });
    const combined = [answer.answer, ...answer.evidence, ...answer.suggestedActions].join(' ');
    assert.match(answer.answer, /@tezcartertv/i);
    assert.match(answer.answer, /profile/i);
    assert.match(combined, /watchlist/i);
    assert.doesNotMatch(combined, /\/events or \/menu/i);
    assert.doesNotMatch(combined, /paste a \/p\/ or \/reel/i);
    assert.doesNotMatch(combined, /restaurant/i);
    assert.doesNotMatch(combined, /partnership/i);
    assert.equal(answer.opportunityActions?.length ?? 0, 0);

    const failure = buildUrlIntakeFailureAnswer({
      urls: [IG_PROFILE],
      diagnostics: [
        {
          url: IG_PROFILE,
          domain: 'instagram.com',
          methodsAttempted: ['instagram_session'],
          httpStatus: null,
          fetchOk: false,
          textLength: 0,
          jsRenderingRequired: true,
          browserFallbackRan: false,
          browserFallbackOk: false,
          ocrAttempted: false,
          ocrOk: false,
          accessBlocked: true,
          blockReason: 'login_required',
          surfacesInspected: [],
          webSearchFallback: false,
          nextAction: 'Keep as a source or inspect supported profile information.',
          summary: 'Instagram session is not configured.',
        },
      ],
    });
    const failCombined = [failure.answer, ...failure.suggestedActions].join(' ');
    assert.doesNotMatch(failCombined, /paste a direct \/events or \/menu/i);
  });

  it('C. Linktree is LINK_HUB_INTAKE, not restaurant/food discovery', () => {
    const classified = classifyUrlIntakeRoute({ url: LINKTREE_TRACKED, message: LINKTREE_TRACKED });
    assert.equal(classified.route, 'link_hub');
    const gate = shouldOpenCreatorOpportunityPipeline(LINKTREE);
    assert.equal(gate.open, false);
    assert.equal(gate.initialRoute, 'link_hub');
    assert.equal(inferBrandSlugFromIntel(parsePartnershipUrl(LINKTREE)), null);

    const answer = buildEvidenceFirstUrlAnswer({
      pageUrl: LINKTREE,
      summary: emptySummary({
        qualificationOutcome: 'LINK_HUB_INTAKE',
        hubOwner: 'Tez Carter Events',
        hubDestinations: [
          { url: 'https://www.instagram.com/tezcartertv', type: 'social_profile' },
          { url: 'https://www.eventbrite.com/e/tez-live-123', type: 'unknown' },
        ],
        entityOpportunityType: 'restaurant_food_discovery',
      }),
    });
    const combined = [answer.answer, ...answer.evidence, ...answer.suggestedActions].join(' ');
    assert.match(answer.answer, /Linktree/i);
    assert.match(answer.answer, /Tez Carter Events/);
    assert.match(answer.answer, /Instagram/);
    assert.doesNotMatch(combined, /restaurant \/ food discovery/i);
    assert.doesNotMatch(combined, /likely brand slug/i);
    assert.equal(answer.opportunityActions?.length ?? 0, 0);
  });

  it('D. genuine creator-program URL still opens partnership', () => {
    const url = 'https://brand.example.com/pages/creator-program';
    const msg = `Check this affiliate program ${url}`;
    assert.equal(classifyUrlIntakeRoute({ url, message: msg }).route, 'creator_partnership');
    assert.equal(shouldOpenCreatorOpportunityPipeline(msg).open, true);
  });

  it('E. genuine event listing still routes to listing/event intake', () => {
    const eventbrite = 'https://www.eventbrite.com/e/some-concert-tickets-123';
    assert.equal(classifyUrlIntakeRoute({ url: eventbrite, message: eventbrite }).route, 'event_opportunity');
    assert.equal(shouldOpenCreatorOpportunityPipeline(eventbrite).open, false);

    const osc = 'https://www.theosc.co/events';
    const oscRoute = classifyUrlIntakeRoute({ url: osc, message: osc });
    assert.equal(oscRoute.route, 'event_opportunity');
    assert.equal(shouldOpenCreatorOpportunityPipeline(osc).open, false);
  });

  it('SCHEELS commerce control still opens the opportunity pipeline', () => {
    const url =
      'https://www.scheels.com/c/all/b/what%20goes%20around%20comes%20around?r=storeAvailability%3A88';
    const gate = shouldOpenCreatorOpportunityPipeline(url);
    assert.equal(gate.open, true);
    assert.equal(gate.reason, 'commerce_opportunity_candidate');
  });
});
