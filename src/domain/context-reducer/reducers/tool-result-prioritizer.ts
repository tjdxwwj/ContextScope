/**
 * Tool Result Prioritizer
 *
 * 对 tool 结果进行优先级处理：
 * - 错误结果（高优先级）：保持不变
 * - 写操作成功结果（低优先级）：替换为占位符
 * - 其他旧结果（中等优先级）：截断
 */

import type { ILogger } from '../../../shared/logger.js';
import type { ToolResultPrioritizerConfig, ReducerResult, ReductionDetail } from '../types.js';
import { truncateForLog } from '../types.js';
import { estimateTokens } from '../token-estimator.js';

// Write-type tools whose successful output is low-priority.
const WRITE_TOOL_NAMES = new Set([
  'write_file',
  'create_file',
  'write',
  'create',
  'mv',
  'cp',
  'mkdir',
  'rm',
  'rename',
  'save_file',
]);

function getTextContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      const b = block as Record<string, unknown>;
      if (b.type === 'text' && typeof b.text === 'string') {
        parts.push(b.text as string);
      }
    }
    return parts.join('\n');
  }
  return '';
}

function getTextLength(content: unknown): number {
  if (typeof content === 'string') return content.length;
  if (Array.isArray(content)) {
    let len = 0;
    for (const block of content) {
      const b = block as Record<string, unknown>;
      if (b.type === 'text' && typeof b.text === 'string') {
        len += (b.text as string).length;
      }
    }
    return len;
  }
  return 0;
}

function replaceContent(msg: Record<string, unknown>, text: string): void {
  const content = msg.content;
  if (typeof content === 'string') {
    msg.content = text;
  } else if (Array.isArray(content)) {
    const nonText = content.filter(
      (b: unknown) => (b as Record<string, unknown>).type !== 'text',
    );
    nonText.push({ type: 'text', text });
    msg.content = nonText;
  } else {
    msg.content = text;
  }
}

function truncateContent(
  msg: Record<string, unknown>,
  maxChars: number,
): void {
  const content = msg.content;
  if (typeof content === 'string') {
    if (content.length > maxChars) {
      msg.content =
        content.slice(0, maxChars) + '\n[truncated: output exceeded limit]';
    }
  } else if (Array.isArray(content)) {
    for (const block of content) {
      const b = block as Record<string, unknown>;
      if (b.type === 'text' && typeof b.text === 'string') {
        const text = b.text as string;
        if (text.length > maxChars) {
          b.text =
            text.slice(0, maxChars) + '\n[truncated: output exceeded limit]';
        }
      }
    }
  }
}

export function toolResultPrioritizer(
  messages: unknown[],
  config: ToolResultPrioritizerConfig,
  preserveRecentTurns: number,
  logger: ILogger,
): ReducerResult {
  if (!config.enabled) return { tokensSaved: 0, itemsProcessed: 0, details: [] };

  // Build a map from toolCallId → toolName for lookup.
  const callIdToName = new Map<string, string>();
  for (const msg of messages) {
    const m = msg as Record<string, unknown>;
    if (m.role !== 'assistant') continue;
    const content = m.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      const b = block as Record<string, unknown>;
      if (b.type === 'toolCall' && typeof b.id === 'string') {
        callIdToName.set(b.id as string, (b.name as string) ?? '');
      }
    }
  }

  // Find the protected boundary (last N assistant turns).
  const assistantIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if ((messages[i] as Record<string, unknown>).role === 'assistant')
      assistantIndices.push(i);
  }
  const protectedStart =
    assistantIndices.length > preserveRecentTurns
      ? assistantIndices[assistantIndices.length - preserveRecentTurns]
      : 0;

  let tokensSaved = 0;
  let itemsProcessed = 0;
  const details: ReductionDetail[] = [];

  for (let i = 0; i < protectedStart; i++) {
    const msg = messages[i] as Record<string, unknown>;
    if (msg.role !== 'toolResult') continue;

    // High priority: keep errors untouched.
    if (msg.isError === true) continue;

    const callId = msg.toolCallId as string | undefined;
    const toolName = callId ? callIdToName.get(callId) ?? '' : '';
    const originalLen = getTextLength(msg.content);

    if (WRITE_TOOL_NAMES.has(toolName)) {
      // Low priority: replace with placeholder.
      const contentBefore = truncateForLog(getTextContent(msg.content));
      const placeholder = `[write result: ${toolName} succeeded]`;
      replaceContent(msg, placeholder);
      const saved =
        estimateTokens('x'.repeat(originalLen)) -
        estimateTokens(placeholder);
      if (saved > 0) {
        tokensSaved += saved;
        itemsProcessed++;
        details.push({ toolName, toolCallId: callId, contentBefore, contentAfter: placeholder });
      }
    } else if (originalLen > config.lowPriorityMaxChars) {
      // Medium priority: truncate.
      const contentBefore = truncateForLog(getTextContent(msg.content));
      truncateContent(msg, config.lowPriorityMaxChars);
      const newLen = getTextLength(msg.content);
      const saved =
        estimateTokens('x'.repeat(originalLen)) -
        estimateTokens('x'.repeat(newLen));
      if (saved > 0) {
        tokensSaved += saved;
        itemsProcessed++;
        details.push({
          toolName,
          toolCallId: callId,
          contentBefore,
          contentAfter: truncateForLog(getTextContent(msg.content)),
        });
      }
    }
  }

  if (itemsProcessed > 0) {
    logger.info(
      `[context-reducer] toolResultPrioritizer: processed ${itemsProcessed} results, saved ~${tokensSaved} tokens`,
    );
  }

  return { tokensSaved, itemsProcessed, details };
}
