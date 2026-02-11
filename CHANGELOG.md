# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0](https://github.com/Mr-wang007s/figma-design-pilot-mcp/compare/v1.0.0...v1.1.0) (2026-02-11)


### Features

* add SSE transport, CI workflow, README and project docs ([e630ea9](https://github.com/Mr-wang007s/figma-design-pilot-mcp/commit/e630ea967be0e95f23a7c02279e7668354b023a5))
* initial commit - Figma Comment Pilot MCP Server v3.1 ([863a4d9](https://github.com/Mr-wang007s/figma-design-pilot-mcp/commit/863a4d908e800852f8d322014f458e97660fd644))


### Bug Fixes

* align BOT_REPLY_PREFIX default to [FDP] after project rename ([#1](https://github.com/Mr-wang007s/figma-design-pilot-mcp/issues/1)) ([40699d9](https://github.com/Mr-wang007s/figma-design-pilot-mcp/commit/40699d9b573321261ca5e2fa892557cf4566b9db))
* restore version to 4.0.0, update README and add semver enforcement ([#5](https://github.com/Mr-wang007s/figma-design-pilot-mcp/issues/5)) ([dde06aa](https://github.com/Mr-wang007s/figma-design-pilot-mcp/commit/dde06aa58aaba0a6a451be20c0448d1691d6b0f2))
* update repository URLs to match renamed GitHub repo ([#3](https://github.com/Mr-wang007s/figma-design-pilot-mcp/issues/3)) ([6bba717](https://github.com/Mr-wang007s/figma-design-pilot-mcp/commit/6bba71762a8bf1fac206c1f9c6722509c77513cd))

## [4.0.0] - 2026-02-10

### ⚡ Breaking Changes

- Server renamed from `figma-comment-pilot-mcp` to `figma-design-pilot-mcp`
- MCP server name changed from `figma-comment-pilot` to `figma-design-pilot`
- SSE endpoint changed from `/sse` + `/message` to `/mcp` (Streamable HTTP Transport)
- Health endpoint version bumped to `4.0`
- DB schema version bumped to `4.0` — 4 new tables added (auto-migrated)

### 🚀 Added — Design Review Engine

- **Full design review** (`figma_design_review`): Run 7-dimension quality audit on any Figma file, returns scored report (0–100, A–F grade)
- **Color lint** (`figma_review_colors`): Detect hardcoded fills, strokes, gradients, shadows, and opacity not bound to variables
- **Spacing lint** (`figma_review_spacing`): Check padding, gap, corner radius, off-grid values, missing Auto Layout
- **Typography lint** (`figma_review_typography`): Validate text styles, font sizes, line heights, font families, text colors
- **Component lint** (`figma_review_components`): Audit detached instances, missing main components, excessive overrides, unused components, naming conventions
- **Token coverage** (`figma_review_token_coverage`): Calculate Design Token / variable binding percentage across fills, strokes, spacing, typography, effects
- **Structure lint** (`figma_review_structure`): Check default layer names, empty frames, deep nesting, hidden layer bloat
- **Accessibility lint** (`figma_review_a11y`): WCAG contrast ratio (AA/AAA), minimum text size, touch target dimensions

### 🚀 Added — Base Data Tools

- `figma_get_file_structure` — Get page and layer tree structure (name, type, size)
- `figma_get_variables` — Get all Design Tokens / Variables (requires Enterprise plan, graceful degradation)
- `figma_get_components` — Get all components and component sets
- `figma_get_styles` — Get all published styles (color, text, effect, grid)
- `figma_get_file_versions` — Get version history for change tracking
- `figma_export_images` — Export nodes as images (PNG, SVG, PDF, JPG)

### 🚀 Added — Core Infrastructure

- Review engine pipeline: fetch → cache → traverse → lint → score → persist
- File snapshot caching in SQLite (`file_snapshots` table)
- Review report persistence (`review_reports` + `review_issues` tables)
- Customizable rule configuration (`review_rules` table)
- Color utilities: WCAG 2.1 contrast ratio, relative luminance, hex/rgba conversion
- Separate rate limiter for heavy file fetches (1 concurrent, 2s interval, 120s timeout)
- Figma Variables API with graceful degradation for non-Enterprise accounts

### 📦 Database

- Added `file_snapshots` table — File JSON metadata cache
- Added `review_reports` table — Historical review tracking with scores and grades
- Added `review_issues` table — Individual findings with severity, rule ID, node reference
- Added `review_rules` table — Per-rule enable/disable and severity override
- Added indexes: `idx_review_reports_file`, `idx_review_issues_report`, `idx_review_issues_dimension`

### 🔧 Changed

- Tool count: 6 → 20 (8 review + 6 base data + 6 comment workflow)
- Upgraded Figma API client with 7 new methods (`getFile`, `getFileNodes`, `getImages`, `getFileVersions`, `getLocalVariables`, `getPublishedVariables`)
- Health endpoint version: `3.1` → `4.0`
- Server startup log: "Figma Comment Pilot" → "Figma Design Pilot"

### 🧪 Fixed

- Vitest 4 compatibility: removed explicit `import { describe, it, expect } from 'vitest'` (conflicts with `globals: true` in Vitest 4)
- Updated SSE transport tests to match Streamable HTTP Transport (`/mcp` instead of `/message` + `/sse`)

---

## [3.1.0] - 2026-02-01

### 🔧 Changed

- Migrated from legacy SSE transport to Streamable HTTP Transport (`/mcp` endpoint)
- Removed deprecated `/sse` and `/message` endpoints

---

## [3.0.0] - 2026-01-28

### 🚀 Added

- SSE transport mode (`--transport=sse`) for web-based AI clients
- Express server with `/sse`, `/message`, `/health`, `/webhook` endpoints
- CORS support for cross-origin requests
- GitHub Actions CI workflow
- README documentation and project setup guide

---

## [2.0.0] - 2026-01-25

### 🚀 Added — Comment Workflow (Initial Release)

- **6 MCP tools**: `figma_sync_comments`, `figma_post_reply`, `figma_set_status`, `figma_get_thread`, `figma_list_pending`, `figma_delete_own_reply`
- Thread-centric comment model — groups flat Figma comments into conversation threads
- Outbox pattern — idempotent write operations with automatic retry (PENDING → CONFIRMED / FAILED)
- Status reconciliation — emoji reactions → workflow states (OPEN / PENDING / DONE / WONTFIX)
- OAuth 2.0 authentication with localhost callback flow
- Personal Access Token (PAT) support as alternative to OAuth
- SQLite database with better-sqlite3 + Kysely query builder
- Bottleneck rate limiting (5 concurrent reads, 1 write/sec)
- Prompt injection guard and bot self-reply prevention
- Webhook signature verification (HMAC-SHA256)
- stdio transport for Claude Desktop / Cursor / CodeBuddy

[4.0.0]: https://github.com/Mr-wang007s/figma-design-pilot-mcp/compare/v3.1.0...v4.0.0
[3.1.0]: https://github.com/Mr-wang007s/figma-design-pilot-mcp/compare/v3.0.0...v3.1.0
[3.0.0]: https://github.com/Mr-wang007s/figma-design-pilot-mcp/compare/v2.0.0...v3.0.0
[2.0.0]: https://github.com/Mr-wang007s/figma-design-pilot-mcp/releases/tag/v2.0.0
