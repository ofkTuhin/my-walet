/**
 * stderr-only logger.
 *
 * StdioServerTransport owns stdout for JSON-RPC framing; a stray `console.log`
 * anywhere in the process will break the MCP connection. Always use this.
 */
export const log = {
  info: (...args: unknown[]) => console.error('[wallet-mcp]', ...args),
  warn: (...args: unknown[]) => console.error('[wallet-mcp:warn]', ...args),
  error: (...args: unknown[]) => console.error('[wallet-mcp:error]', ...args),
};
