# ContextScope Chain API 接口文档

## 接口说明

**GET** `/plugins/contextscope/api/chain/{runId}`

返回完整的调用链上下文，包括：
- ✅ Tools 调用
- ✅ 子 Agent 调用
- ✅ 输入/输出
- ✅ 完整的时间线

**注意：此接口不进行任何分析，只返回原始调用链数据**

---

## 请求参数

### Path 参数
- `runId` (必填) - 调用 ID

### Query 参数
- `limit` (可选，默认 100) - 每页数量
- `offset` (可选，默认 0) - 偏移量

### 示例请求
```
GET /plugins/contextscope/api/chain/05cd0983-9cb4-4d8a-ba4c-e5a71ae939f8?limit=100&offset=0
```

---

## 响应结构

```typescript
interface ChainResponse {
  runId: string;           // 主调用 ID
  sessionId: string;       // 会话 ID
  provider: string;        // 提供商 (bailian, openai, anthropic 等)
  model: string;           // 模型名称
  startTime: number;       // 开始时间戳 (ms)
  endTime?: number;        // 结束时间戳 (ms)
  duration?: number;       // 总耗时 (ms)
  
  // 分页信息
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
  
  // 完整的调用链，按时间倒序排列（最近的在前）
  chain: ChainItem[];
  
  // 统计信息（仅计数，不分析）
  stats: {
    totalItems: number;        // 总项目数
    inputCount: number;        // 输入数量
    outputCount: number;       // 输出数量
    toolCallCount: number;     // 工具调用数量
    subagentCount: number;     // 子 Agent 数量
    totalTokens: number;       // 总 tokens
  };
}

interface ChainItem {
  id: string;              // 项目 ID (runId 或 toolCallId)
  runId: string;           // 所属调用 ID
  parentRunId?: string;    // 父调用 ID（子 Agent 才有）
  type: ItemType;          // 项目类型
  timestamp: number;       // 时间戳 (ms)
  duration?: number;       // 耗时 (ms)
  
  // 输入
  input?: {
    prompt?: string;           // 用户提示
    systemPrompt?: string;     // 系统提示
    historyMessages?: any[];   // 历史消息（完整内容）
    params?: any;              // 工具调用参数
    task?: string;             // 子 Agent 任务
  };
  
  // 输出
  output?: {
    text?: string;             // 文本输出
    assistantTexts?: string[]; // 助手输出数组（完整内容）
    result?: any;              // 工具调用结果（完整内容）
    outcome?: string;          // 子 Agent 结果
  };
  
  // Token 使用
  usage?: {
    input: number;
    output: number;
    total: number;
  };
  
  // 元数据
  metadata?: {
    provider?: string;         // 提供商
    model?: string;            // 模型
    toolName?: string;         // 工具名称
    agentId?: string;          // Agent ID
    status?: 'success' | 'error' | 'pending';  // 状态
    error?: string;            // 错误信息
  };
}

type ItemType = 
  | 'input'              // 用户输入
  | 'output'             // LLM 输出
  | 'tool_call'          // 工具调用
  | 'tool_result'        // 工具返回
  | 'subagent_spawn'     // 子 Agent 启动
  | 'subagent_result';   // 子 Agent 返回
```

---

## 真实数据示例

### 实际运行数据

**Run ID:** `05cd0983-9cb4-4d8a-ba4c-e5a71ae939f8`  
**Session ID:** `90872c48-2c82-4eda-8dcf-c87064cdc8ef`  
**Session Key:** `agent:main:main`  
**Provider:** `bailian`  
**Model:** `qwen3.5-plus`  
**Timestamp:** `1773166706844` (2026-03-11 02:18:26 GMT+8)

### 完整响应示例

