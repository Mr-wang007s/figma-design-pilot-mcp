# Figma Comment Pilot (MCP Server Edition)
## 产品需求文档 (PRD) V3.1

**文档状态**: FINAL (Production Ready)
**版本**: 3.1
**日期**: 2026-02-09
**架构决策**: Stateful MCP Server (基于本地 SQLite + Outbox 模式)
**修订摘要**: 修复 Oracle 审查指出的 5 大核心缺陷（工作单元线程化、缺失工具、Outbox 幂等机制、Schema 补全、状态调和规则）。

---

## 1. 产品概述 (Product Overview)

### 1.1 名称与定义
**产品名称**: Figma Comment Pilot MCP
**定义**: 一个符合 Model Context Protocol (MCP) 标准的有状态服务端应用。作为 AI Agent 与 Figma 文件之间的智能网关，它将 Figma 原始的扁平评论流转换为以**线程 (Thread)** 为单位的结构化工作流，并利用本地数据库解决 Figma API 缺失状态管理和过滤能力的痛点。

### 1.2 核心价值
*   **以线程为中心 (Thread-Centric)**: 将"零散评论"聚合为"会话线程"，提供完整的上下文（根评论+回复+状态）。
*   **强一致性与幂等性 (Idempotency)**: 引入 `operations` 出站箱 (Outbox) 模式，确保在网络抖动或崩溃重启后，AI 的操作（回复/标记）不丢失、不重复。
*   **本地状态权威 (Local Truth)**: 建立"本地 DB 为主，Figma UI 为辅"的调和机制，支持自定义状态流转。
*   **通用协议标准**: 通过 MCP 协议，一次部署，同时服务于 openClaw、Claude Desktop 和 Cursor。

---

## 2. 问题定义 (Problem Definition)

| 痛点 | 描述 | 影响 |
| :--- | :--- | :--- |
| **API 返回扁平化** | Figma API 返回无序或仅按时间排序的评论列表，缺乏对话结构。 | AI 难以理解上下文，容易对同一问题的不同回复产生幻觉。 |
| **缺乏原子性操作** | 网络超时可能导致 Agent 以为失败而重试，实际上 Figma 已创建评论。 | 产生重复回复，干扰设计师工作。 |
| **状态缺失** | Figma 仅有"Resolve"，且 API 不支持筛选。 | 每次 Sync 都要处理数千条历史数据，Token 浪费严重。 |
| **自身回复死循环** | AI 可能对自己生成的回复进行再次回复。 | 导致"Bot vs Bot"的无限对话风暴。 |

---

## 3. 产品目标与成功指标 (Goals & Metrics)

*   **同步准确率 (Recall)**: 100%（通过 Full Sync + Diff 机制保证不漏数据）。
*   **操作幂等率**: 100%（同一操作指纹在 24小时内仅执行一次）。
*   **状态识别准确率**: > 99%（准确解析 Emoji 语义）。
*   **响应延迟**: 增量同步 < 3秒 (1000条评论规模)。

---

## 4. 系统架构 (System Architecture)

### 4.1 架构图
```mermaid
graph TD
    subgraph "AI Client"
        Agent[OpenClaw/Claude]
    end

    subgraph "MCP Server (Localhost/Container)"
        Router[MCP Router]
        Auth[OAuth Manager]
        
        subgraph "Core Logic"
            Sync[Sync Engine (Diff & Grouping)]
            Outbox[Operations Manager]
            Reconcile[State Reconciler]
        end
        
        subgraph "Persistence"
            DB[(SQLite)]
            note[Tables: comments, operations, sync_state]
        end
    end

    subgraph "External"
        FigmaAPI[Figma REST API]
    end

    Agent -- JSON-RPC --> Router
    Router --> Sync
    Router --> Outbox
    
    Sync -- 1. Fetch & Group --> FigmaAPI
    Sync -- 2. Update State --> DB
    
    Outbox -- 1. Enqueue Op --> DB
    Outbox -- 2. Execute with Lock --> FigmaAPI
    Outbox -- 3. Confirm/Fail --> DB
```

