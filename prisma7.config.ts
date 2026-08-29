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
 * Neon names the two endpoints identically apart from a "-pooler" suffix on the
 * host, so the direct URL is derivable rather than something a deploy has to be
 * told. DIRECT_URL still wins when set, for a provider that does not follow
 * that convention.
 */
/** True only when the *host* is a pooler endpoint — see withoutPooler. */
function hostUsesPooler(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname.includes('-pooler');
  } catch {
    // Unparseable: fall back to the whole string rather than waving it through.
    return url.includes('-pooler');
  }
}

function withoutPooler(url: string): string {
  try {
    const parsed = new URL(url);
    // Only the hostname: a password may legitimately contain "-pooler", and a
    // blind string replace would silently corrupt the credentials.
    parsed.hostname = parsed.hostname.replace('-pooler', '');
    return parsed.toString();
  } catch {
    // Not a parseable URL. Leave it alone and let the guard below speak up.
    return url;
  }
}

// Only migration commands need a direct connection. `prisma generate` reads
// nothing from the database, and this config is loaded for every CLI command —
// rewriting unconditionally would point the app at the unpooled host too.
const isMigrationCommand = process.argv.some(
  (arg) => arg === 'migrate' || arg === 'db' || arg === 'migrate-deploy',
);

const configuredUrl = process.env['DIRECT_URL'] || process.env['DATABASE_URL'];

let migrationUrl = configuredUrl;
if (isMigrationCommand && configuredUrl) {
  migrationUrl = withoutPooler(configuredUrl);
  if (migrationUrl !== configuredUrl) {
    // Visible in the build log, so a failure against the direct host is not
    // mistaken for a failure against the one that was configured.
    console.warn(
      '[prisma] Migrating over the direct endpoint: dropped "-pooler" from the ' +
        'host. Set DIRECT_URL to override.',
    );
  }
}

// Belt and braces: if the host still says pooler, fail with the explanation
// rather than letting the schema engine report the unhelpful invariant error.
if (isMigrationCommand && hostUsesPooler(migrationUrl)) {
  throw new Error(
    'Refusing to run migrations through a connection pooler.\n\n' +
      'The URL still contains "-pooler" after rewriting the host, which makes\n' +
      'the schema engine fail with "migration persistence is not initialized".\n\n' +
      'Set DIRECT_URL to the unpooled connection string.\n' +
      'On Vercel: Settings -> Environment Variables -> add DIRECT_URL.',
  );
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: { url: migrationUrl },
});
