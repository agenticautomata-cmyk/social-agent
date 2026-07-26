/**
 * Classify provider/worker failures and sanitize messages for Kellie-facing UI.
 * Full diagnostics (request IDs, raw JSON) stay server-side in logs.
 */

export type ProviderRootCause =
  | 'openai_transient'
  | 'openai_rate_limit'
  | 'openai_auth'
  | 'openai_context_limit'
  | 'openai_parse'
  | 'openai_malformed'
  | 'openai_timeout'
  | 'openai_unknown'
  | 'gmail_disconnected'
  | 'gmail_expired'
  | 'gmail_revoked'
  | 'gmail_transient'
  | 'gmail_unknown'
  | 'unknown';

export type ClassifiedError = {
  rootCause: ProviderRootCause;
  httpStatus?: number;
  retryable: boolean;
  rawMessage: string;
  logMessage: string;
  uiMessage: string;
  requestId?: string;
};

const OPENAI_REQUEST_ID_RE = /\breq_[a-zA-Z0-9]+\b/g;
const OPENAI_HTTP_RE = /\b(?:OpenAI|openai)[^\d]*(\d{3})\b/i;
const GENERIC_HTTP_RE = /\b(?:HTTP|status)\s*[:=]?\s*(\d{3})\b/i;

function stripRequestIds(text: string): string {
  return text.replace(OPENAI_REQUEST_ID_RE, '[request-id]').trim();
}

function extractHttpStatus(text: string): number | undefined {
  const m = text.match(OPENAI_HTTP_RE) ?? text.match(GENERIC_HTTP_RE);
  if (!m) return undefined;
  const code = parseInt(m[1]!, 10);
  return Number.isFinite(code) ? code : undefined;
}