### 4.2 核心设计模式
1.  **Unit of Work = Thread**: 所有的处理逻辑（读取、分析、回复、状态变更）都以"根评论及其子回复"作为一个整体单元。
2.  **Outbox Pattern (出站箱模式)**:
    *   AI 调用 `reply` 工具 -> **不直接调用 Figma API**。
    *   而是向 SQLite `operations` 表插入一条 `PENDING` 记录。
    *   后台 Worker（或触发式）读取 PENDING 任务，执行 API 调用。
    *   成功后更新为 `CONFIRMED`；失败则记录 Error 并重试/标记 `FAILED`。
3.  **Single Writer Lock**: 针对同一个 `file_key`，同一时间只能有一个 Sync 或 Write 操作在执行，防止竞态条件。

---

## 5. 数据模型 (Data Model)

### 5.1 SQLite Schema (Production Ready)

```sql
-- 1. 评论表 (核心数据，以单条评论为行，但在逻辑上关联)
CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,                -- Figma Comment ID
    file_key TEXT NOT NULL,
    parent_id TEXT,                     -- 若为根评论则为 NULL
    root_id TEXT,                       -- 冗余字段，方便查询整条线程 (若为根则 = id)
    is_root BOOLEAN GENERATED ALWAYS AS (parent_id IS NULL) STORED,
    
    message_text TEXT NOT NULL,         -- 原始内容
    author_id TEXT NOT NULL,            -- 用户 ID (用于区分 Bot)
    author_handle TEXT,                 -- 用户名
    created_at DATETIME NOT NULL,
    updated_at DATETIME,                -- Figma 侧最后更新时间
    deleted_at DATETIME,                -- 软删除标记
    
    reactions_json TEXT,                -- JSON Array: [{"emoji": "👀", "user_id": "..."}]
    
    -- 状态字段
    remote_status_emoji TEXT,           -- Figma 侧当前生效的状态 Emoji (如 ✅)
    local_status TEXT DEFAULT 'OPEN',   -- OPEN, PENDING, DONE, WONTFIX
    reply_posted_by_ai BOOLEAN DEFAULT 0, -- 是否由本系统生成
    
    -- 索引
    INDEX idx_file_root (file_key, root_id),
    INDEX idx_status (local_status)
);

-- 2. 操作出站箱 (幂等与重试)
CREATE TABLE IF NOT EXISTS operations (
    op_id TEXT PRIMARY KEY,             -- UUID
    idempotency_key TEXT NOT NULL,      -- hash(file + root + action + content)
    file_key TEXT NOT NULL,
    
    op_type TEXT NOT NULL,              -- 'REPLY', 'ADD_REACTION', 'REMOVE_REACTION'
    payload_json TEXT NOT NULL,         -- API 请求参数
    
    state TEXT DEFAULT 'PENDING',       -- PENDING, PROCESSING, CONFIRMED, FAILED
    retry_count INTEGER DEFAULT 0,
    error_message TEXT,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(idempotency_key)             -- 数据库级唯一性约束，防止重复提交
);

-- 3. 同步状态 (断点续传)
CREATE TABLE IF NOT EXISTS sync_state (
    file_key TEXT PRIMARY KEY,
    last_full_sync_at DATETIME,
    last_event_id TEXT,                 -- Webhook cursor (备用)
    bot_user_id TEXT,                   -- 当前 Bot 的 User ID (用于识别自己)
    sync_config_json TEXT               -- {"ignored_users": ["..."]}
);

-- 4. 全局配置 (Token)
CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT
);
```

