import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from './env';
import { log } from './logger';

/**
 * Single shared PrismaClient.
 *
 * Two things here are load-bearing:
 *
 * 1. Prisma 7 requires an explicit driver adapter — the client no longer opens
 *    a connection from DATABASE_URL by itself, so the `pg` pool is wired here.
 *
 * 2. Logging is emitted as *events* and forwarded to stderr. Prisma's shorthand
 *    (`log: ['warn', 'error']`) prints straight to stdout, which would corrupt
 *    the MCP JSON-RPC stream that StdioServerTransport owns.
 */
function createClient() {
  const adapter = new PrismaPg({ connectionString: env.databaseUrl });

  const client = new PrismaClient({
    adapter,
    log: [
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
    ],
  });

  client.$on('warn', (event) => log.warn(event.message));
  client.$on('error', (event) => log.error(event.message));

  return client;
}

/** Cached across `tsx watch` reloads so hot restarts reuse one connection pool. */
const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
