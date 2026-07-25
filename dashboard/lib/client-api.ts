/**
 * Browser client fetches should use same-origin /api/* so Next rewrites proxy
 * to the Hono API (works through Cloudflare Access on the dashboard host).
 * Server components can use NEXT_PUBLIC_API_URL directly.
 */
export function clientApiUrl(path: string): string {
  const normalized = path.startsWith('/api/') ? path : `/api/${path.replace(/^\//, '')}`;
  if (typeof window !== 'undefined') return normalized;
  return `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}${normalized}`;
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
  return base.startsWith('http') ? base.replace(/\/$/, '') : null;
}

/** Vision / OpenAI routes — hit API host directly to avoid dashboard proxy timeouts. */
export function clientApiLongRunningUrl(path: string): string {
  const normalized = path.startsWith('/api/') ? path : `/api/${path.replace(/^\//, '')}`;
  const base = directApiBase();
  if (base) return `${base}${normalized}`;
  return clientApiUrl(path);
}

/** Large multipart uploads (video/audio) — bypass Next.js proxy body/timeout limits. */
export function clientApiUploadUrl(path: string): string {
  return clientApiLongRunningUrl(path);
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
