import OpenAI from 'openai';
import { classifyError, computeNextRetryAt, isRetryableHttpStatus } from './provider-errors.js';
import { logStructured } from './structured-log.js';

export type OpenAiRetryOptions = {
  maxAttempts?: number;
  label?: string;
  baseDelayMs?: number;
  maxDelayMs?: number;
};

const DEFAULT_ATTEMPTS = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function openAiHttpStatus(error: unknown): number | undefined {
  if (error instanceof OpenAI.APIError) return error.status;
  return classifyError(error, 'openai').httpStatus;
}

function shouldRetry(error: unknown, attempt: number, maxAttempts: number): boolean {
  if (attempt >= maxAttempts) return false;
  const classified = classifyError(error, 'openai');
  if (!classified.retryable) return false;
  const status = openAiHttpStatus(error);
  if (status != null && !isRetryableHttpStatus(status) && classified.rootCause !== 'openai_timeout') {
    return false;
  }
  return true;
}

/**
 * Bounded retry with exponential backoff for transient OpenAI failures.
 */
export async function withOpenAiRetry<T>(
  fn: () => Promise<T>,
  opts: OpenAiRetryOptions = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_ATTEMPTS;
  const label = opts.label ?? 'openai';
  const baseDelayMs = opts.baseDelayMs ?? 2000;
  const maxDelayMs = opts.maxDelayMs ?? 60_000;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!shouldRetry(err, attempt, maxAttempts)) throw err;

      const classified = classifyError(err, 'openai');
      const delayMs = computeNextRetryAt(attempt, baseDelayMs, maxDelayMs).getTime() - Date.now();
      logStructured({
        level: 'warn',
        service: label,
        message: 'transient OpenAI failure — retry scheduled',
        providerRequestId: classified.requestId,
        errorClassification: classified.rootCause,
        retryAttempt: attempt,
        maxAttempts,
        delayMs,
        httpStatus: classified.httpStatus,
        resolutionStatus: attempt < maxAttempts ? 'retrying' : 'failed',
      });
      await sleep(delayMs);
    }
  }

  throw lastError;
}
