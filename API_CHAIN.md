# ContextScope API 接口文档

## 接口列表

### 1. Chain API - 完整调用链
**GET** `/plugins/contextscope/api/chain/{runId}`

返回完整的调用链上下文，包括：
- ✅ Tools 调用
- ✅ 子 Agent 调用
- ✅ 输入/输出
- ✅ 完整的时间线

**注意：此接口不进行任何分析，只返回原始调用链数据**

---

### 2. Context API - 上下文分布详情
**GET** `/plugins/contextscope/api/context?runId=xxx`

返回单次调用的完整上下文分布信息，包括：
- ✅ System Prompt（完整内容）
- ✅ User Prompt（完整内容）
- ✅ History Messages（完整历史对话）
- ✅ Token Distribution（各部分 token 占比）
- ✅ Model Info（模型信息、context window、预估成本）
- ✅ Tool Calls（工具调用记录）
- ✅ Subagent Links（子 Agent 关联）

**用于调试和分析每次 API 调用的上下文构成**

---

## 1. Chain API 详细说明

### 请求参数

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

## 2. Context API 详细说明

### 请求参数

### Query 参数
- `runId` (必填) - 调用 ID

### 示例请求
```
GET /plugins/contextscope/api/context?runId=test-context-1773250903869
```

---

### 响应结构

```typescript
interface ContextDistributionResponse {
  runId: string;
  sessionId: string;
  provider: string;
  model: string;
  timestamp: number;
  
  context: {
    systemPrompt: string;
    userPrompt: string;
    history: any[];
    toolCalls: ToolCallData[];
    subagentLinks: SubagentLinkData[];
  };
  
  tokenDistribution: {
    total: number;
    breakdown: {
      systemPrompt: number;
      userPrompt: number;
      history: number;
      toolResponses: number;
    };
    percentages: {
      systemPrompt: number;
      userPrompt: number;
      history: number;
      toolResponses: number;
    };
  };
  
  modelInfo: {
    name: string;
    provider: string;
    contextWindow: number;
    estimatedCost: number;
  };
  
  stats: {
    totalMessages: number;
    totalTokens: number;
    systemPromptPercentage: number;
    historyPercentage: number;
    userPromptPercentage: number;
    toolResponsesPercentage: number;
  };
}
```

---

### 真实返回示例

#### 示例 1：完整对话（带 System Prompt + History）

```json
{
  "runId": "test-context-1773250903869",
  "sessionId": "test-session",
  "provider": "bailian",
  "model": "qwen3.5-plus",
  "timestamp": 1773250903870,
  
  "context": {
    "systemPrompt": "You are a helpful assistant. This is a test system prompt.",
    "userPrompt": "你好，测试上下文分布 API",
    "history": [
      {"role": "user", "content": [{"type": "text", "text": "Hello"}], "timestamp": 1773250843870},
      {"role": "assistant", "content": [{"type": "text", "text": "Hi!"}], "timestamp": 1773250848870}
    ],
    "toolCalls": [],
    "subagentLinks": []
  },
  
  "tokenDistribution": {
    "total": 24,
    "breakdown": {"systemPrompt": 15, "userPrompt": 7, "history": 2, "toolResponses": 0},
    "percentages": {"systemPrompt": 63, "userPrompt": 29, "history": 8, "toolResponses": 0}
  },
  
  "modelInfo": {
    "name": "qwen3.5-plus",
    "provider": "bailian",
    "contextWindow": 32768,
    "estimatedCost": 0.0002
  },
  
  "stats": {
    "totalMessages": 3,
    "totalTokens": 24,
    "systemPromptPercentage": 63,
    "historyPercentage": 8,
    "userPromptPercentage": 29,
    "toolResponsesPercentage": 0
  }
}
```

---

#### 示例 2：简单请求（无 History）

```json
{
  "runId": "test-123",
  "context": {
    "systemPrompt": "",
    "userPrompt": "test",
    "history": [],
    "toolCalls": [],
    "subagentLinks": []
  },
  "tokenDistribution": {
    "total": 1,
    "breakdown": {"systemPrompt": 0, "userPrompt": 1, "history": 0, "toolResponses": 0},
    "percentages": {"systemPrompt": 0, "userPrompt": 100, "history": 0, "toolResponses": 0}
  },
  "modelInfo": {"name": "test", "provider": "test", "contextWindow": 8192, "estimatedCost": 0.00001},
  "stats": {"totalMessages": 1, "totalTokens": 1, "systemPromptPercentage": 0, "historyPercentage": 0, "userPromptPercentage": 100}
}
```

---

## 接口对比

| 特性 | Chain API | Context API |
|------|-----------|-------------|
| 用途 | 调用链追踪 | 上下文分布分析 |
| System Prompt | ✅ | ✅ 完整内容 |
| User Prompt | ✅ | ✅ 完整内容 |
| History | ✅ | ✅ 完整内容 |
| Token 分布 | ❌ | ✅ 详细 breakdown |
| Tool Calls | ✅ 详细 | ✅ 详细 |
| Subagents | ✅ 详细 | ✅ 详细 |
| 模型信息 | ✅ 基础 | ✅ 含 context window/cost |
| 分页 | ✅ | ❌ |
| 数据量 | 中 | 大 |

---

## 注意事项

1. **数据完整性** - 所有内容不截断，大文件可能返回大量数据
2. **Token 估算** - 通过启发式算法估算，实际 API 计费可能略有不同
3. **隐私注意** - 包含完整对话内容，可通过 `anonymizeContent` 配置开启匿名化

---

## 错误响应

### 400 Bad Request
```json
{ "error": "runId parameter is required" }
```

### 404 Not Found
```json
{ "error": "Context distribution not found" }
```

### 500 Internal Server Error
```json
{ "error": "Failed to get context distribution" }
```
