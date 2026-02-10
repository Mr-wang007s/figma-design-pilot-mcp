# Figma Comment Pilot MCP Server — V3.1 实施计划

## 当前状态

| 维度 | 状态 | 说明 |
|:-----|:-----|:-----|
| **代码完成度** | ✅ 100% | 22 个源文件已实现，TypeScript 零错误编译 |
| **运行时验证** | ❌ 0% | 从未启动运行，无实际 Figma API 调用验证 |
| **测试覆盖率** | ✅ 91 tests | 7 个测试文件，全部通过 |
| **文档** | ✅ 完成 | README.md、AGENTS.md |
| **CI/CD** | ✅ 完成 | GitHub Actions (Node 18/20/22) |

### PRD 差距分析

| PRD 要求 | 当前实现 | 状态 |
|:---------|:---------|:-----|
| stdio + SSE 双模式 | ✅ `--transport=stdio\|sse` | 已完成 |
| 手动 Webhook 接收 | ✅ `POST /webhook` + HMAC 签名验证 | 已完成 |
| 幂等性 100% | ✅ 代码已写 + 测试覆盖 | 已验证 |
| 增量同步 <3s | ⚠️ 代码已写，未测量 | 需性能基准测试 |
| 6 个 MCP 工具 | ✅ 全部实现 | 已完成 |
| OAuth 2.0 流程 | ✅ 实现 | 未实际运行验证 |
| 速率限制 | ✅ Bottleneck (读5并发, 写1/s) | 已完成 |
| Prompt 注入防护 | ✅ `<user_content>` 包裹 + HTML 转义 | 已测试 |

---

## 第一阶段：环境就绪 & 冒烟测试（~4h）✅ 已完成

> **目标**：确保代码能跑通，项目健康度验证。

| # | 任务 | 状态 |
|---|------|------|
| 1.1 | 完善 `.gitignore`（`*.db`, `.env`, `coverage/`, `logs/`） | ✅ |
| 1.2 | `npm run build` 编译验证 | ✅ |
| 1.3 | typecheck 验证项目健康度 | ✅ |
| 1.4 | 审查所有源文件，发现并修复潜在运行时问题 | ✅ |

---

## 第二阶段：测试保护网（~8h）✅ 已完成

> **目标**：为核心逻辑建立测试，确保同步引擎和状态机逻辑正确。

| # | 任务 | 测试数 | 状态 |
|---|------|--------|------|
| 2.1 | 安装 vitest，配置 `vitest.config.ts` | — | ✅ |
| 2.2 | Sync Engine 单元测试 + 集成测试 | 19 | ✅ |
| 2.3 | Outbox 单元测试（幂等性, 状态机, 重试, cleanup） | 19 | ✅ |
| 2.4 | Reconciler + Hash/Sanitizer 单元测试 | 46 | ✅ |
| 2.5 | SSE Transport 测试 | 7 | ✅ |

**验证清单**：
- [x] `npm test` 全部通过（91/91）
- [x] 核心模块覆盖：Sync、Outbox、Reconciler、Hash、Sanitizer、SSE

---

## 第三阶段：HTTP/SSE 传输层 & Webhook（~10h）✅ 已完成

> **目标**：满足 PRD 的 SSE（openClaw）和手动 Webhook 需求。

| # | 任务 | 涉及文件 | 状态 |
|---|------|----------|------|
| 3.1 | 改造 `index.ts` 支持 `--transport=stdio\|sse` 参数 | `src/index.ts` | ✅ |
| 3.2 | 实现 SSE Transport（`/sse` + `/message`） | `src/transport/sse.ts` | ✅ |
| 3.3 | 实现 `POST /webhook` + Figma HMAC-SHA256 签名验证 | `src/transport/sse.ts` | ✅ |
| 3.4 | Webhook → 触发增量同步 | `src/transport/sse.ts` | ✅ |
| 3.5 | SSE + Webhook 测试 | `tests/transport/sse.test.ts` | ✅ |

**验证清单**：
- [x] `--transport=sse` 启动后，`/health` 返回 200
- [x] `/message` 无 sessionId 返回 400
- [x] `/webhook` 签名验证正确（401 on invalid, 200 on valid）
- [x] `/sse` 返回 `text/event-stream` content-type

---

## 第四阶段：可观测性 & 部署准备（~6h）✅ 已完成

> **目标**：生产环境就绪，问题可追踪。

| # | 任务 | 涉及文件 | 状态 |
|---|------|----------|------|
| 4.1 | 编写 `README.md` | `README.md` | ✅ |
| 4.2 | 编写 `AGENTS.md`（AI agent 开发指南） | `AGENTS.md` | ✅ |
| 4.3 | 创建 GitHub Actions CI（Node 18/20/22） | `.github/workflows/ci.yml` | ✅ |

---

## 待完成项（V3.1 收尾）

| # | 任务 | 优先级 | 预估 |
|---|------|--------|------|
| 5.1 | 引入 `pino` 结构化日志，替换所有 `console.error/log` | 中 | 2h |
| 5.2 | 性能基准测试：1000 条评论同步 <10s（冷启动）、<3s（增量） | 低 | 1.5h |
| 5.3 | 实际 Figma API 端到端验证（需真实 OAuth 凭据） | 高 | 1h |
| 5.4 | OAuth Token 自动刷新逻辑验证 | 高 | 1h |

---

## 风险矩阵

| 风险 | 等级 | 缓解措施 |
|:-----|:-----|:---------|
| OAuth Token 过期导致服务中断 | 🔴 高 | 需实际运行验证 `auth.ts` 的自动刷新逻辑 |
| Figma API 429 限流 | 🟡 中 | `bottleneck` 已配置，Webhook 模式减少主动轮询 |
| 本地 DB 与 Figma 状态冲突 | 🟡 中 | Reconciler 测试覆盖所有 6 种场景 |
| SSE 长连接稳定性 | 🟡 中 | 需心跳机制 + 断线重连测试 |

---

## V3.2 路线图（未来）

| 功能 | 描述 |
|:-----|:-----|
| 自动 Webhook 订阅 | 通过 Figma API 自动注册/注销 Webhook |
| 统计仪表盘 | 线程处理量、响应时间、错误率 |
| 多文件并行同步 | 支持同时监控多个 Figma 文件 |

## V4.0 路线图（未来）

| 功能 | 描述 |
|:-----|:-----|
| 多租户 | 支持多个 Figma 团队/组织 |
| 持久化队列 | 替换内存锁为 Redis/BullMQ |

---

## 新增/修改文件清单

```
新增:
  vitest.config.ts
  tests/helpers.ts
  tests/core/reconciler.test.ts
  tests/core/operations.test.ts
  tests/core/sync.test.ts
  tests/utils/hash.test.ts
  tests/utils/sanitizer.test.ts
  tests/integration/sync-flow.test.ts
  tests/transport/sse.test.ts
  src/transport/sse.ts
  README.md
  AGENTS.md
  .github/workflows/ci.yml

修改:
  .gitignore (添加 coverage/, logs/, *.log, *.tsbuildinfo)
  package.json (scripts + devDependencies)
  src/config.ts (SSE_PORT, WEBHOOK_SECRET)
  src/index.ts (双模式传输)
  .env.example (新增 SSE_PORT, WEBHOOK_SECRET)
```
