import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// The Prisma CLI does not read .env.local, and that is where Next.js keeps
// local secrets — load it first so `prisma migrate` and the seed find the URL.
loadDotenv({ path: '.env.local', quiet: true });
loadDotenv({ quiet: true });

/**
 * Migrations must not go through a connection pooler — PgBouncer in transaction
 * mode cannot run the advisory locks and DDL a migration needs. On Neon, set
 * DIRECT_URL to the unpooled string (no "-pooler" in the host) and leave
 * DATABASE_URL as the pooled one the app runs on.
 */
const migrationUrl = process.env['DIRECT_URL'] || process.env['DATABASE_URL'];

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: { url: migrationUrl },
});
