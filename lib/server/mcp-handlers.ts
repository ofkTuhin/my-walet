import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { log } from './logger';
import { formatMoney } from './serialize';
import { TOOLS } from './tool-schemas';
import {
  addTransaction,
  deleteTransaction,
  getWalletSummary,
  searchTransactions,
  TransactionNotFoundError,
} from './wallet-service';
import {
  addTransactionSchema,
  deleteTransactionSchema,
  formatZodError,
  searchTransactionsSchema,
  walletSummarySchema,
} from './validation';

/**
 * Tool dispatch, shared by both MCP entry points: the stdio server used in
 * local development and the hosted HTTP route.
 *
 * Identity is a parameter here, not a tool argument. The transport authenticates
 * the caller and passes `userId` in — the model never sees it and cannot name a
 * different account.
 */

export { TOOLS };

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

export async function callWalletTool(
  userId: string,
  name: string,
  rawArgs: unknown,
): Promise<CallToolResult> {
  const args = rawArgs ?? {};

  try {
    switch (name) {
      case 'get_wallet_summary': {
        const input = walletSummarySchema.parse(args);
        const summary = await getWalletSummary(userId, input);
        const headline =
          `Balance ${formatMoney(summary.balance)} — ` +
          `income ${formatMoney(summary.totalIncome)}, ` +
          `expense ${formatMoney(summary.totalExpense)} ` +
          `across ${summary.transactionCount} transaction(s).`;
        return ok(headline, summary);
      }

      case 'add_transaction': {
        const input = addTransactionSchema.parse(args);
        const created = await addTransaction(userId, input);
        const headline =
          `Recorded ${created.type} of ${formatMoney(created.amount)} ` +
          `in "${created.category}" on ${created.date.slice(0, 10)}.`;
        return ok(headline, created);
      }

      case 'search_transactions': {
        const input = searchTransactionsSchema.parse(args);
        const result = await searchTransactions(userId, input);
        const headline =
          `Found ${result.totalCount} matching transaction(s), showing ${result.returnedCount}. ` +
          `Income ${formatMoney(result.totals.income)}, ` +
          `expense ${formatMoney(result.totals.expense)}, ` +
          `net ${formatMoney(result.totals.net)}.`;
        return ok(headline, result);
      }

      case 'delete_transaction': {
        const input = deleteTransactionSchema.parse(args);
        const deleted = await deleteTransaction(userId, input.id);
        const headline =
          `Deleted ${deleted.type} of ${formatMoney(deleted.amount)} ` +
          `in "${deleted.category}" dated ${deleted.date.slice(0, 10)}.`;
        return ok(headline, { deleted: true, transaction: deleted });
      }

      default:
        return fail(
          `Unknown tool "${name}". Available tools: ${TOOLS.map((t) => t.name).join(', ')}.`,
        );
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(`Invalid arguments for "${name}" — ${formatZodError(error)}`);
    }
    if (error instanceof TransactionNotFoundError) {
      // A row belonging to another account reaches here as "not found" too,
      // which is deliberate: the message must not confirm that it exists.
      return fail(`${error.message} Use search_transactions to find a valid id.`);
    }

    const message = error instanceof Error ? error.message : String(error);
    log.error(`Tool "${name}" failed:`, message);

    // Surface connection problems with the fix, since this is by far the most
    // common failure when running the server for the first time.
    if (/ECONNREFUSED|P1001|P1000|P1003/.test(message)) {
      return fail(
        'Cannot reach the PostgreSQL database. Check that Postgres is running and that ' +
          'DATABASE_URL in .env.local is correct, then run `npm run db:migrate`.',
      );
    }
    return fail(message);
  }
}
