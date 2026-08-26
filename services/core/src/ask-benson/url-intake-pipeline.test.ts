import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUrlIntakeFailureAnswer,
  detectAccessBlock,
  detectJsShell,
  extractUrlsFromMessage,
  hasDatedEventCues,
  isClientRenderedListingUrl,
  isPlainUrlRequest,
  MIN_HTTP_USABLE_CHARS,
  shouldAttemptBrowserFallback,
  type UrlIntakeDiagnostics,
} from './url-intake-pipeline.js';
import { isEventListingSourcePage, listingSourceLabel } from './url-intake-dedupe.js';
import { applyListingProvenance } from './listing-extract.js';
import { buildEvidenceFirstUrlAnswer } from './url-intake-answer.js';
import {
  entityConsistentWithUrlEvidence,
  hasUsableExtractedContent,
  qualifyEntityFromUrl,
  userExplicitlyAskedToResearchUrl,
} from './url-entity-opportunity.js';
import { resolveEntityFromUrl } from './qualify-url-opportunity.js';

function sampleDiagnostics(overrides: Partial<UrlIntakeDiagnostics> = {}): UrlIntakeDiagnostics {
  return {
    url: 'https://www.silkroadkc.com/',
    domain: 'silkroadkc.com',
    methodsAttempted: ['http_metadata', 'html_text', 'surface_crawl', 'browser_render'],
    httpStatus: 200,
    fetchOk: true,
    textLength: 42,
    jsRenderingRequired: true,
    browserFallbackRan: true,
    browserFallbackOk: true,
    ocrAttempted: false,
    ocrOk: false,
    accessBlocked: false,
    blockReason: null,
    surfacesInspected: ['https://www.silkroadkc.com/'],
    webSearchFallback: false,
    nextAction: 'Share a screenshot of the page',
    summary: 'Rendered silkroadkc.com with browser fallback (1800 chars) but no structured events found.',
    ...overrides,
  };
}

