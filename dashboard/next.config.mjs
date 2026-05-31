/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@social-agent/core'],
  reactStrictMode: true,
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
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: 'storage.googleapis.com' },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
