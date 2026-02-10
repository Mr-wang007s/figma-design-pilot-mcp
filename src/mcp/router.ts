import { z } from 'zod';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { handleSyncComments } from './tools/sync_comments.js';
import { handlePostReply } from './tools/post_reply.js';
import { handleSetStatus } from './tools/set_status.js';
import { handleGetThread } from './tools/get_thread.js';
import { handleListPending } from './tools/list_pending.js';
import { handleDeleteOwnReply } from './tools/delete_own_reply.js';

// ── Tool Definitions ────────────────────────────────────────────────────────

const tools = [
  {
    name: 'figma_sync_comments',
    description:
      'Fetch all comments from a Figma file, diff against local database, and return threads that need attention (OPEN/PENDING status). This is the primary entry point — call this first.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        file_key: {
          type: 'string',
          description: 'Figma file key (from the file URL)',
        },
        force_full_sync: {
          type: 'boolean',
          description: 'Ignore cached state, treat all threads as new',
          default: false,
        },
      },
      required: ['file_key'],
    },
  },
  {
    name: 'figma_post_reply',
    description:
      'Reply to a comment thread. Must target a root comment ID. The reply is processed through an idempotent outbox — safe to retry on failure.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        file_key: { type: 'string', description: 'Figma file key' },
        root_comment_id: {
          type: 'string',
          description: 'ID of the root comment (thread) to reply to',
        },
        message: {
          type: 'string',
          description:
            'Reply content. Do NOT include emoji status prefixes — those are managed by figma_set_status.',
        },
      },
      required: ['file_key', 'root_comment_id', 'message'],
    },
  },
  {
    name: 'figma_set_status',
    description:
      'Change a thread status by adding/removing emoji reactions. PENDING=👀, DONE=✅, WONTFIX=🚫.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        file_key: { type: 'string', description: 'Figma file key' },
        comment_id: {
          type: 'string',
          description: 'ID of the root comment to change status on',
        },
        status: {
          type: 'string',
          enum: ['PENDING', 'DONE', 'WONTFIX'],
          description: 'Target status',
        },
      },
      required: ['file_key', 'comment_id', 'status'],
    },
  },
  {
    name: 'figma_get_thread',
    description:
      'Get the full context of a single thread (root comment + all replies). Reads from local database — run figma_sync_comments first if data might be stale.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        file_key: { type: 'string', description: 'Figma file key' },
        thread_id: {
          type: 'string',
          description: 'Root comment ID of the thread',
        },
      },
      required: ['file_key', 'thread_id'],
    },
  },
  {
    name: 'figma_list_pending',
    description:
      'List all OPEN/PENDING threads from local database. No network request — instant response. Use after figma_sync_comments to get a task list.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        file_key: { type: 'string', description: 'Figma file key' },
        limit: {
          type: 'number',
          description: 'Maximum number of threads to return',
          default: 20,
        },
      },
      required: ['file_key'],
    },
  },
  {
    name: 'figma_delete_own_reply',
    description:
      'Delete a reply that was posted by this bot (for corrections). Only bot-generated replies can be deleted.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        file_key: { type: 'string', description: 'Figma file key' },
        comment_id: {
          type: 'string',
          description: 'ID of the bot reply to delete',
        },
      },
      required: ['file_key', 'comment_id'],
    },
  },
];

// ── Server Setup ────────────────────────────────────────────────────────────

export function createMcpServer(): Server {
  const server = new Server(
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

  // Register tool listing
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  // Register tool execution
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'figma_sync_comments': {
          const result = await handleSyncComments(
            args as { file_key: string; force_full_sync?: boolean },
          );
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'figma_post_reply': {
          const result = await handlePostReply(
            args as {
              file_key: string;
              root_comment_id: string;
              message: string;
            },
          );
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'figma_set_status': {
          const result = await handleSetStatus(
            args as {
              file_key: string;
              comment_id: string;
              status: 'PENDING' | 'DONE' | 'WONTFIX';
            },
          );
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'figma_get_thread': {
          const result = await handleGetThread(
            args as { file_key: string; thread_id: string },
          );
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'figma_list_pending': {
          const result = await handleListPending(
            args as { file_key: string; limit?: number },
          );
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'figma_delete_own_reply': {
          const result = await handleDeleteOwnReply(
            args as { file_key: string; comment_id: string },
          );
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        default:
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Unknown tool: ${name}`,
              },
            ],
          };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: `Error executing ${name}: ${message}`,
          },
        ],
      };
    }
  });

  return server;
}
