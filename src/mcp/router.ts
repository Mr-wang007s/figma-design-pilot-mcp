import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Comment Workflow handlers
import { handleSyncComments } from './tools/sync_comments.js';
import { handlePostReply } from './tools/post_reply.js';
import { handleSetStatus } from './tools/set_status.js';
import { handleGetThread } from './tools/get_thread.js';
import { handleListPending } from './tools/list_pending.js';
import { handleDeleteOwnReply } from './tools/delete_own_reply.js';

// Design Review handlers
import { handleDesignReview } from './tools/design_review.js';
import { handleReviewColors } from './tools/review_colors.js';
import { handleReviewSpacing } from './tools/review_spacing.js';
import { handleReviewTypography } from './tools/review_typography.js';
import { handleReviewComponents } from './tools/review_components.js';
import { handleReviewTokenCoverage } from './tools/review_token_coverage.js';
import { handleReviewStructure } from './tools/review_structure.js';
import { handleReviewA11y } from './tools/review_a11y.js';

// Base data handlers
import { handleGetFileStructure } from './tools/get_file_structure.js';
import { handleGetVariables } from './tools/get_variables.js';
import { handleGetComponents } from './tools/get_components.js';
import { handleGetStyles } from './tools/get_styles.js';
import { handleGetFileVersions } from './tools/get_file_versions.js';
import { handleExportImages } from './tools/export_images.js';

// ── Server Setup ────────────────────────────────────────────────────────────

