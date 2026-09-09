import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dashboardDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(dashboardDir, '..');

/**
 * Load KEY=VAL lines into process.env without overriding existing values.
 * Monorepo flags (ENABLE_OPPORTUNITIES_UI, etc.) live in the repo-root `.env`.
 * Next only auto-loads `dashboard/.env*`, so without this, `next build` inlines
 * `?? 'false'` for NEXT_PUBLIC mirrors and statically prerenders gated routes as 404
 * even when the runtime process later has ENABLE_OPPORTUNITIES_UI=true.
 */
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.join(repoRoot, '.env'));
loadEnvFile(path.join(repoRoot, '.env.local'));
loadEnvFile(path.join(dashboardDir, '.env'));
loadEnvFile(path.join(dashboardDir, '.env.local'));

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@social-agent/core'],
  reactStrictMode: true,
  // `@social-agent/core` is consumed as TypeScript source and writes ESM-style
  // relative imports ending in `.js`, which is what those files resolve to once
  // compiled. Webpack takes the specifier literally, so any core module the dashboard
  // pulls in could not have a relative import at all — the moment one gained a
  // sibling import the production build failed on a file that plainly exists.
  // Teaching webpack the same mapping tsc uses fixes it for every core module.
  webpack(config) {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    };
    return config;
  },
  outputFileTracingRoot: path.join(dashboardDir, '..'),
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
