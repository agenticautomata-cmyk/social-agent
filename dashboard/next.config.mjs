/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@social-agent/core'],
  reactStrictMode: true,
  // Ask Benson link/image intake can take several minutes (Instagram carousel OCR).
  experimental: {
    proxyTimeout: 600_000,
  },
  // Hide Next.js dev-tools "N" badge (bottom-left) — Benson uses its own chat launcher.
  devIndicators: false,
  // Mirror server-side Benson flags for client bundles (no Node-only core/feature-flags import).
  env: {
    NEXT_PUBLIC_DISABLE_VIDEO_PIPELINE: process.env.DISABLE_VIDEO_PIPELINE ?? 'false',
    NEXT_PUBLIC_ENABLE_OPPORTUNITIES_API: process.env.ENABLE_OPPORTUNITIES_API ?? 'false',
    NEXT_PUBLIC_ENABLE_BENSON_BRANDING: process.env.ENABLE_BENSON_BRANDING ?? 'false',
    NEXT_PUBLIC_ENABLE_OPPORTUNITIES_UI: process.env.ENABLE_OPPORTUNITIES_UI ?? 'false',
    NEXT_PUBLIC_ENABLE_BENSON_TERMINOLOGY: process.env.ENABLE_BENSON_TERMINOLOGY ?? 'false',
    NEXT_PUBLIC_ENABLE_WORKER_LABEL_ALIASES: process.env.ENABLE_WORKER_LABEL_ALIASES ?? 'false',
    NEXT_PUBLIC_ENABLE_BENSON_SEED_NAMES: process.env.ENABLE_BENSON_SEED_NAMES ?? 'false',
    NEXT_PUBLIC_ENABLE_BENSON_DEMO_SCRIPT: process.env.ENABLE_BENSON_DEMO_SCRIPT ?? 'false',
    NEXT_PUBLIC_ENABLE_KC_SCANNER: process.env.ENABLE_KC_SCANNER ?? 'false',
    NEXT_PUBLIC_DEMO_MODE: process.env.DEMO_MODE ?? 'true',
    NEXT_PUBLIC_CREATOR_TIMEZONE: process.env.CREATOR_TIMEZONE ?? 'America/Chicago',
    NEXT_PUBLIC_PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL ?? 'https://kckellie.com',
    NEXT_PUBLIC_INTAKE_VIDEO_MAX_BYTES:
      process.env.INTAKE_VIDEO_MAX_BYTES ?? String(500 * 1024 * 1024),
    NEXT_PUBLIC_INTAKE_AUDIO_MAX_BYTES:
      process.env.INTAKE_AUDIO_MAX_BYTES ?? String(50 * 1024 * 1024),
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
    NEXT_PUBLIC_CONTROL_TOWER_CONFIGURED:
      process.env.BENSON_CONTROL_TOWER_KEY?.trim() && process.env.BENSON_ADMIN_EMAILS?.trim()
        ? 'true'
        : 'false',
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: 'storage.googleapis.com' },
      { protocol: 'https', hostname: 'api.kckellie.com' },
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'http', hostname: '127.0.0.1' },
    ],
  },
  async headers() {
    return [
      {
        source: '/((?!_next/static|_next/image|favicon.ico|icons/|sw.js|manifest.webmanifest).*)',
        headers: [{ key: 'Cache-Control', value: 'no-store, must-revalidate' }],
      },
    ];
  },
  async rewrites() {
    // Server-side proxy must hit local API — not the public tunnel URL (hairpin → ECONNRESET).
    const internalApi =
      process.env.BENSON_INTERNAL_API_URL ??
      (process.env.NODE_ENV === 'production' ? 'http://127.0.0.1:4000' : null) ??
      process.env.NEXT_PUBLIC_API_URL ??
      'http://localhost:4000';
    return [
      {
        // Same-origin Control Tower + Ask Benson use app/api route handlers (long timeouts, server-side keys).
        source: '/api/:path((?!control-tower(?:/|$)|ask-benson(?:/|$)).*)',
        destination: `${internalApi}/api/:path`,
      },
    ];
  },
};

export default nextConfig;