export function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: 'figma-design-pilot',
      version: '4.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Part A: Design Review Tools
  // ══════════════════════════════════════════════════════════════════════════

  server.registerTool(
    'figma_design_review',
    {
      description:
        'Run a full design review on a Figma file. Checks colors, spacing, typography, components, token coverage, structure, and accessibility. Returns a scored report with issues and suggestions. This is the primary Design Review entry point.',
      inputSchema: {
        file_key: z.string().describe('Figma file key (from the file URL)'),
        page_name: z.string().optional().describe('Limit review to a specific page'),
        dimensions: z
          .array(z.enum(['colors', 'spacing', 'typography', 'components', 'token_coverage', 'structure', 'a11y']))
          .optional()
          .describe('Run only specific dimensions. Default: all'),
        severity_filter: z
          .enum(['error', 'warning', 'info'])
          .optional()
          .describe('Minimum severity to include. Default: all'),
      },
    },
    async (args) => {
      const result = await handleDesignReview(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'figma_review_colors',
    {
      description:
        'Check all color usage in a Figma file: hardcoded fills, strokes, effects, gradients, and opacity. Reports colors not bound to design system variables.',
      inputSchema: {
        file_key: z.string().describe('Figma file key'),
        page_name: z.string().optional().describe('Limit to a specific page'),
      },
    },
    async (args) => {
      const result = await handleReviewColors(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'figma_review_spacing',
    {
      description:
        'Check spacing, padding, gap, and corner radius values. Detects hardcoded values not bound to variables and values off the design grid.',
      inputSchema: {
        file_key: z.string().describe('Figma file key'),
        page_name: z.string().optional().describe('Limit to a specific page'),
        grid_base: z.number().default(8).describe('Grid base unit in px (default: 8)'),
      },
    },
    async (args) => {
      const result = await handleReviewSpacing(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'figma_review_typography',
    {
      description:
        'Check typography: missing text styles, hardcoded font sizes, invalid font families, and unbound text colors.',
      inputSchema: {
        file_key: z.string().describe('Figma file key'),
        page_name: z.string().optional().describe('Limit to a specific page'),
        allowed_fonts: z
          .array(z.string())
          .optional()
          .describe('Whitelist of allowed font families'),
      },
    },
    async (args) => {
      const result = await handleReviewTypography(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'figma_review_components',
    {
      description:
        'Audit component usage: detached instances, missing main components, excessive overrides, unused components, and naming conventions.',
      inputSchema: {
        file_key: z.string().describe('Figma file key'),
        page_name: z.string().optional().describe('Limit to a specific page'),
      },
    },
    async (args) => {
      const result = await handleReviewComponents(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'figma_review_token_coverage',
    {
      description:
        'Calculate Design Token / variable binding coverage across the file. Reports percentage of fills, strokes, spacing, typography, and effects bound to variables.',
      inputSchema: {
        file_key: z.string().describe('Figma file key'),
        page_name: z.string().optional().describe('Limit to a specific page'),
      },
    },
    async (args) => {
      const result = await handleReviewTokenCoverage(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'figma_review_structure',
    {
      description:
        'Check layer structure: default naming, empty frames, deep nesting, hidden layer bloat.',
      inputSchema: {
        file_key: z.string().describe('Figma file key'),
        page_name: z.string().optional().describe('Limit to a specific page'),
        max_depth: z.number().default(10).describe('Maximum allowed nesting depth'),
      },
    },
    async (args) => {
      const result = await handleReviewStructure(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'figma_review_a11y',
    {
      description:
        'Check accessibility: WCAG color contrast ratio, minimum text size, touch target dimensions.',
      inputSchema: {
        file_key: z.string().describe('Figma file key'),
        page_name: z.string().optional().describe('Limit to a specific page'),
        wcag_level: z.enum(['AA', 'AAA']).default('AA').describe('WCAG compliance level'),
      },
    },
    async (args) => {
      const result = await handleReviewA11y(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Part B: Base Data Tools
  // ══════════════════════════════════════════════════════════════════════════

  server.registerTool(
    'figma_get_file_structure',
    {
      description:
        'Get the page and layer structure of a Figma file. Returns a tree of node names, types, and sizes. Use this to understand the design file layout before deeper analysis.',
      inputSchema: {
        file_key: z.string().describe('Figma file key'),
        depth: z.number().default(3).describe('Max tree depth to return (default: 3)'),
        page_name: z.string().optional().describe('Limit to a specific page'),
      },
    },
    async (args) => {
      const result = await handleGetFileStructure(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'figma_get_variables',
    {
      description:
        'Get all Design Tokens / Variables defined in a Figma file, including colors, spacing, typography tokens. Requires Enterprise plan.',
      inputSchema: {
        file_key: z.string().describe('Figma file key'),
        collection_name: z.string().optional().describe('Filter by variable collection name'),
      },
    },
    async (args) => {
      const result = await handleGetVariables(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'figma_get_components',
    {
      description:
        'Get all components and component sets from a Figma file. Returns names, descriptions, keys, and variant relationships.',
      inputSchema: {
        file_key: z.string().describe('Figma file key'),
      },
    },
    async (args) => {
      const result = await handleGetComponents(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'figma_get_styles',
    {
      description:
        'Get all published styles from a Figma file: color styles, text styles, effect styles, grid styles.',
      inputSchema: {
        file_key: z.string().describe('Figma file key'),
      },
    },
    async (args) => {
      const result = await handleGetStyles(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'figma_get_file_versions',
    {
      description:
        'Get the version history of a Figma file. Use to track changes over time or select versions for diffing.',
      inputSchema: {
        file_key: z.string().describe('Figma file key'),
        limit: z.number().default(20).describe('Max versions to return'),
      },
    },
    async (args) => {
      const result = await handleGetFileVersions(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'figma_export_images',
    {
      description:
        'Export Figma nodes as images (PNG, SVG, PDF, JPG). Returns download URLs for each node. Use for exporting icons, illustrations, or design screenshots.',
      inputSchema: {
        file_key: z.string().describe('Figma file key'),
        node_ids: z.array(z.string()).describe('Node IDs to export'),
        format: z.enum(['png', 'svg', 'pdf', 'jpg']).default('png').describe('Image format'),
        scale: z.number().min(1).max(4).default(2).describe('Export scale (1-4)'),
      },
    },
    async (args) => {
      const result = await handleExportImages(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Part C: Comment Workflow Tools
  // ══════════════════════════════════════════════════════════════════════════

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
