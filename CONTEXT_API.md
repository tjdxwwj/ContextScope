# Context API - 上下文分布查询接口

## 📋 概述

新增的 `/api/context` 接口提供每次 API 调用的完整上下文分布信息，包括：

- ✅ **System Prompt** - 完整系统指令内容
- ✅ **User Prompt** - 完整用户输入
- ✅ **History** - 完整对话历史
- ✅ **Token Distribution** - 各部分 token 占用分布
- ✅ **Model Info** - 模型信息、context window、预估成本
- ✅ **Tool Calls** - 工具调用记录
- ✅ **Subagent Links** - 子 Agent 关联信息

---

## 🚀 快速开始

### 1. 请求示例

```bash
# 获取指定 runId 的完整上下文分布
curl "http://localhost:18789/plugins/contextscope/api/context?runId=05cd0983-9cb4-4d8a-ba4c-e5a71ae939f8"
```

### 2. JavaScript 示例

```javascript
// 获取上下文分布
const response = await fetch(
  'http://localhost:18789/plugins/contextscope/api/context?runId=' + runId
);
const data = await response.json();

// 查看 Token 分布
console.log('Total Tokens:', data.tokenDistribution.total);
console.log('System Prompt:', data.tokenDistribution.breakdown.systemPrompt, 
            `(${data.tokenDistribution.percentages.systemPrompt}%)`);
console.log('History:', data.tokenDistribution.breakdown.history, 
            `(${data.tokenDistribution.percentages.history}%)`);
console.log('User Prompt:', data.tokenDistribution.breakdown.userPrompt, 
            `(${data.tokenDistribution.percentages.userPrompt}%)`);

// 查看完整上下文
console.log('System Prompt:', data.context.systemPrompt);
console.log('User Prompt:', data.context.userPrompt);
console.log('History Messages:', data.context.history);

// 模型信息
console.log('Model:', data.modelInfo.name);
console.log('Context Window:', data.modelInfo.contextWindow);
console.log('Estimated Cost: $' + data.modelInfo.estimatedCost.toFixed(4));
```

---

## 📊 响应结构

```typescript
{
  // 基本信息
  runId: string;           // 调用 ID
  sessionId: string;       // 会话 ID
  provider: string;        // 提供商 (bailian, openai, anthropic 等)
  model: string;           // 模型名称
  timestamp: number;       // 时间戳 (ms)
  
  // 完整上下文内容
  context: {
    systemPrompt: string;      // 完整的系统提示
    userPrompt: string;        // 当前用户输入
    history: any[];            // 历史消息数组（完整内容）
    toolCalls: ToolCallData[]; // 工具调用记录
    subagentLinks: SubagentLinkData[]; // 子 Agent 关联
  };
  
  // Token 分布
  tokenDistribution: {
    total: number;         // 总 tokens
    breakdown: {
      systemPrompt: number;    // 系统提示 tokens
      userPrompt: number;      // 用户输入 tokens
      history: number;         // 历史消息 tokens
      toolResponses: number;   // 工具响应 tokens
    };
    percentages: {
      systemPrompt: number;    // 系统提示占比 (%)
      userPrompt: number;      // 用户输入占比 (%)
      history: number;         // 历史消息占比 (%)
      toolResponses: number;   // 工具响应占比 (%)
    };
  };
  
  // 模型信息
  modelInfo: {
    name: string;          // 模型名称
    provider: string;      // 提供商
    contextWindow: number; // 上下文窗口大小
    estimatedCost: number; // 预估成本 (USD)
  };
  
  // 统计信息
  stats: {
    totalMessages: number;         // 总消息数
    totalTokens: number;           // 总 tokens
    systemPromptPercentage: number;    // 系统提示占比
    historyPercentage: number;         // 历史消息占比
    userPromptPercentage: number;      // 用户输入占比
    toolResponsesPercentage: number;   // 工具响应占比
  };
}
```

---

## 🔍 使用场景

### 1. 调试 Prompt 问题
查看实际发送给 LLM 的完整上下文，包括 system prompt 和历史消息。

### 2. 分析 Token 消耗
了解各部分（system/history/user prompt）的 token 占比，优化上下文使用。

### 3. 成本估算
根据 token 分布和模型定价，估算每次调用的成本。

### 4. 上下文优化
识别哪些部分占用最多 token，决定是否需要压缩或摘要。

---

## ⚠️ 注意事项

1. **数据完整性**
   - `systemPrompt`、`userPrompt`、`history` 都是完整内容，不截断
   - 大文件读取可能返回大量数据
   - 建议仅在调试时使用

2. **Token 估算**
   - Token 数量通过启发式算法估算
   - 实际 API 计费的 token 数可能略有不同
   - 百分比基于估算值计算

3. **隐私注意**
   - 包含完整的对话内容
   - 敏感信息请注意脱敏
   - 可通过配置 `anonymizeContent` 开启内容匿名化

---

## 📈 与 Chain API 对比

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

## 🔧 开发信息

### 实现文件
- `src/service.ts` - `getContextDistribution()` 方法
- `src/web/handler.ts` - `handleContext()` 路由处理
- `API_CHAIN.md` - API 文档

### 构建
```bash
npm run build
```

### 测试
```bash
node test-context-api.js
```

---

## 📝 更新日志

**2026-03-12**
- ✅ 新增 `/api/context` 接口
- ✅ 实现完整的上下文分布查询
- ✅ 添加 token 分布计算和百分比统计
- ✅ 支持 model info 和成本估算
- ✅ 更新 API 文档