```json
{
  "runId": "05cd0983-9cb4-4d8a-ba4c-e5a71ae939f8",
  "sessionId": "90872c48-2c82-4eda-8dcf-c87064cdc8ef",
  "provider": "bailian",
  "model": "qwen3.5-plus",
  "startTime": 1773166706844,
  "endTime": 1773166706844,
  "duration": 0,
  
  "pagination": {
    "limit": 100,
    "offset": 0,
    "total": 1,
    "hasMore": false
  },
  
  "stats": {
    "totalItems": 1,
    "inputCount": 1,
    "outputCount": 0,
    "toolCallCount": 0,
    "subagentCount": 0,
    "totalTokens": 0
  },
  
  "chain": [
    {
      "id": "05cd0983-9cb4-4d8a-ba4c-e5a71ae939f8",
      "runId": "05cd0983-9cb4-4d8a-ba4c-e5a71ae939f8",
      "type": "input",
      "timestamp": 1773166706844,
      "input": {
        "prompt": "System: [2026-03-11 02:17:00 GMT+8] Feishu[default] DM...",
        "systemPrompt": "You are a personal assistant running inside OpenClaw...",
        "historyMessages": [
          {
            "role": "user",
            "content": [
              {
                "type": "text",
                "text": "System: [2026-03-10 03:12:51 GMT+8] Exec completed..."
              }
            ],
            "timestamp": 1773111975325
          },
          {
            "role": "assistant",
            "content": [
              {
                "type": "thinking",
                "thinking": "好的，我来检查一下当前的项目结构...",
                "thinkingSignature": "reasoning_content"
              },
              {
                "type": "text",
                "text": "好的，让我查看一下项目结构..."
              },
              {
                "type": "toolCall",
                "id": "callb5daa42f318b4f25a466cb20",
                "name": "read",
                "arguments": {
                  "path": "C:\\Users\\10906\\.openclaw\\extensions\\feishu-openclaw-plugin\\package.json"
                }
              }
            ],
            "provider": "bailian",
            "model": "qwen3.5-plus",
            "usage": {
              "input": 0,
              "output": 0,
              "total": 0
            },
            "timestamp": 1773111975337
          }
        ]
      },
      "metadata": {
        "provider": "bailian",
        "model": "qwen3.5-plus",
        "status": "success"
      }
    }
  ]
}
```

---

## 带 Tool 调用的示例

```json
{
  "chain": [
    {
      "id": "callb5daa42f318b4f25a466cb20",
      "runId": "05cd0983-9cb4-4d8a-ba4c-e5a71ae939f8",
      "type": "tool_call",
      "timestamp": 1773111993971,
      "duration": 10162,
      "input": {
        "params": {
          "path": "C:\\Users\\10906\\.openclaw\\extensions\\feishu-openclaw-plugin\\package.json"
        }
      },
      "metadata": {
        "toolName": "read",
        "status": "success"
      }
    },
    {
      "id": "callb5daa42f318b4f25a466cb20",
      "runId": "05cd0983-9cb4-4d8a-ba4c-e5a71ae939f8",
      "type": "tool_result",
      "timestamp": 1773112004133,
      "output": {
        "result": "{\n  \"name\": \"@larksuiteoapi/feishu-openclaw-plugin\",\n  \"version\": \"2026.3.8\"...\n}"
      },
      "metadata": {
        "toolName": "read",
        "status": "success"
      }
    }
  ]
}
```

---

## 带子 Agent 的示例

```json
{
  "chain": [
    {
      "id": "subagent_001",
      "runId": "subagent_001",
      "parentRunId": "05cd0983-9cb4-4d8a-ba4c-e5a71ae939f8",
      "type": "subagent_spawn",
      "timestamp": 1773112000000,
      "input": {
        "task": "分析代码结构",
        "label": "code-analyzer"
      },
      "metadata": {
        "agentId": "agent-code-001",
        "runtime": "subagent",
        "mode": "session",
        "status": "success"
      }
    },
    {
      "id": "subagent_001",
      "runId": "subagent_001",
      "parentRunId": "05cd0983-9cb4-4d8a-ba4c-e5a71ae939f8",
      "type": "subagent_result",
      "timestamp": 1773112005000,
      "duration": 5000,
      "output": {
        "outcome": "success",
        "text": "代码结构分析完成..."
      },
      "metadata": {
        "agentId": "agent-code-001",
        "status": "success"
      }
    }
  ]
}
```

