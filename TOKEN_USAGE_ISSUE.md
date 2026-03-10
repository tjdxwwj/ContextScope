# Token Usage 为 0 的问题说明

## 问题现象

前端显示的 input tokens 和 output tokens 都是 0，导致：
- 统计数据中的 `averageTokens: 0`
- 所有请求的 `usage.input: 0` 和 `usage.output: 0`
- Token 趋势图没有数据

## 根本原因

**OpenClaw bailian provider 没有正确返回 token usage 数据**

从 API 返回的数据可以看到：
```json
{
  "usage": {
    "input": 0,
    "output": 0,
    "cacheRead": 0,
    "cacheWrite": 0,
    "totalTokens": 0,
    "cost": {
      "input": 0,
      "output": 0,
      "cacheRead": 0,
      "cacheWrite": 0,
      "total": 0
    }
  }
}
```

这是因为 bailian (通义千问) 的 API 响应格式可能与其他 provider 不同，OpenClaw 没有正确提取 token usage。

## 解决方案

### 方案 1：估算 Token 数量（推荐）

在 service.ts 中添加 token 估算逻辑，当 usage 为 0 时使用估算值：

```typescript
private estimateTokens(text: string): number {
  // 英文：约 4 个字符 = 1 个 token
  // 中文：约 1.5 个字符 = 1 个 token
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherChars = text.length - chineseChars;
  
  return Math.round(chineseChars / 1.5 + otherChars / 4);
}

async captureResponse(data: any): Promise<void> {
  // 如果 usage 为 0，尝试估算
  if (!data.usage || data.usage.totalTokens === 0) {
    const content = data.assistantTexts?.join('\n') || '';
    const estimatedTokens = this.estimateTokens(content);
    
    data.usage = {
      input: 0, // input tokens 无法估算
      output: estimatedTokens,
      total: estimatedTokens
    };
  }
  
  await this.storage.captureRequest(data);
}
```

### 方案 2：修复 OpenClaw bailian provider

在 OpenClaw 的 bailian provider 中正确解析 token usage：

1. 检查 bailian API 响应中的 usage 字段
2. 确保正确映射到 OpenClaw 的标准格式
3. 提交 PR 修复

### 方案 3：使用其他 provider

暂时使用已知能正确返回 token usage 的 provider：
- OpenAI (gpt-4, gpt-3.5-turbo)
- Anthropic (claude-3-*)

## 临时 workaround

在等待修复期间，可以：

1. **使用估算值显示** - 前端显示估算的 token 数量
2. **显示字符数** - 作为 token 的替代指标
3. **切换到其他 provider** - 使用能正确返回 token usage 的 provider

## 影响范围

- ✅ 请求捕获功能正常
- ✅ 上下文快照正常
- ✅ 时间线功能正常
- ❌ Token 统计为 0
- ❌ Token 趋势图为空
- ❌ Cost 估算为 0

## 后续改进

1. 添加 provider 特定的 token 计算器
2. 支持手动输入 token 数量
3. 添加 token usage 数据质量监控
4. 提供 token 估算开关配置