function extractRequestId(text: string): string | undefined {
  const m = text.match(OPENAI_REQUEST_ID_RE);
  return m?.[0];
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isTimeoutMessage(text: string): boolean {
  return /\b(timeout|timed out|ETIMEDOUT|ESOCKETTIMEDOUT|AbortError)\b/i.test(text);
}

function isParseMessage(text: string): boolean {
  return /\b(JSON\.parse|Unexpected token|ZodError|parse|empty (?:progress brief|learning synthesis))\b/i.test(
    text,
  );
}

function isContextLimitMessage(text: string): boolean {
  return /\b(context length|maximum context|token limit|too many tokens|max_tokens)\b/i.test(text);
}

function isAuthMessage(text: string): boolean {
  return /\b(unauthorized|invalid api key|authentication|401|403|permission denied)\b/i.test(text);
}

function isMalformedMessage(text: string): boolean {
  return /\b(invalid_request|bad request|400|malformed|validation)\b/i.test(text);
}

export function classifyError(error: unknown, context?: 'openai' | 'gmail'): ClassifiedError {
  const rawMessage = errorMessage(error);
  const httpStatus =
    (error as { status?: number })?.status ??
    extractHttpStatus(rawMessage);
  const requestId = extractRequestId(rawMessage);
  const logMessage = requestId ? `${rawMessage}` : rawMessage;

  if (context === 'gmail' || /\bgmail\b/i.test(rawMessage)) {
    return classifyGmailError(rawMessage, httpStatus, logMessage, requestId);
  }

  if (isTimeoutMessage(rawMessage)) {
    return {
      rootCause: 'openai_timeout',
      httpStatus,
      retryable: true,
      rawMessage,
      logMessage,
      uiMessage: 'Benson Learning could not refresh.',
      requestId,
    };
  }

  if (isContextLimitMessage(rawMessage)) {
    return {
      rootCause: 'openai_context_limit',
      httpStatus,
      retryable: false,
      rawMessage,
      logMessage,
      uiMessage: 'Benson Learning could not refresh.',
      requestId,
    };
  }

  if (isParseMessage(rawMessage)) {
    return {
      rootCause: 'openai_parse',
      httpStatus,
      retryable: false,
      rawMessage,
      logMessage,
      uiMessage: 'Benson Learning could not refresh.',
      requestId,
    };
  }

  if (isAuthMessage(rawMessage)) {
    return {
      rootCause: 'openai_auth',
      httpStatus: httpStatus ?? 401,
      retryable: false,
      rawMessage,
      logMessage,
      uiMessage: 'Benson Learning could not refresh.',
      requestId,
    };
  }

  if (isMalformedMessage(rawMessage)) {
    return {
      rootCause: 'openai_malformed',
      httpStatus: httpStatus ?? 400,
      retryable: false,
      rawMessage,
      logMessage,
      uiMessage: 'Benson Learning could not refresh.',
      requestId,
    };
  }

  if (httpStatus === 429) {
    return {
      rootCause: 'openai_rate_limit',
      httpStatus,
      retryable: true,
      rawMessage,
      logMessage,
      uiMessage: 'Benson Learning could not refresh.',
      requestId,
    };
  }

  if (httpStatus != null && [500, 502, 503, 504].includes(httpStatus)) {
    return {
      rootCause: 'openai_transient',
      httpStatus,
      retryable: true,
      rawMessage,
      logMessage,
      uiMessage: 'Benson Learning could not refresh.',
      requestId,
    };
  }

  return {
    rootCause: 'openai_unknown',
    httpStatus,
    retryable: false,
    rawMessage,
    logMessage,
    uiMessage: 'Benson Learning could not refresh.',
    requestId,
  };
}

export function classifyGmailError(
  rawMessage: string,
  httpStatus?: number,
  logMessage = rawMessage,
  requestId?: string,
): ClassifiedError {
  const lower = rawMessage.toLowerCase();

  if (/not connected|disconnected|credentials_missing|no refresh token/i.test(lower)) {
    return {
      rootCause: 'gmail_disconnected',
      httpStatus,
      retryable: false,
      rawMessage,
      logMessage,
      uiMessage: 'Gmail is disconnected — reconnect in Email settings.',
      requestId,
    };
  }

  if (/invalid_grant|revoked|account has been deleted|token has been expired or revoked/i.test(lower)) {
    return {
      rootCause: 'gmail_revoked',
      httpStatus,
      retryable: false,
      rawMessage,
      logMessage,
      uiMessage: 'Gmail access was revoked — reconnect in Email settings.',
      requestId,
    };
  }

  if (/expired|invalid credentials/i.test(lower)) {
    return {
      rootCause: 'gmail_expired',
      httpStatus,
      retryable: false,
      rawMessage,
      logMessage,
      uiMessage: 'Gmail session expired — reconnect in Email settings.',
      requestId,
    };
  }

  if (
    (httpStatus != null && [429, 500, 502, 503, 504].includes(httpStatus)) ||
    isTimeoutMessage(rawMessage) ||
    /\b(ECONNRESET|ENOTFOUND|fetch failed|temporarily unavailable)\b/i.test(lower)
  ) {
    return {
      rootCause: 'gmail_transient',
      httpStatus,
      retryable: true,
      rawMessage,
      logMessage,
      uiMessage: 'Gmail sync is temporarily unavailable — Benson will retry.',
      requestId,
    };
  }

  return {
    rootCause: 'gmail_unknown',
    httpStatus,
    retryable: false,
    rawMessage,
    logMessage,
    uiMessage: 'Gmail sync needs attention — check Email settings.',
    requestId,
  };
}

export function sanitizeErrorForUi(
  error: unknown,
  context: 'learning' | 'pulse' | 'worker' | 'gmail' = 'worker',
): string {
  const classified = classifyError(error, context === 'gmail' ? 'gmail' : context === 'learning' || context === 'pulse' ? 'openai' : undefined);

  if (context === 'pulse') {
    return 'Benson Pulse could not refresh.';
  }
  if (context === 'learning') {
    return 'Benson Learning could not refresh.';
  }
  if (context === 'gmail') {
    return classified.uiMessage;
  }

  return stripRequestIds(classified.uiMessage);
}

export function normalizeWorkerErrorSummary(raw: string): {
  rootCause: ProviderRootCause;
  uiSummary: string;
  logSummary: string;
  retryable: boolean;
} {
  const classified = classifyError(raw);
  const uiSummary =
    classified.rootCause.startsWith('gmail_')
      ? classified.uiMessage
      : classified.rootCause.startsWith('openai_')
        ? classified.uiMessage
        : stripRequestIds(raw).slice(0, 200) || 'Worker run failed.';
  return {
    rootCause: classified.rootCause,
    uiSummary,
    logSummary: classified.logMessage.slice(0, 500),
    retryable: classified.retryable,
  };
}

export function computeNextRetryAt(
  attempt: number,
  baseMs = 2000,
  maxMs = 60_000,
): Date {
  const delay = Math.min(baseMs * 2 ** Math.max(0, attempt - 1), maxMs);
  return new Date(Date.now() + delay);
}

export function isRetryableHttpStatus(status: number | undefined): boolean {
  return status != null && [429, 500, 502, 503, 504].includes(status);
}
