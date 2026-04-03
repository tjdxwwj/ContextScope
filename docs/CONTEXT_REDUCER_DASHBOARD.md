# Context Reducer Dashboard

## 概述

Context Reducer Dashboard 是 ContextScope 前端的第 4 个 tab（位于"全局总览"视图中），用于展示上下文裁剪的统计数据和日志详情。

## 架构

### 数据流

```
OpenClaw Agent
  ↓ before_prompt_build hook
ContextScope 后端 (HooksRouter)
  ↓ ContextReducerService.reduce()
  ↓ runPipeline() 执行 4 个 reducer
  ↓ ReductionLogSqliteRepository.save()
SQLite (reduction_logs 表)
  ↓ GET /api/reduction-logs
  ↓ GET /api/reduction-logs/summary
前端 ContextReducerPanel
```

### Reducer Pipeline

Pipeline 按固定顺序执行，每个 reducer 可通过配置独立启停：

| 顺序 | Reducer | 功能 | 关键配置 |
|------|---------|------|----------|
| 1 | `duplicateDeduper` | 去除重复的 tool 结果 | `enabled` |
| 2 | `toolInputTrimmer` | 裁剪旧 tool call 的输入参数 | `enabled`, `maxInputChars` |
| 3 | `contentPreviewer` | 大型 tool 结果只保留 head+tail | `enabled`, `minContentChars`, `headLines`, `tailLines` |
| 4 | `toolResultPrioritizer` | 低优先级写操作结果截断 | `enabled`, `lowPriorityMaxChars` |

所有 reducer 原地修改 messages 数组（引用语义），`preserveRecentTurns` 控制最近 N 轮不动。

### 配置

通过 OpenClaw 插件配置（`~/.openclaw/openclaw.json` 或 `openclaw.yaml`）：

```yaml
plugins:
  contextscope:
    contextReducer:
      enabled: true
      preserveRecentTurns: 2
      duplicateDeduper:
        enabled: true
      toolInputTrimmer:
        enabled: true
        maxInputChars: 200
      contentPreviewer:
        enabled: true
        minContentChars: 500
        headLines: 10
        tailLines: 5
      toolResultPrioritizer:
        enabled: true
        lowPriorityMaxChars: 100
      logging:
        enabled: true
```

## 后端 API

### GET /api/reduction-logs

返回裁剪日志列表。

**参数：**
- `limit` (number, 可选, 默认 100) — 返回条数
- `sessionId` (string, 可选) — 按 session 过滤

**响应：**
```json
{
  "ok": true,
  "total": 42,
  "data": [
    {
      "id": 1,
      "timestamp": "2026-04-03T10:00:00.000Z",
      "sessionId": "xxx",
      "stage": "before_prompt_build",
      "messageCountBefore": 20,
      "messageCountAfter": 20,
      "tokensBefore": 15000,
      "tokensAfter": 12000,
      "tokensSaved": 3000,
      "reductions": [
        {
          "reducer": "toolInputTrimmer",
          "tokensSaved": 2000,
          "itemsProcessed": 5,
          "details": [
            {
              "toolName": "Read",
              "contentBefore": "...",
              "contentAfter": "..."
            }
          ]
        }
      ],
      "durationMs": 12
    }
  ]
}
```

### GET /api/reduction-logs/summary

返回裁剪统计摘要。

**参数：**
- `sessionId` (string, 可选) — 按 session 过滤

**响应：**
```json
{
  "ok": true,
  "data": {
    "totalRecords": 42,
    "totalTokensSaved": 150000,
    "totalTokensBefore": 500000,
    "totalTokensAfter": 350000,
    "averageSavingRate": 30.0,
    "reducerContributions": {
      "toolInputTrimmer": { "tokensSaved": 80000, "count": 120 },
      "contentPreviewer": { "tokensSaved": 50000, "count": 80 },
      "duplicateDeduper": { "tokensSaved": 15000, "count": 30 },
      "toolResultPrioritizer": { "tokensSaved": 5000, "count": 10 }
    }
  }
}
```

## 前端组件

### ContextReducerPanel

文件：`frontend/src/components/ContextReducerPanel.tsx`

包含 4 个子组件：

| 组件 | 功能 |
|------|------|
| **SummaryCards** | 3 个统计卡片：Total Tokens Saved / Total Records / Avg Saving Rate |
| **TokenChart** | echarts 折线图，展示 Before/After/Saved token 趋势 |
| **ReducerPieChart** | echarts 环形图，展示各 reducer 的贡献占比 |
| **LogTable** | antd Table，可展开行显示 detail before/after 对比 |

组件挂载时通过 `useEffect` 加载数据（`fetchReductionLogs` + `fetchReductionSummary`），独立管理 loading 状态。

### 依赖

- `echarts` + `echarts-for-react` — 图表渲染
- `antd` (Table, Tag) — 日志表格
- `lucide-react` — 图标

## 数据库

### reduction_logs 表

```sql
CREATE TABLE reduction_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  sessionId TEXT NOT NULL,
  stage TEXT NOT NULL,
  messageCountBefore INTEGER NOT NULL,
  messageCountAfter INTEGER NOT NULL,
  tokensBefore INTEGER NOT NULL,
  tokensAfter INTEGER NOT NULL,
  tokensSaved INTEGER NOT NULL,
  reductions TEXT,          -- JSON: ReductionEntry[]
  durationMs INTEGER NOT NULL,
  createdAt INTEGER,
  updatedAt INTEGER
);
```

## 变更文件清单

| 文件 | 变更类型 |
|------|----------|
| `src/infrastructure/http/routes/api.router.ts` | 修改 — 新增 2 个 API 端点 |
| `src/infrastructure/http/routes/hooks.router.ts` | 修改 — 修复 DI 注入 + llm_output 容错 |
| `src/infrastructure/http/routes/static.router.ts` | 修改 — 修复 Express 5 通配符语法 |
| `src/infrastructure/database/sqlite.client.ts` | 修改 — 自动创建数据库目录 |
| `src/app/main.ts` | 新增 — 独立服务器启动入口 |
| `frontend/src/types.ts` | 修改 — 新增 Context Reducer 类型 |
| `frontend/src/data/apiClient.ts` | 修改 — 新增 2 个 API 函数 |
| `frontend/src/components/ContextReducerPanel.tsx` | 新增 — Dashboard 面板组件 |
| `frontend/src/App.tsx` | 修改 — 新增 "Context Reducer" tab |
| `frontend/vite.config.ts` | 修改 — 修复 proxy 端口和 rewrite |
| `package.json` | 修改 — 修复 start:server 入口路径 |
