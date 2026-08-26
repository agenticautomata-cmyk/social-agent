import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ASK_BENSON_FALLBACK_ACTIVE,
  ASK_BENSON_LINK_TIMEOUT_ERROR,
  ASK_BENSON_TERMINAL_VERIFICATION_FAILURE,
  askBensonProviderStatusCopy,
  canSendAskBensonComposer,
  userFacingAskBensonError,
} from './ask-benson-types';

describe('Ask Benson provider status copy', () => {
  it('uses generic processing copy for generic network failures', () => {
    const copy = userFacingAskBensonError('Failed to fetch');
    assert.equal(copy, ASK_BENSON_LINK_TIMEOUT_ERROR);
    assert.doesNotMatch(copy, /instagram|tiktok/i);
  });

  it('requires provider and diagnostics to match for provider-specific text', () => {
    const generic = askBensonProviderStatusCopy({
      provider: 'instagram',
      status: 'processing',
      originalUrl: 'https://instagram.com/p/example',
      diagnostics: [{ domain: 'example.com', methodsAttempted: ['html_text'] }],
    });
    const instagram = askBensonProviderStatusCopy({
      provider: 'instagram',
      status: 'processing',
      originalUrl: 'https://instagram.com/p/example',
      diagnostics: [
        { domain: 'instagram.com', methodsAttempted: ['instagram_session'] },
      ],
    });
    assert.doesNotMatch(generic ?? '', /instagram/i);
    assert.match(instagram ?? '', /instagram/i);
  });

  it('keeps fallback active distinct from terminal failure without retry copy', () => {
    assert.equal(
      askBensonProviderStatusCopy({
        provider: 'generic',
        status: 'fallback_active',
        originalUrl: 'https://scheels.com/creator',
      }),
      ASK_BENSON_FALLBACK_ACTIVE,
    );
    assert.equal(
      askBensonProviderStatusCopy({
        provider: 'generic',
        status: 'terminal_failure',
        originalUrl: 'https://scheels.com/creator',
      }),
      ASK_BENSON_TERMINAL_VERIFICATION_FAILURE,
    );
    assert.doesNotMatch(ASK_BENSON_FALLBACK_ACTIVE, /try again|retry/i);
  });

  it('never uses Instagram copy for Clothes Mentor or SCHEELS', () => {
    for (const url of ['https://www.clothesmentor.com/store', 'https://www.scheels.com/creator']) {
      const copy = askBensonProviderStatusCopy({
        provider: 'generic',
        status: 'processing',
        originalUrl: url,
      });
      assert.equal(copy, ASK_BENSON_LINK_TIMEOUT_ERROR);
      assert.doesNotMatch(copy ?? '', /instagram|tiktok/i);
    }
  });

  it('does not invent TikTok copy without TikTok diagnostics', () => {
    const copy = askBensonProviderStatusCopy({
      provider: 'tiktok',
      status: 'processing',
      originalUrl: 'https://www.tiktok.com/@creator/video/1',
      diagnostics: [{ domain: 'tiktok.com', methodsAttempted: ['html_text'] }],
    });
    assert.equal(copy, ASK_BENSON_LINK_TIMEOUT_ERROR);
    assert.doesNotMatch(copy ?? '', /tiktok/i);
  });

  it('suppresses processing copy once researchStatus is terminal', () => {
    const prior = {
      provider: 'generic' as const,
      status: 'processing' as const,
      originalUrl: 'https://www.scheels.com/c/all/b/wgaca',
      diagnostics: [{ url: 'https://www.scheels.com/c/all/b/wgaca', domain: 'scheels.com' }],
    };
    assert.equal(askBensonProviderStatusCopy(prior), ASK_BENSON_LINK_TIMEOUT_ERROR);
    assert.equal(askBensonProviderStatusCopy(prior, 'complete'), null);
    assert.doesNotMatch(askBensonProviderStatusCopy(prior, 'complete') ?? '', /still reading|checking other/i);
    assert.equal(
      askBensonProviderStatusCopy(prior, 'needs_verification'),
      ASK_BENSON_TERMINAL_VERIFICATION_FAILURE,
    );
    assert.doesNotMatch(
      askBensonProviderStatusCopy(prior, 'needs_verification') ?? '',
      /still reading|checking other/i,
    );
    assert.equal(askBensonProviderStatusCopy(prior, 'failed'), ASK_BENSON_TERMINAL_VERIFICATION_FAILURE);
  });
});

describe('canSendAskBensonComposer', () => {
  it('allows text-only, image-only, and image+text; rejects empty', () => {
    assert.equal(canSendAskBensonComposer({ text: 'hello', hasImage: false }), true);
    assert.equal(canSendAskBensonComposer({ text: '', hasImage: true }), true);
    assert.equal(canSendAskBensonComposer({ text: '  what is this  ', hasImage: true }), true);
    assert.equal(canSendAskBensonComposer({ text: '   ', hasImage: false }), false);
    assert.equal(canSendAskBensonComposer({ text: '', hasImage: false, hasMedia: false }), false);
  });
});
