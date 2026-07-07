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

/** Vision / OpenAI routes — hit API host directly to avoid dashboard proxy timeouts. */
export function clientApiLongRunningUrl(path: string): string {
  const normalized = path.startsWith('/api/') ? path : `/api/${path.replace(/^\//, '')}`;
  if (typeof window !== 'undefined') {
    const base = process.env.NEXT_PUBLIC_API_URL ?? '';
    if (base.startsWith('http')) {
      return `${base.replace(/\/$/, '')}${normalized}`;
    }
  }
  return clientApiUrl(path);
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
