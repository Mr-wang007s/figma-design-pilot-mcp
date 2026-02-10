#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './mcp/router.js';
import { closeDatabaseConnection } from './db/client.js';
import { startSseServer } from './transport/sse.js';
import { appConfig } from './config.js';

async function main(): Promise<void> {
  const transportArg = process.argv.find((a) => a.startsWith('--transport='));
  const transport = transportArg?.split('=')[1] ?? 'stdio';

  if (transport === 'sse') {
    await startSseServer(appConfig.SSE_PORT);
  } else if (transport === 'stdio') {
    const server = createMcpServer();
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
    console.error('🚀 Figma Design Pilot MCP Server v4.0 running on stdio');
  } else {
    console.error(`❌ Unknown transport: ${transport}. Use --transport=stdio or --transport=sse`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('💥 Fatal error:', error);
  closeDatabaseConnection();
  process.exit(1);
});