describe('url-intake-pipeline', () => {
  it('detects plain URLs in Ask Benson messages', () => {
    const urls = extractUrlsFromMessage('Check this out https://www.silkroadkc.com/ please');
    assert.deepEqual(urls, ['https://www.silkroadkc.com/']);
    assert.equal(isPlainUrlRequest('https://www.silkroadkc.com/', urls), true);
    assert.equal(isPlainUrlRequest('https://www.silkroadkc.com', ['https://www.silkroadkc.com/']), true);
    assert.equal(
      isPlainUrlRequest('What events are on https://www.silkroadkc.com/?', urls),
      false,
    );
  });

  it('flags Google Sites JS shells for browser fallback', () => {
    const html = `<html><head><script>window['ppConfig']={}</script></head><body><div id="sites-viewer-frontend"></div></body></html>`;
    const text = 'Loading…';
    assert.equal(detectJsShell(html, text), true);
  });

  it('does not treat Squarespace captchaSettings JSON as an access block', () => {
    const html = `<html><body><script>window.Static={"SQUARESPACE_CONTEXT":{"website":{"captchaSettings":{"enabledForDonations":false}}}}</script><main>Upcoming Events Fusion Fest View Event</main></body></html>`;
    assert.equal(detectAccessBlock(html, 200), null);
  });

  it('still detects real captcha challenge widgets', () => {
    const html = `<html><body><div class="g-recaptcha" data-sitekey="x"></div><form>verify you are human</form></body></html>`;
    assert.equal(detectAccessBlock(html, 200), 'captcha');
  });

  it('HTTP 200 + thin content triggers browser fallback; rich HTML does not', () => {
    assert.equal(
      shouldAttemptBrowserFallback({
        httpStatus: 200,
        textLength: 0,
        jsRenderingRequired: false,
        hardAccessBlock: false,
      }),
      true,
    );
    assert.equal(
      shouldAttemptBrowserFallback({
        httpStatus: 200,
        textLength: 120,
        jsRenderingRequired: true,
        hardAccessBlock: false,
      }),
      true,
    );
    assert.equal(
      shouldAttemptBrowserFallback({
        httpStatus: 200,
        textLength: MIN_HTTP_USABLE_CHARS + 50,
        jsRenderingRequired: false,
        hardAccessBlock: false,
      }),
      false,
    );
    assert.equal(
      shouldAttemptBrowserFallback({
        httpStatus: 403,
        textLength: 0,
        jsRenderingRequired: false,
        hardAccessBlock: true,
      }),
      false,
    );
  });

  it('KC Studio /calendar/#/ HTTP shell is a thin JS app, not usable listing content', () => {
    const url = 'https://kcstudio.org/calendar/#/';
    const html = `<!DOCTYPE html><html><head><title>KC Studio Arts Calendar – KC STUDIO</title>
${'<script>var pad=' + JSON.stringify('x'.repeat(800)) + '</script>'.repeat(4)}
<script type="text/javascript" src="https://portal.cityspark.com/PortalScripts/KCStudio"></script>
<style>${'body{margin:0}'.repeat(400)}</style>
</head><body>
Skip to content Menu Facebook Instagram LinkedIn YouTube Donate Subscribe Newsletter Advertise Back to Top
<h2>KC Studio Arts Calendar</h2>
<p>Interested in submitting an art event? Be sure to check our calendar criteria. Stay up to date on cultural arts events by subscribing for free to KC Studio magazine and our newsletters.</p>
<script type="text/javascript" src="https://portal.cityspark.com/PortalScripts/KCStudio"></script>
</body></html>`;
    const text = [
      'KC Studio Arts Calendar – KC STUDIO Skip to content Menu Facebook Instagram LinkedIn YouTube',
      'Donate Subscribe Newsletter Advertise Back to Top Search Search for: Pick up a Magazine',
      'KC STUDIO All Arts. All The Time. Home Magazine About Articles Digital Edition Archives',
      'Art City Arts Consortium Partners Gallery Guide Reviews Theater Visual Art Music and Dance Calendar Podcast Connect',
      'KC Studio Arts Calendar Interested in submitting an art event? Be sure to check our calendar criteria.',
      'Stay up to date on cultural arts events by subscribing for free to KC Studio magazine and our newsletters.',
      'KC Studio is published by the Arts Engagement Foundation of Kansas City, a 501(c)(3) founded to promote engagement',
      'and increase participation in the arts in the Kansas City region. Arts Content Performing Visual Cinematic Literary',
      'Online Reviews TeenTix KC Reviews Explore Partners Arts Consortium Arts Partners Sponsored Content',
      'Begin typing your search above and press return to search. Press Esc to cancel. Close overlay search Menu',
    ].join(' ');
    assert.ok(text.length > 400, 'fixture must be non-empty HTTP text like production (~1.6k chars)');
    assert.equal(hasDatedEventCues(text), false);
    assert.equal(isClientRenderedListingUrl(url), true);
    assert.equal(detectJsShell(html, text, url), true);
    assert.equal(
      shouldAttemptBrowserFallback({
        httpStatus: 200,
        textLength: text.length,
        jsRenderingRequired: true,
        hardAccessBlock: false,
      }),
      true,
    );
    assert.equal(
      detectJsShell(
        html,
        `${text} Upcoming Events Fusion Fest Friday, August 21, 2026 View Event RSVP Rob Tribb Wednesday, August 19, 2026`,
        url,
      ),
      false,
    );
  });

  it('calendar failure copy does not ask for a /events or /menu subpage', () => {
    const result = buildUrlIntakeFailureAnswer({
      urls: ['https://kcstudio.org/calendar/#/'],
      diagnostics: [
        sampleDiagnostics({
          url: 'https://kcstudio.org/calendar/#/',
          domain: 'kcstudio.org',
          httpStatus: 200,
          fetchOk: true,
          textLength: 1632,
          jsRenderingRequired: true,
          browserFallbackRan: true,
          browserFallbackOk: true,
          summary:
            'Rendered kcstudio.org with browser fallback (1632 chars) but the calendar still had no usable event listings.',
          nextAction:
            'I could not retrieve usable events from this calendar. Share a screenshot or paste a specific event.',
        }),
      ],
    });
    const combined = [result.answer, ...result.evidence, ...result.suggestedActions].join(' ');
    assert.match(combined, /calendar/i);
    assert.doesNotMatch(combined, /paste a direct \/events or \/menu/i);
    assert.doesNotMatch(combined, /web search/i);
    assert.doesNotMatch(combined, /SCHEELS/i);
    assert.doesNotMatch(combined, /Open partnership/i);
  });

  it('OSC /events is a multi-event listing source page (no page-named entity)', () => {
    assert.equal(isEventListingSourcePage('https://www.theosc.co/events'), true);
    assert.equal(
      isEventListingSourcePage(
        'https://www.theosc.co/',
        'Upcoming Events\nFusion Fest Aug 21, 2026 View Event\nRob Tribb Aug 19, 2026 RSVP',
      ),
      true,
    );
    assert.equal(
      listingSourceLabel(
        'Events | Join, Connect, Grow Today! &mdash; Outsiders Social Club',
        'theosc.co',
      ),
      'Outsiders Social Club',
    );
  });

  it('KC Studio summer roundup is listing/editorial intake, not a page-level partnership', () => {
    const url = 'https://kcstudio.org/top-things-to-do-this-summer-2025/';
    assert.equal(isEventListingSourcePage(url), true);
    const entity = resolveEntityFromUrl(url, 'Top Things To Do This Summer 2025');
    const answer = buildEvidenceFirstUrlAnswer({
      pageUrl: url,
      summary: {
        entity,
        locationScope: null,
        watchRuleSaved: false,
        qualifiedCount: 0,
        quarantinedCount: 8,
        quarantineReasons: ['past_event'],
        needsLocationConfirmation: false,
        identifiedLocations: ['Kansas City'],
        savedTitles: [],
        qualificationOutcome: 'EDITORIAL_ROUNDUP_STALE',
        eventListing: true,
        editorialRoundup: true,
        staleEditorialRoundup: true,
        staleEditorialYear: 2025,
        retainedQuietlyCount: 1,
        extractedTitles: ['Boulevardia', 'Worlds of Fun', 'Nelson-Atkins'],
        extractedCount: 9,
        entityOpportunityId: null,
        opportunityActions: [{ label: 'Open partnership', href: '/partnerships/scheels' }],
      },
    });
    assert.match(answer.answer, /2025 KC summer roundup/i);
    assert.match(answer.answer, /stale for current planning/i);
    assert.match(answer.answer, /not promoting/i);
    assert.match(answer.answer, /Extracted: \*\*9\*\*/i);
    assert.match(answer.answer, /Expired\/stale: \*\*8\*\*/i);
    assert.match(answer.answer, /Retained quietly: \*\*1\*\*/i);
    assert.doesNotMatch(answer.answer, /SCHEELS/i);
    assert.doesNotMatch(answer.answer, /Open partnership/i);
    assert.equal(answer.opportunityActions?.length ?? 0, 0);
    assert.equal(answer.suggestedActions.length, 0);
  });

  it('OSC listing answer reports event delta without a page-level entity or LA headline', () => {
    const entity = resolveEntityFromUrl('https://www.theosc.co/events');
    const answer = buildEvidenceFirstUrlAnswer({
      pageUrl: 'https://www.theosc.co/events',
      summary: {
        entity,
        locationScope: null,
        watchRuleSaved: false,
        qualifiedCount: 7,
        quarantinedCount: 2,
        quarantineReasons: ['past_event'],
        needsLocationConfirmation: false,
        identifiedLocations: ['Kansas City'],
        savedTitles: ['Fusion Fest', 'Rob Tribb Live Music', 'OSC Co-Work Day'],
        qualificationOutcome: 'LISTING_EVENTS_ACCEPTED',
        eventListing: true,
        listingLabel: 'Outsiders Social Club',
        listingCreated: 5,
        listingUpdated: 2,
        entityOpportunityId: null,
        opportunityActions: [{ label: 'Open opportunity', href: '/review/inventory?id=bad' }],
      },
    });
    assert.match(answer.answer, /found \*\*9\*\* upcoming events/i);
    assert.match(answer.answer, /saved \*\*7\*\* supported/i);
    assert.match(answer.answer, /New: \*\*5\*\*/i);
    assert.match(answer.answer, /Reused: \*\*2\*\*/i);
    assert.match(answer.answer, /Fusion Fest/i);
    assert.doesNotMatch(answer.answer, /Los Angeles Welcomes Workers/i);
    assert.doesNotMatch(answer.answer, /SCHEELS/i);
    assert.doesNotMatch(answer.answer, /The OSC Events/i);
    assert.equal(answer.opportunityActions?.length ?? 0, 0);
    assert.ok(answer.suggestedActions.some((a) => /View discoveries/i.test(a)));
    assert.ok(answer.suggestedActions.some((a) => /Things To Do/i.test(a)));
    assert.ok(answer.suggestedActions.some((a) => /Keep as source/i.test(a)));
  });

  it('listing provenance fills venue without inventing an unrelated entity title', () => {
    const filled = applyListingProvenance(
      {
        title: 'Fusion Fest',
        eventDate: '2026-08-21',
        location: null,
        venue: null,
        businessName: null,
        sourceUrl: 'https://www.theosc.co/events/fusion-fest',
        summary: 'Third Friday of every month.',
        tags: [],
        confidence: 0.8,
      },
      {
        listingUrl: 'https://www.theosc.co/events',
        listingLocation: 'Kansas City',
        listingVenueName: 'Outsiders Social Club',
      },
    );
    assert.equal(filled.location, 'Kansas City');
    assert.equal(filled.venue, 'Outsiders Social Club');
    assert.equal(filled.title, 'Fusion Fest');
    assert.equal(filled.sourceUrl, 'https://www.theosc.co/events/fusion-fest');
  });

  it('OSC regression: usable OSC content is coherent; unrelated headline cannot authorize entity', () => {
    const oscText = [
      'Upcoming Events',
      'Outsiders Social Club',
      'Fusion Fest Friday, August 21, 2026 8:00 PM View Event RSVP',
      'Rob Tribb Live Music Wednesday, August 19, 2026 7:00 PM View Event',
      'OSC Co-Work Day Mon, Aug 3, 2026',
    ].join('\n');
    assert.equal(hasUsableExtractedContent(oscText), true);
    assert.equal(userExplicitlyAskedToResearchUrl('https://www.theosc.co/events'), false);

    const entity = resolveEntityFromUrl('https://www.theosc.co/events', 'Events | Outsiders Social Club');
    const accepted = qualifyEntityFromUrl({
      pageUrl: 'https://www.theosc.co/events',
      pageText: oscText,
      pageTitle: 'Events | Join, Connect, Grow Today! — Outsiders Social Club',
      entity: { ...entity, businessName: 'Outsiders Social Club' },
      locationScope: null,
      needsLocationConfirmation: false,
      businessName: 'Outsiders Social Club',
    });
    assert.equal(accepted.accepted, true);

    const contaminated = entityConsistentWithUrlEvidence({
      pageUrl: 'https://www.theosc.co/events',
      businessName: 'Los Angeles Welcomes Workers with Open Arms as it Unveils a New',
      pageTitle: 'Los Angeles Welcomes Workers with Open Arms as it Unveils a New',
      pageText: oscText,
      fromWebSearchFallback: true,
    });
    assert.equal(contaminated.ok, false);
  });

  it('stale conversation context cannot contaminate OSC host consistency', () => {
    const consistency = entityConsistentWithUrlEvidence({
      pageUrl: 'https://www.theosc.co/events',
      businessName: 'SCHEELS',
      pageTitle: 'SCHEELS Outdoor',
      pageText: 'Upcoming Events at Outsiders Social Club — Fusion Fest View Event RSVP',
      fromWebSearchFallback: false,
    });
    assert.equal(consistency.ok, false);
  });

  it('buildUrlIntakeFailureAnswer never tells user to paste a link when URL was pasted', () => {
    const urls = ['https://www.silkroadkc.com/'];
    const result = buildUrlIntakeFailureAnswer({
      urls,
      diagnostics: [sampleDiagnostics()],
    });
    assert.match(result.answer, /silkroadkc\.com/i);
    assert.doesNotMatch(result.answer, /paste a link/i);
    assert.doesNotMatch(result.suggestedActions.join(' '), /paste a link/i);
    assert.ok(result.evidence.some((e) => e.includes('silkroadkc.com')));
  });

  it('failure answer stays grounded in requested domain without unrelated picks', () => {
    const result = buildUrlIntakeFailureAnswer({
      urls: ['https://www.silkroadkc.com/'],
      diagnostics: [
        sampleDiagnostics({
          summary: 'Could not extract readable content from silkroadkc.com.',
        }),
      ],
    });
    assert.match(result.answer, /silkroadkc\.com/i);
    assert.doesNotMatch(result.answer, /frosty frogs/i);
    assert.doesNotMatch(result.answer, /thrift/i);
    assert.ok(result.evidence.some((e) => e.includes('browser=ok')));
  });

  it('reports browser fallback in diagnostics trail for JS sites', () => {
    const d = sampleDiagnostics();
    assert.equal(d.jsRenderingRequired, true);
    assert.equal(d.browserFallbackRan, true);
    assert.ok(d.methodsAttempted.includes('browser_render'));
    const result = buildUrlIntakeFailureAnswer({
      urls: ['https://www.silkroadkc.com/'],
      diagnostics: [d],
    });
    assert.match(result.answer, /JavaScript rendering/i);
    assert.match(result.answer, /Browser fallback/i);
  });

  it('excludes stale prior-entity context from failure copy', () => {
    const result = buildUrlIntakeFailureAnswer({
      urls: ['https://www.silkroadkc.com/'],
      diagnostics: [sampleDiagnostics()],
      userMessage: 'https://www.silkroadkc.com/',
    });
    const combined = [result.answer, ...result.evidence, ...result.suggestedActions].join(' ');
    assert.doesNotMatch(combined, /frosty frogs/i);
    assert.doesNotMatch(combined, /calendar/i);
    assert.doesNotMatch(combined, /recommend/i);
  });
});