### 5.2 Thread DTO (Data Transfer Object)
`figma_sync_comments` 和 `figma_get_thread` 返回的数据结构：
```typescript
interface Thread {
  id: string;             // 根评论 ID
  file_key: string;
  status: "OPEN" | "PENDING" | "DONE" | "WONTFIX";
  needs_attention: boolean; // 根据策略计算 (e.g. status=OPEN && last_reply != bot)
  root_comment: {
    id: string;
    text: string;
    author: { id: string; handle: string };
    created_at: string;
    reactions: Array<{ emoji: string; count: number; me_reacted: boolean }>;
  };
  replies: Array<{
    id: string;
    text: string;
    author: { id: string; handle: string };
    created_at: string;
    is_ai: boolean;
  }>;
}
```

---

## 6. 核心逻辑 (Core Logic)

### 6.1 幂等性设计 (Idempotency)
所有写入操作（Reply, Set Status）必须生成 `idempotency_key`：
*   **Formula**: `SHA256(file_key + root_comment_id + op_type + normalized_content + agent_identity)`
*   **Normalized Content**: 去除首尾空格，转小写。
*   **流程**:
    1.  Agent 请求回复。
    2.  Server 计算 Key。
    3.  尝试 Insert `operations` 表。
    4.  若违反 `UNIQUE` 约束 -> 抛出异常 "Duplicate Operation Detected" 或返回缓存的成功结果。

### 6.2 状态调和规则 (Reconciliation Table)
当 Figma 界面上的 Reaction 与本地 DB 状态冲突时，执行以下规则：

| 场景 | Figma Reaction (Display) | Local DB (Truth) | 决策 (Action) | 最终 Local Status |
| :--- | :--- | :--- | :--- | :--- |
| **Sync** | 无 | OPEN | 保持不变 | OPEN |
| **Sync** | ✅ (Check) | OPEN/PENDING | 人工在 Figma 标记完成 -> 信任人工 | DONE |
| **Sync** | 🚫 (No Entry) | OPEN/PENDING | 人工在 Figma 标记拒绝 -> 信任人工 | WONTFIX |
| **Sync** | 无 (被移除) | DONE | 用户移除了 Emoji -> 重新打开 | OPEN |
| **Action** | (Bot Set Status) | PENDING | Bot 添加 👀 -> 更新本地 | PENDING |
| **Conflict**| ✅ + 🚫 | ANY | 冲突状态 -> 优先取 DONE | DONE |

**原则**:
1.  **用户行为优先**: 如果 Figma 上出现了人工打的 ✅，本地无条件同步为 DONE。
2.  **Bot 行为记录**: Bot 的操作先更新 Local，再异步推送到 Figma。

---

## 7. MCP Server 接口定义 (Tools)

### Tool 1: `figma_sync_comments` (核心)
*   **描述**: 全量拉取评论，执行 Diff，返回**以线程为单位**的更新列表。仅返回未处理 (OPEN/PENDING) 或 状态发生变更的线程。
*   **Input Schema**:
    ```json
    {
      "type": "object",
      "properties": {
        "file_key": { "type": "string", "description": "Figma file key" },
        "force_full_sync": { "type": "boolean", "description": "Ignore cache, diff against empty state", "default": false }
      },
      "required": ["file_key"]
    }
    ```
*   **Output**: `{ threads: Thread[], stats: { new: number, updated: number } }`

### Tool 2: `figma_post_reply`
*   **描述**: 回复指定线程。**必须**针对 Root Comment ID 回复。
*   **Input Schema**:
    ```json
    {
      "type": "object",
      "properties": {
        "file_key": { "type": "string" },
        "root_comment_id": { "type": "string", "description": "ID of the thread/root comment" },
        "message": { "type": "string", "description": "Reply content. DO NOT include emoji status here." }
      },
      "required": ["file_key", "root_comment_id", "message"]
    }
    ```

### Tool 3: `figma_set_status`
*   **描述**: 通过添加 Emoji 修改线程状态。
*   **Input Schema**:
    ```json
    {
      "type": "object",
      "properties": {
        "file_key": { "type": "string" },
        "comment_id": { "type": "string" },
        "status": { "type": "string", "enum": ["PENDING", "DONE", "WONTFIX"] }
      },
      "required": ["file_key", "comment_id", "status"]
    }
    ```

