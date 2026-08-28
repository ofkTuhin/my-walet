#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { log } from '../lib/server/logger';
import { prisma } from '../lib/server/prisma';
import { formatMoney } from '../lib/server/serialize';
import {
  addTransaction,
  deleteTransaction,
  getWalletSummary,
  searchTransactions,
  TransactionNotFoundError,
} from '../lib/server/wallet-service';
import {
  addTransactionSchema,
  deleteTransactionSchema,
  formatZodError,
  searchTransactionsSchema,
  walletSummarySchema,
} from '../lib/server/validation';
import { TOOLS } from '../lib/server/tool-schemas';

/**
 * MCP server for the Personal Wallet, speaking JSON-RPC over stdio.
 *
 * IMPORTANT: stdout belongs to the transport. All logging goes to stderr via
 * `log` — a single console.log here would corrupt the protocol stream.
 */

const server = new Server(
  { name: 'wallet-mcp-server', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

/** Wraps a payload as a tool result: a human-readable line, then the raw JSON. */
function ok(summary: string, payload: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: `${summary}\n\n${JSON.stringify(payload, null, 2)}` }],
  };
}

/**
 * Returns a failure the model can act on.
 *
 * `isError` keeps the error inside the tool result instead of failing the
 * JSON-RPC call, so the model sees what went wrong and can retry sensibly.
 */
function fail(message: string): CallToolResult {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
  const { name, arguments: rawArgs } = request.params;
  const args = rawArgs ?? {};

  try {
    switch (name) {
      case 'get_wallet_summary': {
        const input = walletSummarySchema.parse(args);
        const summary = await getWalletSummary(input);
        const headline =
          `Balance ${formatMoney(summary.balance)} — ` +
          `income ${formatMoney(summary.totalIncome)}, ` +
          `expense ${formatMoney(summary.totalExpense)} ` +
          `across ${summary.transactionCount} transaction(s).`;
        return ok(headline, summary);
      }

      case 'add_transaction': {
        const input = addTransactionSchema.parse(args);
        const created = await addTransaction(input);
        const headline =
          `Recorded ${created.type} of ${formatMoney(created.amount)} ` +
          `in "${created.category}" on ${created.date.slice(0, 10)}.`;
        return ok(headline, created);
      }

      case 'search_transactions': {
        const input = searchTransactionsSchema.parse(args);
        const result = await searchTransactions(input);
        const headline =
          `Found ${result.totalCount} matching transaction(s), showing ${result.returnedCount}. ` +
          `Income ${formatMoney(result.totals.income)}, ` +
          `expense ${formatMoney(result.totals.expense)}, ` +
          `net ${formatMoney(result.totals.net)}.`;
        return ok(headline, result);
      }

      case 'delete_transaction': {
        const input = deleteTransactionSchema.parse(args);
        const deleted = await deleteTransaction(input.id);
        const headline =
          `Deleted ${deleted.type} of ${formatMoney(deleted.amount)} ` +
          `in "${deleted.category}" dated ${deleted.date.slice(0, 10)}.`;
        return ok(headline, { deleted: true, transaction: deleted });
      }

      default:
        return fail(`Unknown tool "${name}". Available tools: ${TOOLS.map((t) => t.name).join(', ')}.`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(`Invalid arguments for "${name}" — ${formatZodError(error)}`);
    }
    if (error instanceof TransactionNotFoundError) {
      return fail(`${error.message} Use search_transactions to find a valid id.`);
    }

    const message = error instanceof Error ? error.message : String(error);
    log.error(`Tool "${name}" failed:`, message);

    // Surface connection problems with the fix, since this is by far the most
    // common failure when running the server for the first time.
    if (/ECONNREFUSED|P1001|P1000|P1003/.test(message)) {
      return fail(
        'Cannot reach the PostgreSQL database. Check that Postgres is running and that ' +
          'DATABASE_URL in backend/.env is correct, then run `npm run db:migrate`.',
      );
    }
    return fail(message);
  }
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
