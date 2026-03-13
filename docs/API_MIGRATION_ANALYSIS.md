# API 接口改造分析

**日期**: 2026-03-13  
**版本对比**: v1.0 → v2.0 (任务树架构)

---

## 📊 接口对比总览

| 类别 | 现有接口 (v1.0) | 新架构接口 (v2.0) | 改造方式 |
|------|----------------|------------------|---------|
| **任务相关** | ❌ 无 | ✅ 7 个端点 | **新增** |
| **统计相关** | ✅ 1 个端点 | ✅ 2 个端点 | **扩展** |
| **请求相关** | ✅ 1 个端点 | ✅ 3 个端点 | **扩展** |
| **分析相关** | ✅ 1 个端点 | ✅ 保留 | **保留** |
| **工具调用** | ✅ 1 个端点 | ✅ 保留 | **保留** |
| **子任务关联** | ✅ 1 个端点 | ✅ 保留 | **保留** |

---

## 1. 任务相关 API（新增）

### 1.1 为什么需要新增？

**现状**: v1.0 没有任务概念，只有请求（requests）和链（chain）

**问题**:
- 无法查看一个完整任务的执行情况
- 无法聚合统计子任务的 token 消耗
- 无法展示任务树结构

**解决方案**: 新增 7 个任务端点

| 端点 | 说明 | 是否新增 |
|------|------|---------|
| `GET /api/tasks` | 获取任务列表 | ✅ **新增** |
| `GET /api/tasks/:taskId` | 获取任务详情 | ✅ **新增** |
| `GET /api/tasks/:taskId/tree` | 获取任务树 | ✅ **新增** |
| `GET /api/tasks/:taskId/children` | 获取子任务列表 | ✅ **新增** |
| `GET /api/sessions/:sessionId/stats` | 获取会话统计 | ✅ **新增** |
| `POST /api/tasks` | 创建任务（预留） | ✅ **新增** |
| `DELETE /api/tasks/:taskId` | 删除任务（预留） | ✅ **新增** |

### 1.2 实现位置

**新增文件**: `src/web/task-handler.ts`

```typescript
export function createTaskHttpHandler(params: HandlerParams) {
  const { service, logger } = params;
  
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const path = url.pathname;
    
    // GET /api/tasks
    if (path === '/plugins/contextscope/api/tasks') {
      return await handleGetTasks(req, res, url, service);
    }
    
    // GET /api/tasks/:taskId
    const taskMatch = path.match(/^\/plugins\/contextscope\/api\/tasks\/([^/]+)$/);
    if (taskMatch) {
      return await handleGetTask(req, res, taskMatch[1], service);
    }
    
    // GET /api/tasks/:taskId/tree
    const treeMatch = path.match(/^\/plugins\/contextscope\/api\/tasks\/([^/]+)\/tree$/);
    if (treeMatch) {
      return await handleGetTaskTree(req, res, treeMatch[1], service);
    }
    
    // ... 其他端点
    
    return false;
  };
}
```

---

## 2. 统计相关 API（扩展）

### 2.1 现有接口

**端点**: `GET /api/stats`

**当前实现**:
```typescript
// src/web/handler.ts (现有代码)
async function handleStats(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  const stats = await service.getStats(timeFilters);
  const storageStats = await service.getStorageStats();
  
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ stats, storage: storageStats }));
  return true;
}
```

**返回数据**:
```json
{
  "stats": {
    "totalRequests": 156,
    "todayRequests": 29,
    "weekRequests": 156,
    "averageTokens": 42168,
    "totalCost": 22.94,
    "byProvider": { "bailian": 156 },
    "byModel": { "qwen3.5-plus": 156 },
    "hourlyDistribution": [...]
  },
  "storage": {
    "storageSize": "75.3 MB"
  }
}
```

### 2.2 改造方案

**扩展内容**: 增加任务级统计

**新返回数据**:
```json
{
  "stats": { ... },  // 原有数据（保持不变）
  "storage": { ... }, // 原有数据（保持不变）
  
  "taskStats": {     // ✅ 新增
    "totalTasks": 45,
    "completedTasks": 42,
    "errorTasks": 2,
    "timeoutTasks": 1,
    "avgTokensPerTask": 89000,
    "avgDurationMs": 145000,
    "withSubagents": 12,
    "avgSubagentsPerTask": 2.3
  },
  
  "topTasks": [      // ✅ 新增
    {
      "taskId": "task_1773381787855_e0cb0b",
      "totalTokens": 89000,
      "llmCalls": 7,
      "subagents": 2
    }
  ]
}
```

**改造方式**: 
- ✅ **向后兼容**: 原有字段保持不变
- ✅ **增量扩展**: 新增 taskStats 和 topTasks 字段
- ✅ **无需修改前端**: 旧前端继续使用原有字段

---

## 3. 请求相关 API（扩展）

### 3.1 现有接口

**端点**: `GET /api/requests`

**当前参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| `sessionId` | string | 按会话过滤 |
| `runId` | string | 按 runId 过滤 |
| `provider` | string | 按提供商过滤 |
| `model` | string | 按模型过滤 |
| `limit` | number | 每页数量 |
| `offset` | number | 偏移量 |

### 3.2 改造方案

**新增参数**:

| 参数 | 类型 | 说明 | 是否必需 |
|------|------|------|---------|
| `taskId` | string | 按任务 ID 过滤 | ✅ **新增** |
| `type` | string | 按类型过滤 (input/output) | ✅ **新增** |
| `startTime` | number | 开始时间戳 | ✅ **新增** |
| `endTime` | number | 结束时间戳 | ✅ **新增** |

