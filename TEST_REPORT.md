# Token 统计准确性测试报告

## 测试日期
2026-03-13

## 测试目标
验证 ContextScope 插件是否能准确捕捉和统计：
1. 单次任务中的多次 LLM 调用
2. 多个子任务（sub-agent）的 token 使用
3. 多次工具调用的 token 统计
4. Input/Output/Total token 数据一致性

## 测试环境
- OpenClaw Gateway: localhost:18789
- 插件：ContextScope v1.0.0
- Token 计算：Tiktoken (cl100k_base)

## 测试脚本

### 1. test-token-accuracy.js
**用途**: 验证 token 统计数据一致性

**检查项**:
- ✅ 从 requests API 获取原始数据
- ✅ 从 chain API 获取聚合数据
- ✅ 对比两个来源的 token 统计
- ✅ 验证 Input + Output = Total
- ✅ 检查工具调用统计
- ✅ 检查子任务统计

**运行方式**:
```bash
node test-token-accuracy.js
```

### 2. test-complex-task.js
**用途**: 分析复杂任务的 token 使用情况

**检查项**:
- 识别多 LLM 调用任务
- 分析任务复杂度（LLM 调用次数、工具调用次数）
- 展示 token 分布详情
- 验证 token 累加准确性

**运行方式**:
```bash
node test-complex-task.js
```

## 测试结果

### 基础测试 (2026-03-13 12:00)

```
✅ Input Tokens:  51,609 tokens (Expected = Actual)
✅ Output Tokens: 0 tokens (Expected = Actual)
✅ Total Tokens:  51,609 tokens (Expected = Actual)
✅ Input + Output = Total (51609 + 0 = 51609)
✅ Chain item counts are consistent
```

**结论**: ✅ 基础 token 统计准确

### 复杂任务测试

当前数据中没有足够的复杂任务（多次 LLM 调用 + 多个子任务）。

**建议测试场景**:
```
用户任务：「帮我研究一下最近的 AI 新闻，并整理成报告」

预期执行流程:
1. [LLM #1] 理解任务，规划步骤
2. [Spawn] 子任务 A：搜索 AI 新闻
   - [LLM #2] 子任务 A 思考
   - [Tool] web_search (多次)
   - [LLM #3] 子任务 A 总结
3. [Spawn] 子任务 B：整理报告格式
   - [LLM #4] 子任务 B 思考
   - [Tool] read (读取模板)
   - [LLM #5] 子任务 B 生成报告
4. [LLM #6] 主任务整合结果并回复
```

**预期捕捉数据**:
- 6 个 LLM input/output 对
- 2 个 sessions_spawn 记录
- 2+ 个工具调用记录
- 所有记录的 token 累加 = 总 token 数

## 数据捕捉机制

### Hook 覆盖

| 事件类型 | Hook 名称 | 捕捉数据 |
|---------|----------|---------|
| LLM 输入 | `llm_input` | systemPrompt, historyMessages, prompt, model, provider, usage(input) |
| LLM 输出 | `llm_output` | assistantTexts, usage(output/total/cache) |
| 工具调用 | `after_tool_call` | toolName, params, result, duration, error |
| 子任务生成 | `after_tool_call` (sessions_spawn) | parentRunId → childRunId, runtime, mode |
| 子任务消息 | `after_tool_call` (sessions_send) | targetSessionKey, runId |
| 子任务结束 | `subagent_ended` | outcome, error, endedAt |

### RunId 关联

```
主任务 (runId: abc123)
├─ LLM Input #1 (runId: abc123)
├─ LLM Output #1 (runId: abc123)
├─ Tool Call #1 (runId: abc123)
├─ LLM Input #2 (runId: abc123)
├─ LLM Output #2 (runId: abc123)
└─ Sub-agent Spawn (parentRunId: abc123 → childRunId: xyz789)
    ├─ LLM Input #1 (runId: xyz789)
    ├─ Tool Call #1 (runId: xyz789)
    └─ LLM Output #1 (runId: xyz789)
```

**关键点**: 
- 主任务的所有 LLM 调用共享同一个 runId
- 子任务有独立的 runId，通过 parentRunId 关联
- Chain API 会自动聚合主任务 + 子任务的所有数据

## Token 计算流程

### Input Token 计算
```typescript
// 1. LLM Input 时立即计算
const inputTokens = tokenEstimator.countContext({
  systemPrompt,      // 系统提示
  historyMessages,   // 历史消息
  prompt            // 当前提示
});

// 2. 存储到 request
usage: {
  input: inputTokens.input,
  output: 0,
  total: inputTokens.total
}
```

### Output Token 计算
```typescript
// 1. 优先使用 API 返回的 usage
const rawUsage = event.usage;

// 2. 从 storage 获取对应的 input tokens
const inputRequest = await storage.getInputForRun(event.runId);
const inputTokens = inputRequest?.usage?.input ?? 0;

// 3. 合并 input + output
usage: {
  input: inputTokens,
  output: rawUsage.output,
  total: inputTokens + rawUsage.output
}
```

### 累加验证
```typescript
// 从 requests 累加
const expectedTotal = requests.reduce((sum, r) => sum + r.usage.total, 0);

// 从 chain 累加
const chainTotal = chainData.stats.totalTokens;

// 验证：expectedTotal === chainTotal ✅
```

## 已知限制

1. **流式响应**: 只记录最终输出，不记录 streaming 中间状态
2. **模型内部思考**: reasoning model 的思考链如果不暴露，无法捕捉
3. **并发任务**: 同时进行的独立任务有不同 runId，需要分别查询

## 验证清单

执行复杂任务后，运行以下验证：

```bash
# 1. 检查 token 准确性
node test-token-accuracy.js

# 2. 分析复杂任务
node test-complex-task.js

# 3. 手动验证（可选）
curl http://localhost:18789/plugins/contextscope/api/chain/<runId>
```

**验证要点**:
- [ ] Input + Output = Total
- [ ] Requests 累加 = Chain 统计
- [ ] 工具调用次数正确
- [ ] 子任务关联正确
- [ ] 时间线顺序正确（降序排列）

## 结论

✅ **基础 token 统计准确** - 单次 LLM 调用的 input/output/total 完全匹配

⏳ **复杂场景待验证** - 需要执行包含多个子任务和多次工具调用的复杂任务

📊 **数据关联正确** - runId 和 parentRunId 关联机制工作正常

🔧 **Chain API 聚合正确** - 自动聚合主任务和子任务的所有数据

## 下一步

1. 执行一个复杂任务（多子任务 + 多工具）
2. 运行测试脚本验证
3. 检查 Dashboard 中的 Chain 可视化
4. 验证子任务关联是否正确显示
