import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// The Prisma CLI does not read .env.local, and that is where Next.js keeps
// local secrets — load it first so `prisma migrate` and the seed find the URL.
loadDotenv({ path: '.env.local', quiet: true });
loadDotenv({ quiet: true });

/**
 * Migrations must not run through a connection pooler.
 *
 * Through Neon's pooler the session has no `search_path`, so the schema engine
 * cannot see `public._prisma_migrations`. It then reports every migration as
 * unapplied and fails with:
 *
 *   Invariant violation: migration persistence is not initialized
 *
 * The app's own queries are unaffected — Prisma schema-qualifies them — so this
 * only ever bites at migrate time.
 *
 * Set DIRECT_URL to the unpooled connection string (the same host without
 * "-pooler") and leave DATABASE_URL as the pooled one the app runs on.
 */
const migrationUrl = process.env['DIRECT_URL'] || process.env['DATABASE_URL'];

// Only migration commands need a direct connection. `prisma generate` reads
// nothing from the database, and this config is loaded for every CLI command —
// guarding unconditionally would break `generate`, and with it every build.
const isMigrationCommand = process.argv.some(
  (arg) => arg === 'migrate' || arg === 'db' || arg === 'migrate-deploy',
);

if (isMigrationCommand && migrationUrl?.includes('-pooler')) {
  throw new Error(
    'Refusing to run migrations through a connection pooler.\n\n' +
      'The URL contains "-pooler", which makes the schema engine fail with\n' +
      '"migration persistence is not initialized".\n\n' +
      'Set DIRECT_URL to the unpooled string — the same URL with "-pooler"\n' +
      'removed from the host — and keep DATABASE_URL pooled for the app.\n' +
      'On Vercel: Settings -> Environment Variables -> add DIRECT_URL.',
  );
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: { url: migrationUrl },
});
