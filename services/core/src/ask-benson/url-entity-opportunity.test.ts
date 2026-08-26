import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEntityExternalId,
  buildEntityOpportunityRow,
  entityConsistentWithUrlEvidence,
  hasUsableExtractedContent,
  inferBusinessName,
  inferEntityLocation,
  inferOpportunityType,
  qualifyEntityFromUrl,
  resolveIntakeOutcome,
  userExplicitlyAskedToResearchUrl,
} from './url-entity-opportunity.js';
import { resolveEntityFromUrl } from './qualify-url-opportunity.js';
import { buildEvidenceFirstUrlAnswer } from './url-intake-answer.js';
import { buildUrlIntakeFailureAnswer } from './url-intake-pipeline.js';

describe('url-entity-opportunity', () => {
  it('creates stable entity external ids for dedup', () => {
    const a = buildEntityExternalId('halfofhalf.com', 'Lenexa');
    const b = buildEntityExternalId('halfofhalf.com', 'Lenexa');
    assert.equal(a, b);
    assert.match(a, /^ask-benson-entity-/);
  });

  it('infers Half of Half from domain and page text', () => {
    assert.equal(
      inferBusinessName({
        pageTitle: 'Home',
        pageText: 'Welcome to ½ of ½ Name Brand Clothing in Lenexa',
        domain: 'halfofhalf.com',
      }),
      'Half of Half',
    );
  });

  it('accepts user-submitted entity with Lenexa scope', () => {
    const entity = resolveEntityFromUrl('https://www.halfofhalf.com', 'Home');
    const result = qualifyEntityFromUrl({
      pageUrl: 'https://www.halfofhalf.com',
      pageText: 'Lenexa store hours and weekly markdowns for name brand clothing bargains',
      entity,
      locationScope: 'Lenexa',
      needsLocationConfirmation: false,
      businessName: 'Half of Half',
    });
    assert.equal(result.accepted, true);
  });

  it('requires branch selection for multi-location without scope', () => {
    const entity = resolveEntityFromUrl('https://www.halfofhalf.com', 'Home');
    const result = qualifyEntityFromUrl({
      pageUrl: 'https://www.halfofhalf.com',
      pageText: 'Lenexa and Tulsa stores with weekly markdowns and hours posted',
      entity: { ...entity, multiLocation: true, locations: ['Lenexa', 'Tulsa'] },
      needsLocationConfirmation: true,
      businessName: 'Half of Half',
    });
    assert.equal(result.accepted, false);
    assert.equal(result.pendingLocation, true);
  });

  it('builds entity row without event date', () => {
    const entity = resolveEntityFromUrl('https://www.halfofhalf.com', 'Home');
    const row = buildEntityOpportunityRow({
      campaignId: 'camp',
      sourceId: 'src',
      pageUrl: 'https://www.halfofhalf.com',
      businessName: 'Half of Half',
      locationName: 'Lenexa, Kansas',
      locationScope: 'Lenexa',
      opportunityType: 'shopping_bargain_discovery',
      entity,
      outcome: 'ENTITY_ACCEPTED_CLAIMS_QUARANTINED',
      externalId: 'ask-benson-entity-halfofhalf-com-lenexa',
    });
    assert.equal(row.eventStartsAt, null);
    assert.equal(row.creatorValueStatus, 'creator_candidate');
    assert.equal((row.metadata as Record<string, unknown>).opportunityLayer, 'entity');
    assert.equal((row.metadata as Record<string, unknown>).reviewStatus, 'unreviewed');
    assert.equal(
      ((row.metadata as Record<string, unknown>).userSubmission as Record<string, unknown>).submittedByUser,
      true,
    );
  });

  it('resolves intake outcomes separately from claims', () => {
    assert.equal(
      resolveIntakeOutcome({
        entityAccepted: true,
        pendingLocation: false,
        qualifiedClaimCount: 0,
        quarantinedClaimCount: 2,
        extractedClaimCount: 2,
      }),
      'ENTITY_ACCEPTED_CLAIMS_QUARANTINED',
    );
    assert.equal(
      resolveIntakeOutcome({
        entityAccepted: true,
        pendingLocation: false,
        qualifiedClaimCount: 0,
        quarantinedClaimCount: 0,
        extractedClaimCount: 0,
      }),
      'ENTITY_ACCEPTED_NO_CURRENT_CLAIMS',
    );
    assert.equal(
      resolveIntakeOutcome({
        entityAccepted: false,
        pendingLocation: false,
        qualifiedClaimCount: 0,
        quarantinedClaimCount: 2,
        extractedClaimCount: 2,
      }),
      'NO_SUPPORTED_ENTITY',
    );
    assert.equal(
      resolveIntakeOutcome({
        entityAccepted: false,
        pendingLocation: false,
        listingPage: true,
        qualifiedClaimCount: 7,
        quarantinedClaimCount: 2,
        extractedClaimCount: 9,
      }),
      'LISTING_EVENTS_ACCEPTED',
    );
    assert.equal(
      resolveIntakeOutcome({
        entityAccepted: false,
        pendingLocation: false,
        listingPage: true,
        staleEditorialRoundup: true,
        qualifiedClaimCount: 0,
        quarantinedClaimCount: 8,
        extractedClaimCount: 9,
      }),
      'EDITORIAL_ROUNDUP_STALE',
    );
    assert.equal(
      resolveIntakeOutcome({
        entityAccepted: false,
        pendingLocation: true,
        listingPage: true,
        qualifiedClaimCount: 0,
        quarantinedClaimCount: 3,
        extractedClaimCount: 3,
      }),
      'NO_SUPPORTED_ENTITY',
    );
  });

  it('OSC regression: zero-content fetch does not authorize entity accept', () => {
    assert.equal(hasUsableExtractedContent(''), false);
    assert.equal(hasUsableExtractedContent('   '), false);
    assert.equal(hasUsableExtractedContent(null), false);

    const entity = resolveEntityFromUrl('https://www.theosc.co/events');
    const result = qualifyEntityFromUrl({
      pageUrl: 'https://www.theosc.co/events?view=calendar&month=August-2026',
      pageText: '',
      pageTitle: 'Los Angeles Welcomes Workers with Open Arms as it Unveils a New',
      entity,
      locationScope: 'Kansas City',
      needsLocationConfirmation: false,
      businessName: 'Los Angeles Welcomes Workers with Open Arms as it Unveils a New',
    });
    assert.equal(result.accepted, false);
    assert.match(result.rejectionReason ?? '', /usable extracted content/i);
  });

  it('OSC regression: unrelated news headline is inconsistent with theosc.co host', () => {
    const consistency = entityConsistentWithUrlEvidence({
      pageUrl: 'https://www.theosc.co/events',
      businessName: 'Los Angeles Welcomes Workers with Open Arms as it Unveils a New',
      pageTitle: 'Los Angeles Welcomes Workers with Open Arms as it Unveils a New',
      pageText:
        'Los Angeles Welcomes Workers with Open Arms as it Unveils a New program for remote workers relocating this year.',
      fromWebSearchFallback: true,
    });
    assert.equal(consistency.ok, false);

    const entity = resolveEntityFromUrl('https://www.theosc.co/events');
    const result = qualifyEntityFromUrl({
      pageUrl: 'https://www.theosc.co/events',
      pageText:
        'Los Angeles Welcomes Workers with Open Arms as it Unveils a New program for remote workers relocating this year.',
      pageTitle: 'Los Angeles Welcomes Workers with Open Arms as it Unveils a New',
      entity,
      locationScope: 'Kansas City',
      needsLocationConfirmation: false,
      businessName: 'Los Angeles Welcomes Workers with Open Arms as it Unveils a New',
      fromWebSearchFallback: true,
    });
    assert.equal(result.accepted, false);
  });

  it('OSC regression: inferBusinessName prefers domain over unrelated headline', () => {
    assert.equal(
      inferBusinessName({
        pageTitle: 'Los Angeles Welcomes Workers with Open Arms as it Unveils a New',
        pageText: '',
        domain: 'theosc.co',
      }),
      'Theosc',
    );
    assert.equal(userExplicitlyAskedToResearchUrl('https://www.theosc.co/events'), false);
    assert.equal(userExplicitlyAskedToResearchUrl('please research this URL'), true);
  });

  it('OSC regression: NO_SUPPORTED_ENTITY answer has no positive opportunity CTAs', () => {
    const entity = resolveEntityFromUrl('https://www.theosc.co/events');
    const answer = buildEvidenceFirstUrlAnswer({
      pageUrl: 'https://www.theosc.co/events?view=calendar&month=August-2026',
      summary: {
        entity,
        locationScope: null,
        watchRuleSaved: false,
        qualifiedCount: 0,
        quarantinedCount: 2,
        quarantineReasons: ['unsupported extraction'],
        needsLocationConfirmation: false,
        identifiedLocations: [],
        savedTitles: [],
        qualificationOutcome: 'NO_SUPPORTED_ENTITY',
        entityOpportunityId: null,
        entityOpportunityTitle: 'Los Angeles Welcomes Workers with Open Arms as it Unveils a New — Kansas City',
        entityOpportunityType: 'restaurant_food_discovery',
        entityCreated: false,
        opportunityActions: [
          { label: 'Open opportunity', href: '/review/inventory?id=bad' },
          { label: 'Interested', href: '/review/inventory?id=bad&action=interested' },
        ],
        diagnostics: [
          {
            url: 'https://www.theosc.co/events',
            domain: 'theosc.co',
            methodsAttempted: ['http_metadata', 'html_text'],
            httpStatus: 200,
            fetchOk: true,
            textLength: 0,
            jsRenderingRequired: false,
            browserFallbackRan: false,
            browserFallbackOk: false,
            ocrAttempted: false,
            ocrOk: false,
            accessBlocked: false,
            blockReason: null,
            surfacesInspected: [],
            webSearchFallback: false,
            nextAction: 'Retry this URL',
            summary: 'Opened theosc.co (HTTP 200) but extracted 0 usable characters of page content.',
          },
        ],
      },
    });
    assert.match(answer.answer, /couldn't extract enough usable information/i);
    assert.doesNotMatch(answer.answer, /Los Angeles Welcomes Workers/i);
    assert.doesNotMatch(answer.answer, /SCHEELS/i);
    assert.doesNotMatch(answer.answer, /restaurant/i);
    assert.equal(answer.opportunityActions?.length ?? 0, 0);
    assert.ok(answer.suggestedActions.some((a) => /Retry/i.test(a)));
    assert.ok(answer.suggestedActions.some((a) => /Keep as source/i.test(a)));
    assert.ok(!answer.suggestedActions.some((a) => /Open opportunity/i.test(a)));
    assert.ok(!answer.suggestedActions.some((a) => /^Interested/i.test(a)));
  });

  it('OSC regression: failure answer for HTTP 200 / 0 chars', () => {
    const result = buildUrlIntakeFailureAnswer({
      urls: ['https://www.theosc.co/events?view=calendar&month=August-2026'],
      diagnostics: [
        {
          url: 'https://www.theosc.co/events',
          domain: 'theosc.co',
          methodsAttempted: ['http_metadata', 'html_text', 'browser_render'],
          httpStatus: 200,
          fetchOk: true,
          textLength: 0,
          jsRenderingRequired: true,
          browserFallbackRan: true,
          browserFallbackOk: true,
          ocrAttempted: false,
          ocrOk: false,
          accessBlocked: false,
          blockReason: null,
          surfacesInspected: ['/events'],
          webSearchFallback: false,
          nextAction: 'Retry this URL',
          summary: 'Opened theosc.co (HTTP 200) but extracted 0 usable characters of page content.',
        },
      ],
    });
    assert.match(result.answer, /couldn't extract enough usable information/i);
    assert.doesNotMatch(result.answer, /Los Angeles/i);
    assert.doesNotMatch(result.suggestedActions.join(' '), /Open opportunity|Interested/i);
    assert.deepEqual(result.suggestedActions.slice(0, 3), [
      'Retry / research this URL',
      'Keep as source',
      'Dismiss',
    ]);
  });

  it('answer promotes entity opportunity without Tulsa or October event', () => {
    const entity = resolveEntityFromUrl('https://www.halfofhalf.com', 'Half of Half');
    const answer = buildEvidenceFirstUrlAnswer({
      pageUrl: 'https://www.halfofhalf.com',
      summary: {
        entity,
        locationScope: 'Lenexa',
        watchRuleSaved: true,
        qualifiedCount: 0,
        quarantinedCount: 2,
        quarantineReasons: [],
        needsLocationConfirmation: false,
        identifiedLocations: ['Lenexa'],
        savedTitles: ['Half of Half — Lenexa'],
        qualificationOutcome: 'ENTITY_ACCEPTED_CLAIMS_QUARANTINED',
        entityOpportunityId: '11111111-1111-1111-1111-111111111111',
        entityOpportunityTitle: 'Half of Half — Lenexa',
        entityOpportunityType: 'shopping_bargain_discovery',
        entityCreated: true,
      },
    });
    assert.match(answer.answer, /added .*Half of Half/i);
    assert.match(answer.answer, /shopping/i);
    assert.match(answer.answer, /Calendar/i);
    assert.doesNotMatch(answer.answer, /Tulsa/i);
    assert.doesNotMatch(answer.answer, /2023/i);
    assert.doesNotMatch(answer.answer, /frosty frogs/i);
    assert.ok(answer.suggestedActions.some((a) => a.includes('/review/inventory?id=')));
  });

  it('infers Lenexa location from scope', () => {
    assert.equal(
      inferEntityLocation({ locationScope: 'Lenexa', identifiedLocations: ['Lenexa', 'Tulsa'] }),
      'Lenexa, Kansas',
    );
  });

  it('infers shopping opportunity type for bargain businesses', () => {
    assert.equal(
      inferOpportunityType('Half off name brand clothing every week', 'Half of Half'),
      'shopping_bargain_discovery',
    );
  });

  it('infers a food festival as an event, not a restaurant', () => {
    assert.equal(
      inferOpportunityType(
        'October 9-11, 2026 outdoor food festival. Get tickets now. Friday 4pm-10pm. Main Field, Kansas City, KS 66111.',
        'City Fest',
      ),
      'festival_event',
    );
  });

  it('answers an official event occurrence without restaurant copy', () => {
    const entity = resolveEntityFromUrl(
      'https://www.examplefests.com/events-1/project-one',
      'KANSAS CITY — City Fest',
    );
    const answer = buildEvidenceFirstUrlAnswer({
      pageUrl: 'https://www.examplefests.com/events-1/project-one',
      summary: {
        entity,
        locationScope: null,
        watchRuleSaved: false,
        qualifiedCount: 1,
        quarantinedCount: 0,
        quarantineReasons: [],
        needsLocationConfirmation: false,
        identifiedLocations: ['Kansas City'],
        savedTitles: ['KANSAS CITY — City Fest'],
        qualificationOutcome: 'LISTING_EVENTS_ACCEPTED',
        officialEventOccurrence: true,
        calendarItemsCreated: 1,
        eventListing: true,
      },
    });
    assert.match(answer.answer, /dated event/i);
    assert.match(answer.answer, /Calendar suggestion/i);
    assert.doesNotMatch(answer.answer, /restaurant \/ food discovery/i);
    assert.doesNotMatch(answer.answer, /nothing was added to the Calendar/i);
  });
});
