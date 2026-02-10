# AGENTS.md

Guidelines for AI agents working in this repository.

## Project Overview

Figma Comment Pilot MCP Server — a stateful MCP server that transforms Figma's flat
comment stream into thread-based workflows for AI agents. TypeScript, Node.js >= 18,
ESM-only (`"type": "module"`).

## Build & Test Commands

```bash
npm run build          # tsc -p tsconfig.json → dist/
npm run typecheck      # tsc --noEmit (type check only)
npm test               # vitest run (all tests)
npx vitest run tests/core/reconciler.test.ts   # single test file
npx vitest run -t "returns DONE"               # single test by name
npm run test:watch     # vitest in watch mode
npm run test:coverage  # vitest with v8 coverage
npm run dev            # tsx src/index.ts (stdio mode)
npm run dev -- --transport=sse  # SSE mode on port 3000
```

## Project Structure

```
src/
├── index.ts              # Entry point (stdio or SSE via --transport flag)
├── config.ts             # Zod-validated env config, status emoji constants
├── core/
│   ├── sync.ts           # Sync engine: fetch → diff → DB → thread DTOs
│   ├── operations.ts     # Outbox pattern: enqueue → process → confirm/fail
│   └── reconciler.ts     # Emoji reaction → local status reconciliation
├── db/
│   ├── client.ts         # better-sqlite3 + Kysely setup, schema init
│   ├── schema.sql        # DDL: comments, operations, sync_state, config
│   └── types.ts          # Kysely table types (Generated, Selectable, etc.)
├── figma/
│   ├── api.ts            # Axios + Bottleneck rate-limited Figma REST client
│   ├── auth.ts           # OAuth 2.0 flow with localhost callback
│   └── types.ts          # Figma API types + Thread/SyncResult DTOs
├── mcp/
│   ├── router.ts         # MCP Server setup, tool registration
│   └── tools/            # One file per MCP tool handler
├── transport/
│   └── sse.ts            # Express app: /sse, /message, /webhook, /health
└── utils/
    ├── hash.ts           # SHA256 idempotency keys, UUID generation
    └── sanitizer.ts      # Prompt injection guard, bot message detection
tests/                    # Mirrors src/ structure
bin/auth-cli.ts           # OAuth CLI tool
```

## Code Style

### TypeScript Configuration
- **Strict mode** enabled (`strict: true` in tsconfig.json)
- Target: ES2022, Module: NodeNext, `verbatimModuleSyntax: true`
- Zero tolerance for `as any`, `@ts-ignore`, `@ts-expect-error`

### Imports
- Use `import type { ... }` for type-only imports (enforced by `verbatimModuleSyntax`)
- All relative imports MUST include `.js` extension: `import { db } from '../db/client.js'`
- Node builtins use `node:` prefix: `import { resolve } from 'node:path'`
- Order: external packages → node builtins → relative imports (value imports before type imports)

### Formatting
- 2-space indentation
- Single quotes for strings
- Trailing commas in multi-line constructs
- Semicolons required
- ~100 char line width (soft limit)

### Section Headers
Files use decorated comment banners to separate logical sections:
```typescript
// ── Section Name ─────────────────────────────────────────────────────────────
```

### Naming Conventions
- **Files**: `snake_case.ts` (e.g., `sync_comments.ts`, `auth-cli.ts` for bin)
- **Functions**: `camelCase` — `syncComments`, `handlePostReply`, `generateIdempotencyKey`
- **Interfaces/Types**: `PascalCase` — `CommentRow`, `SyncResult`, `LocalStatus`
- **Constants**: `UPPER_SNAKE_CASE` — `EMOJI_TO_STATUS`, `MAX_RETRIES`
- **DB columns**: `snake_case` — `file_key`, `local_status`, `reply_posted_by_ai`
- **Env vars**: `UPPER_SNAKE_CASE` — `FIGMA_CLIENT_ID`, `SSE_PORT`

### Types
- Define interfaces for function args and return types in tool handlers
- Use Kysely's `Generated<T>` for columns with SQL defaults
- Use `Selectable<T>` / `Insertable<T>` / `Updateable<T>` for DB row types
- Prefer union types for finite sets: `type LocalStatus = 'OPEN' | 'PENDING' | 'DONE' | 'WONTFIX'`
- Use Zod for runtime validation (config, env vars)

### Error Handling
- Throw descriptive `Error` with context: `throw new Error('No Figma access token found. Run ...')`
- Catch blocks type error as `unknown`: `catch (err: unknown)`
- Extract message: `const message = err instanceof Error ? err.message : String(err)`
- Never use empty catch blocks — at minimum log or re-throw
- MCP tool errors return `{ isError: true, content: [{ type: 'text', text: '...' }] }`

### Database Patterns
- Use Kysely for queries; raw `better-sqlite3` only for synchronous transactions
- All DB writes in `core/operations.ts` go through the outbox pattern
- Upserts use `ON CONFLICT ... DO UPDATE SET`
- Timestamps stored as ISO 8601 strings

## Testing

### Framework: Vitest
- Config: `vitest.config.ts` — pool: `forks` (process isolation per file)
- Test files: `tests/**/*.test.ts` mirroring `src/` structure
- Globals enabled (`describe`, `it`, `expect` available without import, but files import explicitly)

### Test Patterns
- **Pure function tests** (reconciler, hash, sanitizer): No mocks needed, import directly
- **DB-dependent tests** (sync, operations): Must mock `src/db/client.js` and `src/figma/api.js`
- **Mock setup**: Use `vi.mock()` BEFORE dynamic `await import()` of module under test
- **Test DB**: Use `createTestDb()` / `closeTestDb()` from `tests/helpers.ts` for in-memory SQLite

### Standard Mock Template for DB Tests
```typescript
import { createTestDb, closeTestDb, type TestDb } from '../helpers.js';
let testDb: TestDb;

vi.mock('../../src/db/client.js', () => ({
  get db() { return testDb.db; },
  get rawDb() { return testDb.rawDb; },
  closeDatabaseConnection: vi.fn(),
}));

vi.mock('../../src/figma/api.js', () => ({ /* mock API functions */ }));
vi.mock('../../src/config.js', () => ({ appConfig: { /* test config */ } }));

const { functionUnderTest } = await import('../../src/module.js');

beforeEach(() => { testDb = createTestDb(); vi.clearAllMocks(); });
afterEach(() => { closeTestDb(testDb.rawDb); });
```

### Key Testing Rules
- Never make real Figma API calls — always mock `src/figma/api.js`
- Always mock `src/config.js` to avoid `.env` dependency
- Each test file gets its own isolated in-memory DB
- Test the outbox state machine: PENDING → PROCESSING → CONFIRMED/FAILED
- Test idempotency: same input twice → second call returns `{ status: 'duplicate' }`

## Architecture Invariants

1. **Outbox pattern**: All Figma write operations go through `operations` table, never direct API calls from tool handlers
2. **Single writer lock**: `withFileLock(fileKey, fn)` prevents concurrent sync/write on same file
3. **Status reconciliation**: Figma emoji reactions are the source of truth — local status follows remote
4. **Bot detection**: By user ID (`bot_user_id` in `sync_state`) OR message prefix (`[FCP]`)
5. **Prompt injection guard**: All user content wrapped in `<user_content>` tags with HTML entity escaping before returning to LLM
6. **Idempotency keys**: SHA256 of `file_key|root_id|op_type|normalized_content|agent_identity`
