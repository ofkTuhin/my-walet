import { prisma } from './prisma';
import { log } from './logger';

/**
 * Resolves the caller to a local `User.id`, which every service function needs
 * as its first argument.
 *
 * Clerk owns identity; the database only ever sees the local id. That keeps the
 * auth vendor out of the schema and makes swapping providers a one-file change.
 */

export class UnauthorizedError extends Error {
  constructor(message = 'Sign in to continue.') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/** The account the pre-tenancy rows were backfilled onto. */
const BOOTSTRAP_CLERK_ID = 'bootstrap';

function clerkConfigured(): boolean {
  return Boolean(process.env['CLERK_SECRET_KEY']?.trim());
}

/**
 * Finds or creates the local row for a Clerk user. Provisioning on first sight
 * avoids needing a webhook: the row appears the first time someone calls the
 * API after signing up.
 */
export async function resolveUserByClerkId(
  clerkId: string,
  profile?: { email?: string | null; name?: string | null },
): Promise<string> {
  const user = await prisma.user.upsert({
    where: { clerkId },
    update: {
      ...(profile?.email !== undefined && { email: profile.email }),
      ...(profile?.name !== undefined && { name: profile.name }),
    },
    create: {
      clerkId,
      email: profile?.email ?? null,
      name: profile?.name ?? null,
    },
  });
  return user.id;
}

/**
 * Resolves an account **without Clerk**, for processes that have no HTTP
 * request to authenticate — currently the stdio MCP server.
 *
 * `@clerk/nextjs/server` cannot be imported outside Next.js (it throws
 * "This module cannot be imported from a Client Component module"), so this
 * path must never touch it.
 *
 * Set `WALLET_USER_ID` to bind the process to a specific account; otherwise it
 * falls back to the bootstrap account the tenancy migration created.
 */
export async function resolveStandaloneUserId(): Promise<string> {
  const explicit = process.env['WALLET_USER_ID']?.trim();
  if (explicit) return explicit;

  const bootstrap = await prisma.user.findUnique({ where: { clerkId: BOOTSTRAP_CLERK_ID } });
  if (bootstrap) return bootstrap.id;

  log.warn('No bootstrap user found; creating one. Set WALLET_USER_ID to bind a real account.');
  return resolveUserByClerkId(BOOTSTRAP_CLERK_ID, { name: 'Bootstrap account' });
}

/**
 * The single-tenant escape hatch for local web development, so the dashboard
 * runs before Clerk keys exist.
 *
 * Fails closed in production: without this guard, a missing CLERK_SECRET_KEY in
 * a deployed environment would silently serve one shared wallet to everybody.
 */
async function developmentFallbackUserId(): Promise<string> {
  if (process.env.NODE_ENV === 'production') {
    throw new UnauthorizedError(
      'Authentication is not configured. Set CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY.',
    );
  }
  return resolveStandaloneUserId();
}

/**
 * The id to scope every query by, for **HTTP request handlers only**. Throws
 * `UnauthorizedError` when there is no signed-in user, which `toErrorResponse`
 * maps to 401. Standalone processes use `resolveStandaloneUserId` instead.
 */
export async function requireUserId(): Promise<string> {
  if (!clerkConfigured()) return developmentFallbackUserId();

  // Imported lazily so the app still boots — and the MCP server still runs —
  // when @clerk/nextjs is absent or unconfigured.
  const { auth } = await import('@clerk/nextjs/server');
  const { userId: clerkId } = await auth();
  if (!clerkId) throw new UnauthorizedError();

  return resolveUserByClerkId(clerkId);
}
