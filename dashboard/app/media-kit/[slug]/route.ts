/**
 * Serves Kellie's media kit at a clean public URL on the dashboard host.
 *
 * A route handler rather than a page so the studio shell does not wrap it. The person
 * opening this link is a hotel's marketing manager who received a pitch — they should
 * see Kellie's credentials, not Benson's internal navigation.
 */

const API_BASE = process.env.API_BASE_URL ?? 'http://127.0.0.1:4000';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await context.params;
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) {
    return new Response('Not found', { status: 404 });
  }

  const upstream = await fetch(`${API_BASE}/api/public/media-kit/${slug}/view`, {
    cache: 'no-store',
  });

  if (!upstream.ok) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(await upstream.text(), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
