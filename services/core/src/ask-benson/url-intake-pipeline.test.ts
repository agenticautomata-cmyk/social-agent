import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUrlIntakeFailureAnswer,
  detectJsShell,
  extractUrlsFromMessage,
  isPlainUrlRequest,
  type UrlIntakeDiagnostics,
} from './url-intake-pipeline.js';

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
