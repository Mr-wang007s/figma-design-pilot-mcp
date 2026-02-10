import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { handleSyncComments } from './tools/sync_comments.js';
import { handlePostReply } from './tools/post_reply.js';
import { handleSetStatus } from './tools/set_status.js';
import { handleGetThread } from './tools/get_thread.js';
import { handleListPending } from './tools/list_pending.js';
import { handleDeleteOwnReply } from './tools/delete_own_reply.js';

// ── Server Setup ────────────────────────────────────────────────────────────

export function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: 'figma-comment-pilot',
      version: '3.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // ── Tool Registration ──────────────────────────────────────────────────

  server.registerTool(
    'figma_sync_comments',
    {
      description:
        'Fetch all comments from a Figma file, diff against local database, and return threads that need attention (OPEN/PENDING status). This is the primary entry point — call this first.',
      inputSchema: {
        file_key: z.string().describe('Figma file key (from the file URL)'),
        force_full_sync: z
          .boolean()
          .default(false)
          .describe('Ignore cached state, treat all threads as new'),
      },
    },
    async (args) => {
      const result = await handleSyncComments(args);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    'figma_post_reply',
    {
      description:
        'Reply to a comment thread. Must target a root comment ID. The reply is processed through an idempotent outbox — safe to retry on failure.',
      inputSchema: {
        file_key: z.string().describe('Figma file key'),
        root_comment_id: z
          .string()
          .describe('ID of the root comment (thread) to reply to'),
        message: z
          .string()
          .describe(
            'Reply content. Do NOT include emoji status prefixes — those are managed by figma_set_status.',
          ),
      },
    },
    async (args) => {
      const result = await handlePostReply(args);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    'figma_set_status',
    {
      description:
        'Change a thread status by adding/removing emoji reactions. PENDING=👀, DONE=✅, WONTFIX=🚫.',
      inputSchema: {
        file_key: z.string().describe('Figma file key'),
        comment_id: z
          .string()
          .describe('ID of the root comment to change status on'),
        status: z
          .enum(['PENDING', 'DONE', 'WONTFIX'])
          .describe('Target status'),
      },
    },
    async (args) => {
      const result = await handleSetStatus(args);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    'figma_get_thread',
    {
      description:
        'Get the full context of a single thread (root comment + all replies). Reads from local database — run figma_sync_comments first if data might be stale.',
      inputSchema: {
        file_key: z.string().describe('Figma file key'),
        thread_id: z.string().describe('Root comment ID of the thread'),
      },
    },
    async (args) => {
      const result = await handleGetThread(args);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    'figma_list_pending',
    {
      description:
        'List all OPEN/PENDING threads from local database. No network request — instant response. Use after figma_sync_comments to get a task list.',
      inputSchema: {
        file_key: z.string().describe('Figma file key'),
        limit: z
          .number()
          .default(20)
          .describe('Maximum number of threads to return'),
      },
    },
    async (args) => {
      const result = await handleListPending(args);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    'figma_delete_own_reply',
    {
      description:
        'Delete a reply that was posted by this bot (for corrections). Only bot-generated replies can be deleted.',
      inputSchema: {
        file_key: z.string().describe('Figma file key'),
        comment_id: z.string().describe('ID of the bot reply to delete'),
      },
    },
    async (args) => {
      const result = await handleDeleteOwnReply(args);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  return server;
}