**改造后的请求示例**:
```http
GET /api/requests?taskId=task_1773381787855_e0cb0b&type=input&limit=50 HTTP/1.1
```

**改造方式**:
- ✅ **向后兼容**: 原有参数继续使用
- ✅ **增量扩展**: 新增 taskId 等参数
- ✅ **代码改动小**: 只需在查询逻辑中增加过滤条件

---

## 4. 分析相关 API（保留）

### 4.1 现有接口

| 端点 | 说明 | 改造方式 |
|------|------|---------|
| `GET /api/analysis` | 获取单次请求的详细分析 | ✅ **保留** |
| `GET /api/context` | 获取上下文分布 | ✅ **保留** |
| `GET /api/timeline/detail` | 获取时间线详情 | ✅ **保留** |
| `GET /api/timeline/compare` | 对比时间点 | ✅ **保留** |

**说明**: 这些接口基于 runId，与任务树架构不冲突，继续保留。

---

## 5. 子任务关联 API（保留并增强）

### 5.1 现有接口

**端点**: `GET /api/links`

**当前功能**: 获取子任务关联记录

### 5.2 改造方案

**保留原有功能**, 增加响应字段：

**当前响应**:
```json
{
  "links": [
    {
      "id": 1,
      "kind": "spawn",
      "parentRunId": "abc123",
      "childRunId": "xyz789",
      "parentSessionId": "e0cb0bab...",
      "childSessionKey": "agent:main:subagent:xxx",
      "timestamp": 1773381800000
    }
  ],
  "total": 2
}
```

**增强响应**:
```json
{
  "links": [ ... ],  // 原有数据
  "total": 2,
  
  "tasks": [         // ✅ 新增（可选）
    {
      "linkId": 1,
      "parentTaskId": "task_1773381787855_e0cb0b",
      "childTaskId": "task_1773381800000_xxx",
      "childTaskStatus": "completed",
      "childTaskTokens": 17000
    }
  ]
}
```

---

## 6. 改造工作量评估

### 6.1 新增文件

| 文件 | 说明 | 行数 | 工时 |
|------|------|------|------|
| `src/web/task-handler.ts` | 任务 API 处理器 | ~400 | 2h |
| `src/task-tracker.ts` | 任务追踪器 | ~300 | 3h |
| `docs/TASK_TREE_ARCHITECTURE.md` | 技术文档 | - | 1h |
| `docs/API_DOCUMENTATION.md` | API 文档 | - | 1h |
| **合计** | | **~700** | **7h** |

### 6.2 修改文件

| 文件 | 修改内容 | 行数 | 工时 |
|------|---------|------|------|
| `src/storage.ts` | 新增任务存储方法 | ~200 | 2h |
| `src/service.ts` | 新增任务查询服务 | ~150 | 2h |
| `src/web/handler.ts` | 集成任务 API | ~50 | 1h |
| `index.ts` | 集成 TaskTracker | ~100 | 2h |
| **合计** | | **~500** | **7h** |

### 6.3 总计

| 类别 | 工时 |
|------|------|
| 新增文件 | 7h |
| 修改文件 | 7h |
| 测试调试 | 4h |
| 文档完善 | 2h |
| **总计** | **20h (~2.5 天)** |

---

## 7. 实施顺序

### Phase 1: 核心功能（第 1 天）
- [ ] 实现 TaskTracker 类
- [ ] 扩展 storage.ts 支持任务存储
- [ ] 集成到 index.ts hooks

### Phase 2: API 层（第 2 天上午）
- [ ] 实现 task-handler.ts
- [ ] 扩展 stats API
- [ ] 扩展 requests API

### Phase 3: 测试与文档（第 2 天下午）
- [ ] 单元测试
- [ ] 集成测试
- [ ] 更新文档

---

## 8. 向后兼容性保证

### 8.1 数据兼容

| 项目 | 兼容性 | 说明 |
|------|--------|------|
| 现有 requests 数据 | ✅ 完全兼容 | 新任务数据独立存储 |
| 现有 API 响应 | ✅ 完全兼容 | 只新增字段，不修改原有 |
| 前端 Dashboard | ✅ 完全兼容 | 旧前端继续使用原有 API |

### 8.2 迁移策略

**方案**: 渐进式迁移

1. **第 1 周**: 新旧并存，新任务使用新架构
2. **第 2 周**: 前端逐步切换到任务视图
3. **第 3 周**: 旧数据可选迁移到新结构

---

## 9. 总结

### 9.1 接口改造分类

| 分类 | 端点数 | 改造方式 |
|------|--------|---------|
| **全新新增** | 7 个 | 任务相关 API |
| **扩展增强** | 2 个 | stats, requests |
| **保持不变** | 8 个 | analysis, links, tool-calls 等 |

### 9.2 核心变更

1. **新增任务概念**: 从"请求维度"升级到"任务维度"
2. **新增任务树**: 支持多层嵌套和聚合统计
3. **扩展统计**: 增加任务级统计指标

### 9.3 兼容性

- ✅ **100% 向后兼容**: 不影响现有功能和前端
- ✅ **渐进式迁移**: 可以逐步切换，无需一次性完成
- ✅ **数据隔离**: 新旧数据独立存储，互不影响

---

**结论**: 核心是**新增任务相关 API**，现有 API 只需**小幅扩展**，整体改造工作量约 **2.5 天**。
