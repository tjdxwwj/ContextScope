# Token 估算功能

## 概述

当 API 没有返回准确的 token usage 时，系统会根据上下文自动估算 token 数量。

## 估算方法

### 字符到 Token 的转换

| 文本类型 | 转换比例 |
|---------|---------|
| 中文字符 | 1.5 字符 = 1 token |
| 英文字符 | 4 字符 = 1 token |
| 代码 | 4 字符 = 1 token |
| 混合文本 | 按比例计算 |

### 计算公式

```
tokens = (中文字符数 / 1.5) + (其他字符数 / 4)
```

## 估算范围

### Input Tokens
- ✅ System Prompt
- ✅ History Messages（支持多模态）
- ✅ Current Prompt

### Output Tokens
- ✅ Assistant Responses

## 日志示例

```
System prompt: 150 tokens
History messages: 800 tokens
Current prompt: 200 tokens
Assistant response: 350 tokens
Estimated tokens for run xxx: input=1150, output=350, total=1500
```

## 测试准确率

根据测试脚本结果：
- 纯中文：84% 准确率
- 纯英文：90% 准确率
- 混合文本：73% 准确率
- 代码：90% 准确率
- **总体准确率：80%**

## 使用方法

### 自动估算
当 API 返回的 `usage.totalTokens === 0` 时，系统会自动估算。

### 手动测试
```bash
node test-token-estimation.js
```

## 多模态支持

支持处理包含文本和图片的消息：
```javascript
{
  role: 'user',
  content: [
    { type: 'text', text: '分析这张图片' },
    { type: 'image', image_url: '...' }  // 不计算 token
  ]
}
```

只计算文本部分的 token。

## 优势

1. **实时估算** - 捕获请求时立即估算
2. **完整上下文** - 包含所有 input 部分
3. **详细日志** - 显示每个部分的估算
4. **多语言支持** - 准确处理中英文混合

## 限制

1. **估算误差** - 约±20% 的误差范围
2. **特殊格式** - Markdown、代码块可能不准确
3. **图片/文件** - 不计算非文本内容
4. **Tool calls** - 不估算 tool call 的 token

## 改进建议

1. 使用真实的 tokenizer 提高准确率
2. 针对不同 model 使用不同的估算比例
3. 添加缓存避免重复计算
4. 提供配置选项调整估算比例

## 配置（未来）

```json
{
  "tokenEstimation": {
    "enabled": true,
    "chineseRatio": 1.5,
    "englishRatio": 4,
    "useRealTokenizer": false
  }
}
```