---

## 设计原则

### 1. **扁平化结构**
- 所有项目按时间倒序排列在 `chain` 数组中
- 不区分层级，便于前端渲染时间线
- **排序：按 timestamp 降序（最近的在前）**

### 2. **统一字段**
- 所有项目都有 `id`, `runId`, `type`, `timestamp`
- 子 Agent 项目有 `parentRunId` 关联到父调用
- 输入统一在 `input` 字段
- 输出统一在 `output` 字段

### 3. **类型明确**
- `type` 字段清晰标识项目类型
- 便于前端根据类型显示不同图标/样式

### 4. **无分析逻辑**
- 不包含 heatmap、insights、analysis 等分析数据
- 只返回原始调用链数据
- 分析逻辑由前端按需处理

### 5. **完整上下文**
- 包含 systemPrompt、historyMessages（**不截断**）
- 包含 tool params 和 result（**不截断**）
- 包含 subagent task 和 outcome（**不截断**）

### 6. **分页支持**
- `limit` 参数控制每页数量（默认 100）
- `offset` 参数控制偏移量（默认 0）
- 响应中包含 `total` 和 `hasMore` 便于前端实现分页

---

## 与旧接口对比

| 特性 | 旧接口 `/api/analysis` | 新接口 `/api/chain` |
|------|----------------------|-------------------|
| 分析逻辑 | ✅ 包含 | ❌ 不包含 |
| Heatmap | ✅ 包含 | ❌ 不包含 |
| Insights | ✅ 包含 | ❌ 不包含 |
| 原始数据 | ⚠️ 部分 | ✅ 完整 |
| Tools | ⚠️ 聚合 | ✅ 详细（call + result） |
| Subagents | ⚠️ 聚合 | ✅ 详细（spawn + result） |
| 父子关联 | ❌ | ✅ parentRunId |
| 分页 | ❌ | ✅ limit/offset |
| 排序 | 升序 | 降序（最近的在前） |
| 前端灵活性 | 低 | 高 |

---

## 使用示例

### 1. 获取完整调用链
```bash
curl 'http://localhost:18789/plugins/contextscope/api/chain/05cd0983-9cb4-4d8a-ba4c-e5a71ae939f8'
```

### 2. 分页获取
```bash
curl 'http://localhost:18789/plugins/contextscope/api/chain/05cd0983-9cb4-4d8a-ba4c-e5a71ae939f8?limit=50&offset=0'
```

### 3. 前端集成
```javascript
// 获取调用链
const response = await fetch('/plugins/contextscope/api/chain/' + runId);
const data = await response.json();

// 渲染时间线
data.chain.forEach(item => {
  console.log(`${new Date(item.timestamp).toLocaleString()} - ${item.type}`);
  
  if (item.type === 'tool_call') {
    console.log(`  Tool: ${item.metadata.toolName}`);
  }
  
  if (item.parentRunId) {
    console.log(`  Parent: ${item.parentRunId}`);
  }
});

// 显示统计
console.log(`Total: ${data.stats.totalItems} items`);
console.log(`Tools: ${data.stats.toolCallCount} calls`);
console.log(`Subagents: ${data.stats.subagentCount} spawned`);
```

---

## 注意事项

1. **数据完整性**
   - 所有文本内容都是完整数据，不截断
   - 大文件读取可能返回大量数据
   - 建议前端实现虚拟滚动

2. **性能优化**
   - 默认 limit=100 避免返回过多数据
   - 使用 offset 分页加载
   - 前端可缓存已加载的数据

3. **时间戳排序**
   - 响应数据按 timestamp **降序**排列
   - 最近的请求在最前面
   - 便于展示最新状态

4. **父子关联**
   - 子 Agent 项目包含 `parentRunId`
   - 可通过 `parentRunId` 追踪调用层级
   - 前端可据此渲染树形结构

---

## 错误响应

### 400 Bad Request
```json
{
  "error": "runId is required"
}
```

### 404 Not Found
```json
{
  "error": "Chain not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Failed to get chain"
}
```
