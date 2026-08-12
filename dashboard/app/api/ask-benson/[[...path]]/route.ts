import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** Instagram carousel intake (Playwright + OCR) can exceed 3 minutes. */
export const maxDuration = 600;

function upstreamBase(): string {
  return (
    process.env.BENSON_INTERNAL_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    'http://127.0.0.1:4000'
  ).replace(/\/$/, '');
}

async function proxyAskBenson(req: NextRequest, pathParts: string[]) {
  const suffix = pathParts.join('/');
  const url = new URL(req.url);
  const target = `${upstreamBase()}/api/ask-benson${suffix ? `/${suffix}` : ''}${url.search}`;

  const headers = new Headers();
  const contentType = req.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  headers.set('accept', req.headers.get('accept') ?? 'application/json');

  const init: RequestInit = {
    method: req.method,
    headers,
    cache: 'no-store',
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = contentType?.includes('multipart/form-data')
      ? await req.arrayBuffer()
      : await req.text();
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'upstream_unavailable';
    return NextResponse.json(
      { ok: false, error: message.includes('ECONNREFUSED') ? 'Benson API is restarting — try again in a moment.' : 'Failed to reach Benson API.' },
      { status: 502 },
    );
  }

  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
    },
  });
}

type Ctx = { params: Promise<{ path?: string[] }> };

async function handle(req: NextRequest, ctx: Ctx) {
  const { path = [] } = await ctx.params;
  return proxyAskBenson(req, path);
}

export async function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, ctx);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return handle(req, ctx);
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  return handle(req, ctx);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return handle(req, ctx);
}
