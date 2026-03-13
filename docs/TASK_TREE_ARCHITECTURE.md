# ContextScope 任务树架构技术文档

**版本**: v2.0.0  
**日期**: 2026-03-13  
**状态**: 设计稿

---

## 📋 目录

1. [概述](#1-概述)
2. [架构设计](#2-架构设计)
3. [数据结构](#3-数据结构)
4. [核心模块](#4-核心模块)
5. [执行流程](#5-执行流程)
6. [存储设计](#6-存储设计)
7. [异常处理](#7-异常处理)
8. [性能优化](#8-性能优化)

---

## 1. 概述

### 1.1 背景

ContextScope 插件需要解决以下问题：

1. **单次任务多次 LLM 调用**：用户发起一个复杂任务，Agent 内部可能调用多次 LLM 才能完成
2. **多 Agent 协作**：主任务可能 spawn 多个子任务（subagent），需要聚合统计
3. **完整的任务视图**：用户需要看到一个任务的完整执行情况，包括所有子任务

### 1.2 目标

| 目标 | 说明 |
|------|------|
| **准确追踪** | 100% 覆盖所有 LLM 调用和子任务 |
| **自动聚合** | 自动计算任务树的聚合统计 |
| **零配置** | 无需手动标记任务边界 |
| **向后兼容** | 不影响现有数据结构 |

### 1.3 核心概念

| 概念 | 说明 |
|------|------|
| **Task（任务）** | 一次完整的用户请求执行过程 |
| **Run（运行）** | 单次 LLM 调用（input + output） |
| **Session（会话）** | 用户与 Agent 的对话会话 |
| **Subagent（子任务）** | 通过 sessions_spawn 创建的独立执行单元 |
| **Task Tree（任务树）** | 主任务和所有子任务的树状结构 |

### 1.4 任务层级示例

```
用户任务："帮我研究 AI 新闻并生成报告"
│
├─ Task #1 (主任务)
│   ├─ sessionId: abc123
│   ├─ sessionKey: agent:main:main
│   │
│   ├─ Run #1: 理解任务 (10,000 tokens)
│   ├─ Run #2: 规划步骤 (12,000 tokens)
│   │
│   ├─ sessions_spawn → Subagent #1
│   │   └─ Task #2 (子任务)
│   │       ├─ sessionId: def456
│   │       ├─ sessionKey: agent:main:subagent:xxx
│   │       ├─ Run #1: 搜索新闻 (8,000 tokens)
│   │       └─ Run #2: 整理结果 (9,000 tokens)
│   │
│   ├─ sessions_spawn → Subagent #2
│   │   └─ Task #3 (子任务)
│   │       ├─ sessionId: ghi789
│   │       └─ Run #1: 生成报告 (15,000 tokens)
│   │
│   └─ Run #3: 整合输出 (20,000 tokens)
│
└─ 聚合统计
    ├─ Total LLM Calls: 7
    ├─ Total Tokens: 86,000
    └─ Total Cost: $0.86
```

---

## 2. 架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        OpenClaw Gateway                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ llm_input    │    │ llm_output   │    │ agent_end    │      │
│  │ Hook         │    │ Hook         │    │ Hook         │      │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘      │
│         │                   │                   │               │
│         ▼                   ▼                   ▼               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    TaskTracker                           │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │   │
│  │  │ Active Tasks│  │ Task Stats  │  │ Subagent    │     │   │
│  │  │ (运行时)    │  │ (聚合统计)  │  │ Links       │     │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘     │   │
│  └─────────────────────────────────────────────────────────┘   │
│         │                   │                   │               │
│         ▼                   ▼                   ▼               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    RequestAnalyzerStorage                │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │   │
│  │  │ Requests    │  │ Tasks       │  │ Subagent    │     │   │
│  │  │ (LLM 调用)   │  │ (任务树)    │  │ Links       │     │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                      HTTP API Layer                              │
├─────────────────────────────────────────────────────────────────┤
│  /api/tasks          - 任务列表                                  │
│  /api/tasks/:id      - 任务详情                                  │
│  /api/tasks/:id/tree - 任务树（含子任务）                         │
│  /api/stats          - 聚合统计                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 模块职责

| 模块 | 职责 |
|------|------|
| **TaskTracker** | 运行时任务追踪，维护活跃任务状态 |
| **RequestAnalyzerStorage** | 持久化存储任务数据 |
| **HTTP Handler** | 提供任务查询 API |
| **Hooks (llm_input/llm_output/agent_end)** | 捕获任务执行事件 |

### 2.3 数据流

```
用户消息
  │
  ▼
agent_start (隐式)
  │
  ▼
┌─────────────────────────────────────┐
│  TaskTracker.startTask()            │
│  - 创建活跃任务                     │
│  - 设置超时定时器                   │
│  - 生成 taskId                      │
└─────────────────────────────────────┘
  │
  ├──────────────┬──────────────┐
  ▼              ▼              ▼
LLM 调用 #1    LLM 调用 #2    Tool Call
  │              │              │
  ▼              ▼              ▼
recordLLM    recordLLM      recordTool
  │              │              │
  └──────────────┴──────────────┘
                 │
                 ▼
          sessions_spawn
                 │
                 ▼
          子任务 (独立 sessionId)
                 │
                 ▼
          agent_end (子任务)
                 │
                 ▼
          TaskTracker.endTask()
          - 持久化子任务
          - 关联到父任务
                 │
                 ▼
          agent_end (主任务)
                 │
                 ▼
          TaskTracker.endTask()
          - 持久化主任务
          - 聚合子任务统计
```

---

## 3. 数据结构

### 3.1 TaskData（任务数据）

```typescript
interface TaskData {
  // === 基础信息 ===
  taskId: string;           // 任务唯一 ID (格式：task_<timestamp>_<sessionId>)
  sessionId: string;        // 会话 ID (UUID 格式)
  sessionKey?: string;      // 会话 Key (格式：agent:main:main 或 agent:main:subagent:xxx)
  parentTaskId?: string;    // 父任务 ID（子任务才有）
  parentSessionId?: string; // 父会话 ID（子任务才有）
  
  // === 时间信息 ===
  startTime: number;        // 任务开始时间戳（毫秒）
  endTime?: number;         // 任务结束时间戳（毫秒）
  duration?: number;        // 任务耗时（毫秒）
  
  // === 状态信息 ===
  status: TaskStatus;       // 任务状态
  endReason?: string;       // 结束原因 (completed/error/timeout/aborted)
  error?: string;           // 错误信息
  
  // === 统计信息（直接统计，不包括子任务） ===
  stats: TaskStats;
  
  // === 关联信息 ===
  runIds: string[];         // 关联的所有 runId
  childTaskIds?: string[];  // 子任务 ID 列表
  childSessionIds?: string[]; // 子任务 sessionId 列表
  
  // === 元数据 ===
  metadata: {
    agentId?: string;
    channelId?: string;
    trigger?: string;
    messageProvider?: string;
    depth?: number;         // 任务树深度（0=根任务，1=一级子任务）
  };
}
```

### 3.2 TaskStats（任务统计）

```typescript
interface TaskStats {
  llmCalls: number;         // LLM 调用次数
  toolCalls: number;        // 工具调用次数
  subagentSpawns: number;   // 子任务生成次数
  totalInput: number;       // 总输入 tokens
  totalOutput: number;      // 总输出 tokens
  totalTokens: number;      // 总 tokens
  estimatedCost: number;    // 估算成本（美元）
}
```

### 3.3 TaskStatus（任务状态）

```typescript
type TaskStatus = 
  | 'running'    // 任务正在执行
  | 'completed'  // 任务正常完成
  | 'error'      // 任务执行出错
  | 'timeout'    // 任务超时
  | 'aborted';   // 任务被中止
```

### 3.4 TaskTreeNode（任务树节点）

```typescript
interface TaskTreeNode {
  task: TaskData;           // 当前任务数据
  children: TaskTreeNode[]; // 子任务节点
  
  // 聚合统计（包括所有后代）
  aggregatedStats: TaskStats & {
    depth: number;          // 树深度
    descendantCount: number; // 后代任务数
  };
}
```

### 3.5 ActiveTask（活跃任务）

```typescript
interface ActiveTask {
  taskId: string;
  sessionId: string;
  sessionKey?: string;
  parentTaskId?: string;
  startTime: number;
  runIds: Set<string>;
  llmCalls: number;
  toolCalls: number;
  subagentSpawns: number;
  totalInput: number;
  totalOutput: number;
  metadata: TaskData['metadata'];
}
```

---

## 4. 核心模块

### 4.1 TaskTracker 类

**职责**: 运行时任务追踪

**核心方法**:

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `startTask` | sessionId, sessionKey, parentTaskId, parentSessionId, metadata | taskId | 开始或获取任务 |
| `recordLLMCall` | sessionId, runId, input, output | void | 记录 LLM 调用 |
| `recordToolCall` | sessionId | void | 记录工具调用 |
| `recordSubagentSpawn` | sessionId | void | 记录子任务生成 |
| `endTask` | sessionId, reason, error | TaskData | 结束任务并持久化 |
| `getActiveTaskCount` | - | number | 获取活跃任务数 |

**实现文件**: `src/task-tracker.ts`

### 4.2 RequestAnalyzerStorage 扩展

**新增方法**:

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `captureTask` | TaskData | Promise<void> | 捕获任务数据 |
| `updateTaskStats` | taskId, stats | Promise<void> | 更新任务统计 |
| `getTaskBySessionId` | sessionId | TaskData | 按 sessionId 查询任务 |
| `getTaskBySessionKey` | sessionKey | TaskData | 按 sessionKey 查询任务 |
| `getTaskTree` | taskId | TaskTreeNode | 获取任务树 |
| `getRecentTasks` | limit, sessionId | TaskData[] | 获取最近任务 |

**实现文件**: `src/storage.ts`

### 4.3 HTTP Handler 扩展

**新增 API**:

| 端点 | 方法 | 说明 |
|------|------|------|
| `GET /api/tasks` | GET | 获取任务列表 |
| `GET /api/tasks/:taskId` | GET | 获取任务详情 |
| `GET /api/tasks/:taskId/tree` | GET | 获取任务树 |
| `GET /api/stats` | GET | 获取聚合统计 |

**实现文件**: `src/web/handler.ts`

---

## 5. 执行流程

### 5.1 任务生命周期

```
┌─────────────────────────────────────────────────────────────┐
│                      Task Lifecycle                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐                                               │
│  │ Created  │ ← llm_input hook                              │
│  └────┬─────┘                                               │
│       │                                                      │
│       ▼                                                      │
│  ┌──────────┐                                               │
│  │ Running  │ ← llm_input, llm_output, tool_call hooks     │
│  └────┬─────┘                                               │
│       │                                                      │
│       ├─────────────────┬─────────────────┐                 │
│       ▼                 ▼                 ▼                 │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐             │
│  │Completed │    │  Error   │    │ Timeout  │             │
│  └──────────┘    └──────────┘    └──────────┘             │
│       ▲                 ▲                 ▲                 │
│       └─────────────────┴─────────────────┘                 │
│                         │                                    │
│                         ▼                                    │
│                  ┌──────────┐                               │
│                  │ Aborted  │ ← agent_end hook              │
│                  └──────────┘                               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 主任务执行流程

```
1. 用户发送消息
   │
   ▼
2. OpenClaw 创建会话 (sessionId: abc123)
   │
   ▼
3. llm_input hook 触发
   │
   ▼
4. TaskTracker.startTask(abc123)
   - 创建活跃任务
   - taskId: task_1773381787855_e0cb0b
   - 设置 10 分钟超时定时器
   │
   ▼
5. 记录 LLM input (10,000 tokens)
   │
   ▼
6. LLM 处理...
   │
   ▼
7. llm_output hook 触发
   │
   ▼
8. TaskTracker.recordLLMCall(abc123, runId, 10000, 500)
   │
   ▼
9. 可能需要调用工具 → after_tool_call hook
   │
   ▼
10. 可能需要再次调用 LLM → 回到步骤 3
    │
    ▼
11. agent_end hook 触发
    │
    ▼
12. TaskTracker.endTask(abc123, 'completed')
    - 清除超时定时器
    - 查询子任务关联
    - 计算聚合统计
    - 持久化任务数据
    │
    ▼
13. 任务完成
```

### 5.3 子任务执行流程

```
1. 主任务调用 sessions_spawn
   │
   ▼
2. OpenClaw 创建子会话 (sessionId: def456)
   │
   ▼
3. after_tool_call hook 触发
   │
   ▼
4. 记录 SubagentLink
   - parentSessionId: abc123
   - childSessionKey: agent:main:subagent:xxx
   │
   ▼
5. 子任务开始执行 → 同主任务流程
   │
   ▼
6. agent_end hook 触发 (子任务)
   │
   ▼
7. TaskTracker.endTask(def456, 'completed')
   - 持久化子任务
   - childTaskIds 关联到父任务
   │
   ▼
8. 子任务完成，结果返回主任务
```

---

## 6. 存储设计

### 6.1 文件结构

```
~/.openclaw/contextscope/
├── meta.json                 # 元数据（nextId, lastUpdated 等）
├── data-2026-03-13.json      # 2026-03-13 的数据
│   ├── requests[]            # LLM 调用记录
│   ├── tasks[]               # 任务记录
│   ├── subagentLinks[]       # 子任务关联
│   └── toolCalls[]           # 工具调用记录
├── data-2026-03-14.json
└── ...
```

### 6.2 数据文件格式

```json
{
  "date": "2026-03-13",
  "lastUpdated": 1773381787855,
  "requests": [
    {
      "id": 1,
      "type": "input",
      "runId": "abc123",
      "taskId": "task_1773381787855_e0cb0b",
      "sessionId": "e0cb0bab-8983-47ab-a...",
      "sessionKey": "agent:main:main",
      "provider": "bailian",
      "model": "qwen3.5-plus",
      "timestamp": 1773381787855,
      "usage": {
        "input": 10000,
        "output": 0,
        "total": 10000
      }
    }
  ],
  "tasks": [
    {
      "taskId": "task_1773381787855_e0cb0b",
      "sessionId": "e0cb0bab-8983-47ab-a...",
      "sessionKey": "agent:main:main",
      "startTime": 1773381787855,
      "endTime": 1773381941855,
      "duration": 154000,
      "status": "completed",
      "stats": {
        "llmCalls": 3,
        "toolCalls": 2,
        "subagentSpawns": 2,
        "totalInput": 45000,
        "totalOutput": 5000,
        "totalTokens": 50000,
        "estimatedCost": 0.50
      },
      "runIds": ["abc123", "def456", "ghi789"],
      "childTaskIds": ["task_1773381800000_xxx", "task_1773381810000_yyy"]
    }
  ],
  "subagentLinks": [
    {
      "id": 1,
      "kind": "spawn",
      "parentRunId": "abc123",
      "childRunId": "xyz789",
      "parentSessionId": "e0cb0bab-8983-47ab-a...",
      "parentSessionKey": "agent:main:main",
      "childSessionKey": "agent:main:subagent:xxx",
      "timestamp": 1773381800000
    }
  ],
  "toolCalls": []
}
```

### 6.3 索引设计

**内存索引**:

```typescript
class RequestAnalyzerStorage {
  // 按 taskId 索引
  private taskIndex = new Map<string, TaskData>();
  
  // 按 sessionId 索引
  private sessionIndex = new Map<string, TaskData>();
  
  // 按 sessionKey 索引
  private sessionKeyIndex = new Map<string, TaskData>();
  
  // 父子关系索引
  private parentChildIndex = new Map<string, string[]>(); // parentTaskId -> childTaskIds[]
}
```

---

## 7. 异常处理

### 7.1 超时处理

```typescript
// TaskTracker 内部
private setupTimeout(sessionId: string): void {
  const timeout = setTimeout(async () => {
    this.logger.warn?.(`Task timeout for session ${sessionId}`);
    await this.endTask(sessionId, 'timeout');
  }, this.TASK_TIMEOUT_MS); // 10 分钟
  
  this.taskTimeouts.set(sessionId, timeout);
}
```

### 7.2 agent_end 未触发

**场景**: 进程崩溃、网络中断等导致 agent_end hook 未执行

**处理方案**:

1. **超时清理**: 10 分钟无活动自动结束任务
2. **启动时清理**: 插件启动时清理未结束的活跃任务
3. **数据修复**: 定期扫描 orphan tasks（有 requests 无 task 记录）

### 7.3 子任务关联丢失

**场景**: SubagentLink 记录丢失，无法关联父子任务

**处理方案**:

1. **sessionKey 匹配**: 通过 sessionKey 前缀匹配 (agent:main:subagent:)
2. **时间窗口匹配**: 子任务 startTime 在父任务时间范围内
3. **手动关联 API**: 提供手动关联接口

---

## 8. 性能优化

### 8.1 内存管理

| 优化项 | 说明 |
|--------|------|
| **活跃任务限制** | 最多 100 个活跃任务，超出告警 |
| **超时清理** | 10 分钟无活动自动清理 |
| **索引缓存** | 常用查询建立内存索引 |
| **懒加载** | 任务树按需加载，不一次性加载所有数据 |

### 8.2 查询优化

| 查询类型 | 优化策略 |
|----------|----------|
| 按 taskId 查询 | Map 索引，O(1) |
| 按 sessionId 查询 | Map 索引，O(1) |
| 任务树查询 | 递归 + 缓存，O(n) |
| 最近任务列表 | 内存排序 + 分页，O(log n) |

### 8.3 存储优化

| 优化项 | 说明 |
|--------|------|
| **按日期分文件** | 每天一个数据文件，避免单文件过大 |
| **定期清理** | 保留最近 7 天数据，可配置 |
| **压缩存储** | 大文本字段压缩存储 |
| **增量刷新** | 只写入变更数据，减少 IO |

---

## 附录

### A. 配置项

```typescript
interface TaskTrackerConfig {
  taskTimeoutMs: number;        // 任务超时时间（默认 600000ms = 10 分钟）
  maxActiveTasks: number;       // 最大活跃任务数（默认 100）
  retentionDays: number;        // 数据保留天数（默认 7 天）
  enableAggregation: boolean;   // 启用聚合统计（默认 true）
}
```

### B. 监控指标

| 指标 | 说明 |
|------|------|
| `tasks.active.count` | 当前活跃任务数 |
| `tasks.completed.total` | 已完成任务总数 |
| `tasks.error.total` | 出错任务总数 |
| `tasks.timeout.total` | 超时任务总数 |
| `tasks.tokens.total` | 累计 token 数 |
| `tasks.subagent.count` | 累计子任务数 |

### C. 日志级别

| 级别 | 说明 |
|------|------|
| `info` | 任务开始/结束 |
| `debug` | LLM 调用记录 |
| `warn` | 超时警告、异常处理 |
| `error` | 持久化失败、索引错误 |

---

**文档结束**
