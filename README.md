# Figma Comment Pilot MCP

**v3.1** -- A stateful MCP server that transforms Figma's flat comment stream into thread-based structured workflows for AI agents.

## Features

- **Thread-centric model** -- Groups flat Figma comments into conversation threads (root + replies + status)
- **Outbox pattern** -- Idempotent write operations with automatic retry (PENDING -> CONFIRMED/FAILED)
- **Status reconciliation** -- Maps emoji reactions to workflow states (OPEN / PENDING / DONE / WONTFIX)
- **6 MCP tools** -- sync_comments, post_reply, set_status, get_thread, list_pending, delete_own_reply
- **Dual transport** -- stdio (Claude Desktop, Cursor) + SSE/HTTP (openClaw)
- **Webhook support** -- Receives Figma push notifications to trigger incremental sync
- **OAuth 2.0** -- Localhost callback flow for desktop AI clients
- **Rate limiting** -- Bottleneck-based (5 concurrent reads, 1 write/sec)
- **Security** -- Prompt injection guard, bot self-reply prevention, webhook signature verification

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Figma OAuth credentials or Personal Access Token

# Authenticate via OAuth (optional if using PAT)
npm run auth

# Run in stdio mode (Claude Desktop / Cursor)
npm run dev

# Run in SSE mode (openClaw)
npm run dev -- --transport=sse

# Build for production
npm run build
node dist/index.js                    # stdio
node dist/index.js --transport=sse    # SSE
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `FIGMA_CLIENT_ID` | | Figma OAuth App Client ID |
| `FIGMA_CLIENT_SECRET` | | Figma OAuth App Client Secret |
| `FIGMA_PERSONAL_ACCESS_TOKEN` | | Alternative to OAuth -- set this for quick setup |
| `DB_PATH` | `./data.db` | SQLite database file path |
| `AUTH_CALLBACK_PORT` | `3456` | OAuth localhost callback port |
| `BOT_REPLY_PREFIX` | `[FCP]` | Prefix prepended to all bot replies |
| `SSE_PORT` | `3000` | HTTP/SSE server port |
| `WEBHOOK_SECRET` | | HMAC secret for Figma webhook signature verification |

## Client Configuration

### Claude Desktop / Cursor

Add to your MCP config (`claude_desktop_config.json` or Cursor settings):

```json
{
  "mcpServers": {
    "figma-pilot": {
      "command": "node",
      "args": ["/absolute/path/to/figma-mcp-server/dist/index.js"],
      "env": {
        "FIGMA_PERSONAL_ACCESS_TOKEN": "your-figma-pat"
      }
    }
  }
}
```

### openClaw (SSE)

Start the server with `--transport=sse`, then connect to:
- **SSE endpoint**: `http://127.0.0.1:3000/sse`
- **Message endpoint**: `http://127.0.0.1:3000/message`

## MCP Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `figma_sync_comments` | Fetch and diff comments from Figma, return threads needing attention | `file_key`, `force_full_sync` |
| `figma_post_reply` | Reply to a thread via idempotent outbox | `file_key`, `root_comment_id`, `message` |
| `figma_set_status` | Change thread status via emoji reactions | `file_key`, `comment_id`, `status` |
| `figma_get_thread` | Get a single thread's full context from local DB | `file_key`, `thread_id` |
| `figma_list_pending` | List all OPEN/PENDING threads (no network request) | `file_key`, `limit` |
| `figma_delete_own_reply` | Delete a bot-generated reply (for corrections) | `file_key`, `comment_id` |

## Architecture

```
AI Client (Claude/Cursor/openClaw)
    |
    | JSON-RPC (stdio or SSE)
    v
MCP Router --> Sync Engine --> Figma REST API
    |              |
    |              v
    |          SQLite DB (comments, operations, sync_state, config)
    |              ^
    |              |
    +-------> Operations Manager (Outbox Pattern)
```

**Sync Engine**: Fetches all comments from Figma, groups by thread, diffs against local DB, reconciles status from emoji reactions.

**Outbox Pattern**: Write operations (reply, set status) are enqueued as PENDING records. A processor executes them against the Figma API and marks CONFIRMED or retries up to 3 times before marking FAILED.

**Status Reconciliation**: Emoji reactions on Figma map to local status -- `(none)` = OPEN, eyes = PENDING, checkmark = DONE, prohibited = WONTFIX. Human actions on Figma always take priority.

**Single Writer Lock**: Per-file mutex prevents concurrent sync/write operations from causing race conditions.

## Development

```bash
npm run build        # Compile TypeScript
npm run typecheck    # Type check without emit
npm test             # Run tests (vitest)
npm run test:watch   # Watch mode
npm run test:coverage # Coverage report
```

## Tech Stack

- **Runtime**: Node.js >= 18
- **Language**: TypeScript 5.x (strict mode)
- **MCP SDK**: @modelcontextprotocol/sdk
- **Database**: better-sqlite3 + kysely (query builder)
- **HTTP**: axios, express, cors
- **Rate Limiting**: bottleneck
- **Validation**: zod
- **Testing**: vitest

## License

MIT
