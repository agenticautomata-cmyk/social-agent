/**
 * Browser client fetches should use same-origin /api/* so Next rewrites proxy
 * to the Hono API (works through Cloudflare Access on the dashboard host).
 * Server components can use NEXT_PUBLIC_API_URL / BENSON_INTERNAL_API_URL.
 */
export function clientApiOrigin(): string {
  if (typeof window !== 'undefined') return '';
  return (
    process.env.BENSON_INTERNAL_API_URL
    ?? process.env.NEXT_PUBLIC_API_URL
    ?? 'http://127.0.0.1:4000'
  ).replace(/\/$/, '');
}

export function clientApiUrl(path: string): string {
  const normalized = path.startsWith('/api/') ? path : `/api/${path.replace(/^\//, '')}`;
  if (typeof window !== 'undefined') return normalized;
  return `${clientApiOrigin()}${normalized}`;
}

function directApiBase(): string | null {
  if (typeof window === 'undefined') {
    const base = process.env.NEXT_PUBLIC_API_URL ?? process.env.BENSON_INTERNAL_API_URL ?? '';
    return base.startsWith('http') ? base.replace(/\/$/, '') : 'http://127.0.0.1:4000';
  }
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return 'http://127.0.0.1:4000';
  }
  const base = process.env.NEXT_PUBLIC_API_URL ?? '';
  if (!base.startsWith('http')) return null;
  try {
    const parsed = new URL(base);
    // Never bypass the dashboard proxy to localhost from a phone/tablet PWA.
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return null;
    }
  } catch {
    return null;
  }
  return base.replace(/\/$/, '');
}

const PRODUCTION_DASHBOARD_HOST = 'benson.kckellie.com';
const PRODUCTION_API_ORIGIN = 'https://api.kckellie.com';

function isPrivateLanHost(host: string): boolean {
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    /^192\.168\.\d+\.\d+$/.test(host) ||
    /^10\.\d+\.\d+\.\d+$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host)
  );
}

/** Resolve API origin for browser long-running calls (Ask Benson, uploads). */
export function resolveBrowserApiOrigin(): string | null {
  if (typeof window === 'undefined') return null;

  const host = window.location.hostname;

  // Production PWA: bypass dashboard proxy (Cloudflare/mobile timeouts on chained hops).
  if (host === PRODUCTION_DASHBOARD_HOST || host.endsWith('.kckellie.com')) {
    return PRODUCTION_API_ORIGIN;
  }

  if (host === 'localhost' || host === '127.0.0.1') {
    return 'http://127.0.0.1:4000';
  }

  if (isPrivateLanHost(host)) {
    return `http://${host}:4000`;
  }

  return directApiBase();
}

/** Ask Benson + vision — hit API host directly when possible. */
export function clientApiLongRunningUrl(path: string): string {
  const normalized = path.startsWith('/api/') ? path : `/api/${path.replace(/^\//, '')}`;
  const base = resolveBrowserApiOrigin();
  if (base) return `${base}${normalized}`;
  return clientApiUrl(path);
}

/** Instagram / link intake can run 2–4 minutes — always prefer direct API on phone. */
export function clientApiAskBensonUrl(path: string): string {
  return clientApiLongRunningUrl(path);
}

/** Large multipart uploads (video/audio) — bypass Next.js proxy body/timeout limits. */
export function clientApiUploadUrl(path: string): string {
  return clientApiLongRunningUrl(path);
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type ApiJsonResult<T> =
  | { ok: true; data: T; response: Response }
  | { ok: false; error: string; status: number; response: Response };

/** Safe JSON parse for dashboard fetches — never throws on HTML/plain-text error bodies. */
export async function parseApiJsonResponse<T = Record<string, unknown>>(
  response: Response,
): Promise<ApiJsonResult<T>> {
  const contentType = response.headers.get('content-type') ?? '';
  const raw = await response.text();
  const looksJson = contentType.includes('json') || raw.trimStart().startsWith('{');

  if (!looksJson) {
    const snippet = raw.trim().slice(0, 80).replace(/\s+/g, ' ');
    return {
      ok: false,
      error: response.ok
        ? 'Unexpected server response'
        : snippet.startsWith('Internal Server Error')
          ? 'Benson is temporarily unavailable. Please try again.'
          : snippet || `Request failed (${response.status})`,
      status: response.status,
      response,
    };
  }

  try {
    const data = JSON.parse(raw) as T;
    if (!response.ok) {
      const errField = (data as { error?: unknown }).error;
      const message =
        typeof errField === 'string'
          ? errField
          : errField && typeof errField === 'object' && 'message' in errField
            ? String((errField as { message?: string }).message ?? 'Request failed')
            : `Request failed (${response.status})`;
      return { ok: false, error: message, status: response.status, response };
    }
    return { ok: true, data, response };
  } catch {
    return {
      ok: false,
      error: 'Failed to parse Benson response',
      status: response.status,
      response,
    };
  }
}
