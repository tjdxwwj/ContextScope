/**
 * Token 估算器 —— 使用 tiktoken 进行真实 BPE 编码计数
 */

import { encoding_for_model } from 'tiktoken';

// 单例 encoding 实例，避免重复初始化
let enc: ReturnType<typeof encoding_for_model> | null = null;

function getEncoding() {
  if (!enc) {
    enc = encoding_for_model('gpt-4o');
  }
  return enc;
}

/**
 * 估算文本 token 数
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return getEncoding().encode(text).length;
}

function estimateUnknownChars(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return 'x'.repeat(256);
  }
}

/**
 * 估算单条消息的 token 数（支持 user/assistant/toolResult 等多种结构）
 */
export function estimateMessageTokens(msg: unknown): number {
  if (!msg || typeof msg !== 'object') return 0;
  const m = msg as Record<string, unknown>;
  const content = m.content;

  // String content (simple user/assistant)
  if (typeof content === 'string') return estimateTokens(content);

  // Array content (content blocks)
  if (Array.isArray(content)) {
    let total = 0;
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      const b = block as Record<string, unknown>;
      if (b.type === 'text' && typeof b.text === 'string') {
        total += estimateTokens(b.text as string);
      } else if (b.type === 'toolCall') {
        total += estimateTokens(estimateUnknownChars(b.arguments));
      } else if (b.type === 'image') {
        total += 8_000; // image placeholder estimate
      } else {
        total += estimateTokens(estimateUnknownChars(block));
      }
    }
    return total;
  }

  return estimateTokens(estimateUnknownChars(content));
}

/**
 * 估算消息数组的总 token 数
 */
export function estimateMessagesTokens(msgs: unknown[]): number {
  let total = 0;
  for (const msg of msgs) {
    total += estimateMessageTokens(msg);
  }
  return total;
}
