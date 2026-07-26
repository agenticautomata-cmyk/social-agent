import { describe, expect, it } from 'vitest';
import { classifyError, normalizeWorkerErrorSummary, sanitizeErrorForUi } from './provider-errors.js';

describe('provider-errors', () => {
  it('classifies OpenAI 500 as transient', () => {
    const c = classifyError(new Error('500 Internal Server Error req_abc123xyz'));
    expect(c.rootCause).toBe('openai_transient');
    expect(c.retryable).toBe(true);
    expect(c.requestId).toBe('req_abc123xyz');
  });

  it('does not expose request IDs in UI messages', () => {
    const ui = sanitizeErrorForUi(new Error('500 Internal Server Error req_secret123'), 'learning');
    expect(ui).toBe('Benson Learning could not refresh.');
    expect(ui).not.toContain('req_');
  });

  it('normalizes worker summaries for control tower', () => {
    const n = normalizeWorkerErrorSummary('OpenAI HTTP 500 req_deadbeef');
    expect(n.uiSummary).not.toContain('req_');
    expect(n.rootCause).toBe('openai_transient');
  });

  it('classifies Gmail revoked tokens', () => {
    const c = classifyError(new Error('invalid_grant Token has been expired or revoked.'), 'gmail');
    expect(c.rootCause).toBe('gmail_revoked');
    expect(c.retryable).toBe(false);
  });
});
