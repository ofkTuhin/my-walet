import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Prisma ships a native query engine that must not be bundled by webpack;
  // leaving it external keeps the engine binary in the serverless output.
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-pg'],
  reactStrictMode: true,

  async headers() {
    return [
      {
        // A service worker that is itself cached is very hard to replace: the
        // browser would keep running an old copy that decides what everything
        // else gets. It must always be revalidated.
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Clerk needs to open its own frames, so this is SAMEORIGIN rather
          // than DENY — still blocking third-party framing.
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ];
  },
};

export default nextConfig;
