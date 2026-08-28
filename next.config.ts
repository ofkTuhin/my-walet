import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Prisma ships a native query engine that must not be bundled by webpack;
  // leaving it external keeps the engine binary in the serverless output.
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-pg'],
  reactStrictMode: true,
};

export default nextConfig;
