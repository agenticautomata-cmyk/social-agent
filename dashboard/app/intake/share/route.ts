import { NextResponse } from 'next/server';

const API = process.env.BENSON_INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function POST(request: Request) {
  const form = await request.formData();
  const forward = new FormData();

  for (const [key, value] of form.entries()) {
    forward.append(key, value);
  }
  forward.set('submittedBy', 'pwa-share');
  if (!forward.has('submittedBy')) {
    forward.append('submittedBy', 'pwa-share');
  }

  const res = await fetch(`${API}/api/intake/share`, {
    method: 'POST',
    body: forward,
  });

  const body = await res.json().catch(() => ({}));
  const intakeId = typeof body.intakeId === 'string' ? body.intakeId : null;

  if (intakeId) {
    return NextResponse.redirect(new URL(`/intake?shared=${intakeId}`, request.url), 303);
  }

  return NextResponse.redirect(new URL('/intake?shared=1', request.url), 303);
}
