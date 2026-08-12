import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import {
  controlTowerDeniedEnvelope,
  evaluateControlTowerAccess,
  isAllowedControlTowerProxyPath,
} from '../../../../lib/control-tower-auth.server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function upstreamBase(): string {
  return (
    process.env.BENSON_INTERNAL_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    'http://127.0.0.1:4000'
  ).replace(/\/$/, '');
}

async function proxyControlTower(req: NextRequest, pathParts: string[]) {
  const requestId = randomUUID();
  const access = evaluateControlTowerAccess(req.headers);

  if (!access.authorized) {
    const envelope = controlTowerDeniedEnvelope(access.reason, requestId);
    return NextResponse.json(envelope, { status: access.reason === 'unauthenticated' ? 401 : 403 });
  }

  if (!isAllowedControlTowerProxyPath(req.method, pathParts)) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'CONTROL_TOWER_ROUTE_FORBIDDEN',
          message: 'That Control Tower route is not available through this proxy.',
          requestId,
        },
      },
      { status: 403 },
    );
  }

  const adminKey = process.env.BENSON_CONTROL_TOWER_KEY?.trim();
  if (!adminKey) {
    return NextResponse.json(controlTowerDeniedEnvelope('admin_not_configured', requestId), {
      status: 403,
    });
  }

  const suffix = pathParts.join('/');
  const url = new URL(req.url);
  const target = `${upstreamBase()}/api/control-tower/${suffix}${url.search}`;

  const headers = new Headers();
  const contentType = req.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  headers.set('x-benson-admin-key', adminKey);
  headers.set('accept', 'application/json');
  headers.set('x-benson-request-id', requestId);

  const init: RequestInit = {
    method: req.method,
    headers,
    cache: 'no-store',
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.text();
  }

  const upstream = await fetch(target, init);
  const body = await upstream.text();

  if (body.includes(adminKey)) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'UPSTREAM_LEAK_BLOCKED',
          message: 'Control Tower response was blocked for safety.',
          requestId,
        },
      },
      { status: 502 },
    );
  }

  return new NextResponse(body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
      'x-benson-request-id': requestId,
    },
  });
}

type Ctx = { params: Promise<{ path?: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { path = [] } = await ctx.params;
  return proxyControlTower(req, path);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Control Tower mutations are not exposed through this proxy.',
        requestId: randomUUID(),
      },
    },
    { status: 405 },
  );
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  return POST(req, ctx);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  return POST(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return POST(req, ctx);
}
