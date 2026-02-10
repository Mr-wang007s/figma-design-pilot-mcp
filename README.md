# Figma Design Pilot MCP

**v4.0** — A stateful MCP server providing AI-powered **Design Review** and **Comment Workflow** capabilities for Figma files. Works with Claude Desktop, Cursor, CodeBuddy, openClaw, and any MCP-compatible AI agent.

## What it does

| Capability | Description |
|------------|-------------|
| **Design Review** | Automated 7-dimension quality audit: colors, spacing, typography, components, token coverage, structure, accessibility |
| **Comment Workflow** | Thread-based Figma comment management with status tracking and idempotent writes |
| **Base Data** | File structure, components, styles, variables, version history, image export |

## Quick Start

### 1. Install

```bash
git clone https://github.com/anthropics/figma-design-pilot-mcp.git
cd figma-design-pilot-mcp
npm install
npm run build
```

### 2. Get a Figma Token

Go to [Figma Settings → Personal Access Tokens](https://www.figma.com/developers/api#access-tokens) and create a token with **File content (Read)** and **Comments (Read/Write)** scopes.

### 3. Connect to your AI Client

#### Claude Desktop / Cursor / CodeBuddy

Add to your MCP config:

```json
{
  "mcpServers": {
    "figma-pilot": {
      "command": "node",
      "args": ["/path/to/figma-design-pilot-mcp/dist/index.js"],
      "env": {
        "FIGMA_PERSONAL_ACCESS_TOKEN": "figd_xxxxx"
      }
    }
  }
}
```

#### Development mode (with tsx)

```json
{
  "mcpServers": {
    "figma-pilot": {
      "command": "npx",
      "args": ["tsx", "/path/to/figma-design-pilot-mcp/src/index.ts"],
      "env": {
        "FIGMA_PERSONAL_ACCESS_TOKEN": "figd_xxxxx"
      }
    }
  }
}
```

#### SSE mode (openClaw / web clients)

```bash
npm run dev -- --transport=sse
# Server runs on http://127.0.0.1:3000
```

Then connect to: `http://127.0.0.1:3000/mcp`

## MCP Tools (20)

### Design Review (8 tools)

| Tool | Description |
|------|-------------|
| `figma_design_review` | **Full review** — Run all 7 dimensions, returns scored report (0–100, A–F grade) |
| `figma_review_colors` | Check hardcoded fills, strokes, gradients, shadows, opacity |
| `figma_review_spacing` | Check padding, gap, corner radius, off-grid values, Auto Layout |
| `figma_review_typography` | Validate text styles, font sizes, line heights, font families |
| `figma_review_components` | Audit detached instances, missing main components, overrides, naming |
| `figma_review_token_coverage` | Calculate Design Token variable binding coverage (%) |
| `figma_review_structure` | Check default names, empty frames, deep nesting, hidden layers |
| `figma_review_a11y` | WCAG contrast ratio, text size, touch target checks |

### Base Data (6 tools)

| Tool | Description |
|------|-------------|
| `figma_get_file_structure` | Get page and layer tree (names, types, sizes) |
| `figma_get_variables` | Get all Design Tokens / Variables (Enterprise) |
| `figma_get_components` | Get components and component sets |
| `figma_get_styles` | Get published styles (color, text, effect, grid) |
| `figma_get_file_versions` | Get version history |
| `figma_export_images` | Export nodes as PNG, SVG, PDF, or JPG |

### Comment Workflow (6 tools)

| Tool | Description |
|------|-------------|
| `figma_sync_comments` | Fetch and diff comments, return threads needing attention |
| `figma_post_reply` | Reply to a thread via idempotent outbox |
| `figma_set_status` | Change thread status via emoji (👀 PENDING, ✅ DONE, 🚫 WONTFIX) |
| `figma_get_thread` | Get a thread's full context from local DB |
| `figma_list_pending` | List all OPEN/PENDING threads (instant, no network) |
| `figma_delete_own_reply` | Delete a bot-generated reply |

## Usage Examples

### Run a Design Review

Ask your AI agent:

> "Review the design file https://www.figma.com/design/abc123/MyApp and tell me what issues to fix"

The agent will call `figma_design_review` and return a structured report:

```
Score: 72/100 (C)
Issues: 15 errors, 8 warnings

Colors:
  ❌ 12 hardcoded fill colors not bound to variables
  ⚠️ 3 hardcoded stroke colors

Token Coverage: 34%
  fills: 20%, strokes: 0%, spacing: 80%, typography: 60%

Structure:
  ⚠️ 5 layers with default names ("Frame 1", "Rectangle 2")
  ⚠️ 2 empty frames
```

### Manage Comments

> "Sync comments from my Figma file and reply to any open threads"

The agent calls `figma_sync_comments` → `figma_list_pending` → `figma_post_reply`.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `FIGMA_PERSONAL_ACCESS_TOKEN` | | Figma PAT — **recommended** for quick setup |
| `FIGMA_CLIENT_ID` | | Figma OAuth App Client ID |
| `FIGMA_CLIENT_SECRET` | | Figma OAuth App Client Secret |
| `DB_PATH` | `./data.db` | SQLite database file path |
| `SSE_PORT` | `3000` | HTTP server port (SSE mode) |
| `BOT_REPLY_PREFIX` | `[FCP]` | Prefix for bot-generated replies |
| `AUTH_CALLBACK_PORT` | `3456` | OAuth localhost callback port |
| `WEBHOOK_SECRET` | | HMAC secret for Figma webhook verification |

## Architecture

```
AI Client (Claude / Cursor / CodeBuddy / openClaw)
    │
    │  JSON-RPC (stdio or Streamable HTTP)
    ▼
┌─────────────────────────────────────────────┐
│  MCP Router (20 tools)                      │
├─────────────┬──────────────┬────────────────┤
│ Design      │ Base Data    │ Comment        │
│ Review (8)  │ Tools (6)    │ Workflow (6)   │
└──────┬──────┴──────┬───────┴───────┬────────┘
       │             │               │
       ▼             ▼               ▼
┌─────────────┐ ┌─────────┐ ┌──────────────┐
│ Review      │ │ Figma   │ │ Sync Engine  │
│ Engine      │ │ REST    │ │ + Operations │
│ (7 linters) │ │ API     │ │ (Outbox)     │
└──────┬──────┘ └─────────┘ └──────┬───────┘
       │                           │
       ▼                           ▼
┌──────────────────────────────────────────┐
│  SQLite (better-sqlite3 + Kysely)        │
│  8 tables: comments, operations,         │
│  sync_state, config, file_snapshots,     │
│  review_reports, review_issues,          │
│  review_rules                            │
└──────────────────────────────────────────┘
```

## Development

```bash
npm run build          # Compile TypeScript → dist/
npm run typecheck      # Type check only (no emit)
npm run dev            # Run with tsx (stdio)
npm test               # Run tests (vitest)
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report
```

## Tech Stack

- **Runtime**: Node.js >= 18
- **Language**: TypeScript 5.x (strict mode, ESM-only)
- **MCP SDK**: @modelcontextprotocol/sdk
- **Database**: better-sqlite3 + Kysely
- **HTTP**: axios, express
- **Rate Limiting**: bottleneck
- **Validation**: zod
- **Testing**: vitest

## License

MIT
