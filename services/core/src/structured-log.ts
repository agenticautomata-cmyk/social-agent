import { classifyError, type ProviderRootCause } from './provider-errors.js';

export type StructuredLogLevel = 'info' | 'warn' | 'error';

export type StructuredLogEvent = {
  level: StructuredLogLevel;
  service: string;
  message: string;
  timestamp?: string;
  workerId?: string;
  jobId?: string;
  requestId?: string;
  providerRequestId?: string;
  errorClassification?: ProviderRootCause | string;
  retryAttempt?: number;
  resolutionStatus?: string;
  [key: string]: unknown;
};

const SECRET_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._\-+/=]{8,}\b/gi,
  /\bauthorization:\s*[^\s,]+/gi,
  /\brefresh_token=[^&\s]+/gi,
  /\baccess_token=[^&\s]+/gi,
  /\bclient_secret=[^&\s]+/gi,
  /\bsk-[A-Za-z0-9]{10,}\b/g,
  /\bAIza[0-9A-Za-z\-_]{10,}\b/g,
  /\b(?:code|token)=[0-9a-f]{16,}\b/gi,
];

const EMAIL_BODY_HINT = /\b(body|html|snippet|rawPayload|messageBody)\b/i;

function redactString(value: string): string {
  let out = value;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]');
  }
  return out;
}

function sanitizeValue(key: string, value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string') {
    if (EMAIL_BODY_HINT.test(key) && value.length > 200) {
      return `[REDACTED:${value.length} chars]`;
    }
    return redactString(value);
  }
  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      return value.map((item, index) => sanitizeValue(`${key}[${index}]`, item));
    }
    const obj = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      next[k] = sanitizeValue(k, v);
    }
    return next;
  }
  return value;
}

export function sanitizeStructuredLogEvent(event: StructuredLogEvent): StructuredLogEvent {
  const sanitized: StructuredLogEvent = {
    ...event,
    timestamp: event.timestamp ?? new Date().toISOString(),
    message: redactString(event.message),
  };
  for (const [key, value] of Object.entries(event)) {
    if (key === 'level' || key === 'service' || key === 'message' || key === 'timestamp') continue;
    sanitized[key] = sanitizeValue(key, value);
  }
  return sanitized;
}

export function logStructured(event: StructuredLogEvent): void {
  const payload = sanitizeStructuredLogEvent(event);
  const line = JSON.stringify(payload);
  if (payload.level === 'error') {
    console.error(line);
  } else if (payload.level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function logProviderFailure(input: {
  service: string;
  message: string;
  error: unknown;
  workerId?: string;
  jobId?: string;
  requestId?: string;
  retryAttempt?: number;
  resolutionStatus?: string;
}): void {
  const classified = classifyError(input.error);
  logStructured({
    level: 'error',
    service: input.service,
    message: input.message,
    workerId: input.workerId,
    jobId: input.jobId,
    requestId: input.requestId,
    providerRequestId: classified.requestId,
    errorClassification: classified.rootCause,
    retryAttempt: input.retryAttempt,
    resolutionStatus: input.resolutionStatus ?? 'failed',
    httpStatus: classified.httpStatus,
  });
}
