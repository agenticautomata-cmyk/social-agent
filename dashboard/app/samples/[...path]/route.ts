import { NextResponse } from 'next/server';

/** Private voice reference WAVs must never be public. Always 404. */
export function GET() {
  return new NextResponse(null, { status: 404 });
}

export function HEAD() {
  return new NextResponse(null, { status: 404 });
}