### Tool 4: `figma_get_thread` (新增)
*   **描述**: 获取单个线程的完整上下文（包含所有历史回复）。
*   **Input Schema**:
    ```json
    {
      "type": "object",
      "properties": {
        "file_key": { "type": "string" },
        "thread_id": { "type": "string" }
      },
      "required": ["file_key", "thread_id"]
    }
    ```

### Tool 5: `figma_list_pending` (新增)
*   **描述**: 查询本地数据库，列出所有待处理 (Status=OPEN) 的线程，不发起网络请求。用于快速获取任务清单。
*   **Input Schema**:
    ```json
    {
      "type": "object",
      "properties": {
        "file_key": { "type": "string" },
        "limit": { "type": "number", "default": 20 }
      },
      "required": ["file_key"]
    }
    ```

### Tool 6: `figma_delete_own_reply` (新增)
*   **描述**: 删除由 Bot 自己发布的回复（用于纠错）。仅能删除 `operations` 表中记录过的回复。
*   **Input Schema**:
    ```json
    {
      "type": "object",
      "properties": {
        "file_key": { "type": "string" },
        "comment_id": { "type": "string" }
      },
      "required": ["file_key", "comment_id"]
    }
    ```

---

## 8. 状态协议与规范 (Status Protocol)

### 8.1 Emoji 映射
| 状态 | Emoji | 含义 |
| :--- | :--- | :--- |
| **OPEN** | (无) | 初始状态，等待处理 |
| **PENDING** | 👀 (Eyes) | AI 已收到/正在处理/已回复询问 |
| **DONE** | ✅ (Check Mark) | 问题已解决/已采纳 |
| **WONTFIX** | 🚫 (Prohibited) | 不予修复/设计决策 |

### 8.2 身份识别规范
*   **Bot Reply Prefix**: 所有 AI 生成的回复必须以 `[FCP]` (Figma Comment Pilot) 开头，或包含特定的不可见零宽字符签名，以便程序识别。
    *   Example: `[FCP] 建议将按钮颜色调整为 #FF0000...`
*   **Self-Detection**: 在 Sync 阶段，如果 `comment.author_id` == `sync_state.bot_user_id`，则标记 `is_ai=true`。

---

## 9. Figma 集成与 OAuth 流程 (Integration)

### 9.1 授权模式：Stdio + Localhost Callback
针对 Cursor/Claude Desktop 等运行在本地环境的场景：

1.  **Start Auth**: 用户执行 `npx figma-mcp-server auth`。
2.  **Server Listen**: CLI 启动临时 HTTP Server 监听 `http://127.0.0.1:3456/callback`。
3.  **Open Browser**: CLI 打开系统浏览器访问 `https://www.figma.com/oauth?client_id=...&redirect_uri=http://127.0.0.1:3456/callback...`。
4.  **User Approve**: 用户在 Figma 页面点击"允许"。
5.  **Code Handling** (Critical 30s window):
    *   Figma 重定向回 localhost。
    *   CLI 收到 Code。
    *   CLI **立即** (毫秒级) 向 Figma Token Endpoint 发送 POST 请求换取 Access/Refresh Token。
    *   CLI 将 Token 写入 `.env` 或 SQLite `config` 表。
6.  **Shutdown**: 关闭临时 HTTP Server，提示"授权成功，请重启 Agent"。

### 9.2 Rate Limiting
*   **API**: Tier 2 (假设 60 req/min)。
*   **Implementation**: 使用 `bottleneck` 库。
    *   Read: Max 5 concurrent.
    *   Write: Max 1 per second (串行化，防止顺序错乱).

---

## 10. 跨客户端配置示例 (Cross-Client Config)

