import { config as loadDotenv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Reads and validates process configuration once, at startup.
 *
 * The `.env` file is resolved relative to the backend package rather than to
 * `process.cwd()`: MCP clients launch the server from an arbitrary working
 * directory, so a cwd-relative lookup would silently find nothing.
 *
 * Real environment variables always win — dotenv does not override them — so
 * the `env` block in a Claude Desktop / Cursor config takes precedence.
 */

// lib/server/env.ts is two levels below the project root.
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Next.js loads these itself; this is for the MCP server, which is launched by
// an MCP client from an arbitrary working directory and gets no such help.
// dotenv never overrides a real environment variable, so on Vercel — where
// neither file exists and DATABASE_URL is injected — these calls are no-ops.
loadDotenv({ path: resolve(projectRoot, '.env.local'), quiet: true });
loadDotenv({ path: resolve(projectRoot, '.env'), quiet: true });

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Set it in ${resolve(projectRoot, '.env.local')} (copy .env.example), or pass it in the ` +
        `"env" block of your MCP client config. ` +
        `Format: postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public`,
    );
  }
  return value;
}

export const env = {
  databaseUrl: required('DATABASE_URL'),
  port: Number.parseInt(process.env.PORT ?? '4000', 10),
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  /**
   * Optional. Natural-language search is the only feature that needs it; the
   * MCP tools, the REST API and the dashboard all work without a key.
   */
  anthropicApiKey: process.env.ANTHROPIC_API_KEY?.trim() || undefined,
  groqApiKey: process.env.GROQ_API_KEY?.trim() || undefined,
  /** 'anthropic' | 'groq'. Unset means: use whichever key is present, Groq first. */
  askProvider: process.env.ASK_PROVIDER?.trim().toLowerCase() || undefined,
  /** Overrides the per-provider default model. */
  askModel: process.env.ASK_MODEL?.trim() || undefined,
} as const;
