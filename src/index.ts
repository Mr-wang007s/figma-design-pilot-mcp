#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './mcp/router.js';
import { closeDatabaseConnection } from './db/client.js';

async function main(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);
  console.error('🚀 Figma Comment Pilot MCP Server v3.1 running on stdio');
}

main().catch((error) => {
  console.error('💥 Fatal error:', error);
  closeDatabaseConnection();
  process.exit(1);
});