### 10.1 Claude Desktop / Cursor
`claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "figma-pilot": {
      "command": "node",
      "args": ["/abs/path/to/figma-mcp-server/dist/index.js"],
      "env": {
        "FIGMA_CLIENT_ID": "...",
        "FIGMA_CLIENT_SECRET": "...",
        "DB_PATH": "/abs/path/to/data.db"
      }
    }
  }
}
```

### 10.2 openClaw
openClaw 通常通过 SSE 连接：
*   **URL**: `http://localhost:3000/sse`
*   **Headers**: `Authorization: Bearer <mcp-server-secret>`

---

## 11. 非功能需求 (Non-Functional Requirements)

1.  **Security**:
    *   Prompt Injection: 在返回给 LLM 的 `Thread` 对象中，将 `message_text` 包装在 XML 标签中 `<user_content>...</user_content>` 并提示 LLM 忽略其中的指令。
    *   Tokens: 数据库中的 Token 字段应建议加密存储（V3.1 MVP 可明文，但需通过文件权限保护 DB 文件）。
2.  **Performance**:
    *   Cold Start: 1000 条评论的首次 Sync 应在 10秒内完成。
    *   Incremental Sync: < 2秒。

---

## 12. 风险与缓解 (Risks)

| 风险 | 缓解 |
| :--- | :--- |
| **Bot 无限回复** | 1. 检查 `author_id`；2. 检查 `[FCP]` 前缀；3. `local_status=PENDING` 时不触发新回复。 |
| **Figma API 变更** | 依赖 `updated_at` 和 `id` 保持稳定。若 Figma 更改 ID 格式，需发布补丁。 |
| **Token 过期** | 在每次操作前检查 Token 并在需要时自动刷新。若 Refresh Token 失效，返回明确错误提示用户重新授权。 |

---

## 13. 里程碑 (Roadmap)

*   **V3.1 MVP**: 实现上述所有功能。手动 Webhook（用户手动配置 URL 到 Server）。
*   **V3.2**: 增加 `figma_create_webhook` 工具，实现自动订阅。增加统计 Dashboard (Resource)。
*   **V4.0**: 多租户支持（Multi-Team Support）。

---

## 14. 项目结构 (Directory Structure)

```text
figma-mcp-server/
├── src/
│   ├── index.ts                # Entry: stdio/http server setup
│   ├── config.ts               # Env vars & Zod validation
│   ├── db/
│   │   ├── client.ts           # Better-sqlite3 instance
│   │   ├── schema.sql          # DDL
│   │   └── migrations/         # Migration files
│   ├── figma/
│   │   ├── api.ts              # Axios client + Rate Limiter
│   │   ├── auth.ts             # OAuth flow & Token refresh
│   │   └── types.ts            # Figma API Types
│   ├── core/
│   │   ├── sync.ts             # Sync Engine (Fetch -> Diff -> DB)
│   │   ├── operations.ts       # Outbox & Idempotency logic
│   │   └── reconciler.ts       # Status logic
│   ├── mcp/
│   │   ├── router.ts           # Tool/Resource registration
│   │   └── tools/              # Individual tool handlers
│   │       ├── sync_comments.ts
│   │       ├── post_reply.ts
│   │       ├── set_status.ts
│   │       └── ...
│   └── utils/
│       ├── hash.ts             # Idempotency key generation
│       └── sanitizer.ts        # Prompt injection guard
├── bin/
│   └── auth-cli.ts             # Standalone OAuth CLI tool
├── package.json
└── tsconfig.json
```

---

## 技术栈 (Tech Stack)

*   **Runtime**: Node.js >= 18
*   **Language**: TypeScript 5.x
*   **Framework**: `@modelcontextprotocol/sdk` (Official SDK)
*   **Database**: `better-sqlite3` + `kysely` (Query Builder)
*   **HTTP Client**: `axios` (Better error handling)
*   **Utils**: `zod` (Schema validation), `dotenv`
