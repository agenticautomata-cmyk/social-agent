import { randomUUID } from 'node:crypto';
import type { Context } from 'hono';

export type StructuredApiError = {
  ok: false;
  error: {
    code: string;
    message: string;
    requestId: string;
  };
};

export function requestIdFromContext(c: Context): string {
  const existing = c.get('requestId');
  if (typeof existing === 'string' && existing) return existing;
  const id = randomUUID();
  c.set('requestId', id);
  return id;
}

export function structuredError(
  c: Context,
  code: string,
  message: string,
  status: number,
): Response {
  const body: StructuredApiError = {
    ok: false,
    error: {
      code,
      message,
      requestId: requestIdFromContext(c),
    },
  };
  return c.json(body, status);
}
