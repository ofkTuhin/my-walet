#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';

import { resolveStandaloneUserId } from '../lib/server/current-user';
import { log } from '../lib/server/logger';
import { callWalletTool, TOOLS } from '../lib/server/mcp-handlers';
import { prisma } from '../lib/server/prisma';

/**
 * MCP server for the Personal Wallet, speaking JSON-RPC over stdio.
 *
 * This is the **local development** entry point. stdio carries no credentials,
 * so it binds to a single account for the whole process — either WALLET_USER_ID
 * or the local bootstrap user. Hosted, multi-tenant access goes through the
 * HTTP route instead, where each request authenticates its own caller.
 *
 * IMPORTANT: stdout belongs to the transport. All logging goes to stderr via
 * `log` — a single console.log here would corrupt the protocol stream.
 */

const server = new Server(
  { name: 'wallet-mcp-server', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

/** Resolved once at startup: the account this process acts on behalf of. */
let boundUserId: string | null = null;

async function currentUserId(): Promise<string> {
  if (boundUserId) return boundUserId;
  boundUserId = await resolveStandaloneUserId();
  return boundUserId;
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
  const { name, arguments: rawArgs } = request.params;
  return callWalletTool(await currentUserId(), name, rawArgs);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info('Wallet MCP server connected over stdio.');
}

/** Closes the Prisma pool so the process does not hang on exit. */
async function shutdown(signal: string) {
  log.info(`Received ${signal}, shutting down.`);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

main().catch(async (error) => {
  log.error('Fatal error starting server:', error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
