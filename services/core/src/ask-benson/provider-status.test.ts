import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizedProviderFromUrl,
  providerStatusValueForTerminalResearch,
  resolveAskBensonProviderStatus,
  resolveAskBensonProviderStatusForResearchTerminal,
} from './provider-status.js';
import type { UrlIntakeDiagnostics } from './url-intake-pipeline.js';

function diagnostics(overrides: Partial<UrlIntakeDiagnostics> = {}): UrlIntakeDiagnostics {
  return {
    url: 'https://example.com/page',
    domain: 'example.com',
    methodsAttempted: ['html_text'],
    httpStatus: null,
    fetchOk: false,
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
    nextAction: '',
    summary: '',
    ...overrides,
  };
}

describe('Ask Benson provider status', () => {
  it('keeps Clothes Mentor and SCHEELS generic', () => {
    assert.equal(normalizedProviderFromUrl('https://clothesmentor.com/stores/overland-park'), 'generic');
    assert.equal(normalizedProviderFromUrl('https://www.scheels.com/creators'), 'generic');
  });

  it('requires matching diagnostics before retaining Instagram provider copy', () => {
    assert.equal(
      resolveAskBensonProviderStatus({
        sourceUrls: ['https://instagram.com/p/example'],
        diagnostics: [diagnostics()],
      }).provider,
      'generic',
    );
    assert.equal(
      resolveAskBensonProviderStatus({
        sourceUrls: ['https://instagram.com/p/example'],
        diagnostics: [
          diagnostics({
            url: 'https://instagram.com/p/example',
            domain: 'instagram.com',
            methodsAttempted: ['instagram_session'],
          }),
        ],
      }).provider,
      'instagram',
    );
  });

  it('does not invent TikTok diagnostics and distinguishes fallback from terminal', () => {
    const fallback = resolveAskBensonProviderStatus({
      sourceUrls: ['https://tiktok.com/@creator/video/1'],
      diagnostics: [diagnostics({ webSearchFallback: true })],
    });
    const terminal = resolveAskBensonProviderStatus({
      sourceUrls: ['https://example.com/page'],
      diagnostics: [diagnostics()],
      terminal: true,
    });
    assert.equal(fallback.provider, 'generic');
    assert.equal(fallback.status, 'fallback_active');
    assert.equal(terminal.status, 'terminal_failure');
    assert.notEqual(fallback.status, terminal.status);
    assert.equal(fallback.originalUrl, 'https://tiktok.com/@creator/video/1');
  });

  it('finalizes processing providerStatus when research reaches terminal', () => {
    const prior = resolveAskBensonProviderStatus({
      sourceUrls: ['https://www.scheels.com/c/all/b/wgaca'],
      diagnostics: [diagnostics({ url: 'https://www.scheels.com/c/all/b/wgaca', domain: 'scheels.com' })],
    });
    assert.equal(prior.status, 'processing');

    const complete = resolveAskBensonProviderStatusForResearchTerminal({
      prior,
      researchStatus: 'complete',
    });
    assert.ok(complete);
    assert.equal(complete?.status, 'complete');
    assert.equal(complete?.provider, 'generic');
    assert.equal(complete?.originalUrl, 'https://www.scheels.com/c/all/b/wgaca');
    assert.equal(complete?.diagnostics.length, 1);

    const needsVerification = resolveAskBensonProviderStatusForResearchTerminal({
      prior,
      researchStatus: 'needs_verification',
    });
    assert.equal(needsVerification?.status, 'terminal_failure');
    assert.notEqual(needsVerification?.status, 'processing');
    assert.notEqual(needsVerification?.status, 'fallback_active');
    assert.equal(needsVerification?.originalUrl, prior.originalUrl);

    const failed = resolveAskBensonProviderStatusForResearchTerminal({
      prior,
      researchStatus: 'failed',
    });
    assert.equal(failed?.status, 'terminal_failure');
    assert.equal(failed?.provider, prior.provider);
    assert.equal(failed?.originalUrl, prior.originalUrl);
    assert.deepEqual(failed?.diagnostics, prior.diagnostics);

    assert.equal(providerStatusValueForTerminalResearch('complete'), 'complete');
    assert.equal(providerStatusValueForTerminalResearch('needs_verification'), 'terminal_failure');
    assert.equal(providerStatusValueForTerminalResearch('failed'), 'terminal_failure');
  });
});
