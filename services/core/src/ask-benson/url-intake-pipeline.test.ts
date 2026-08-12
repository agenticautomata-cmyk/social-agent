import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUrlIntakeFailureAnswer,
  detectAccessBlock,
  detectJsShell,
  extractUrlsFromMessage,
  isPlainUrlRequest,
  MIN_HTTP_USABLE_CHARS,
  shouldAttemptBrowserFallback,
  type UrlIntakeDiagnostics,
} from './url-intake-pipeline.js';
import { isEventListingSourcePage } from './url-intake-dedupe.js';
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

  it('OSC /events is a multi-event listing source page (no page-named entity)', () => {
    assert.equal(isEventListingSourcePage('https://www.theosc.co/events'), true);
    assert.equal(
      isEventListingSourcePage(
        'https://www.theosc.co/',
        'Upcoming Events\nFusion Fest Aug 21, 2026 View Event\nRob Tribb Aug 19, 2026 RSVP',
      ),
      true,
    );
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
