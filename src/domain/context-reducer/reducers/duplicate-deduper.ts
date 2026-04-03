/**
 * Duplicate Deduper
 *
 * 去重 tool 结果：当同一个工具以相同参数被多次调用时，
 * 只保留最新的结果，将早期的结果替换为占位符。
 */

import { createHash } from 'node:crypto';
import type { ILogger } from '../../../shared/logger.js';
import type { DuplicateDeduperConfig, ReducerResult, ReductionDetail } from '../types.js';
import { truncateForLog } from '../types.js';
import { estimateTokens } from '../token-estimator.js';

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

function hashArgs(args: unknown): string {
  let str: string;
  try {
    str = typeof args === 'string' ? args : JSON.stringify(args ?? {});
  } catch {
    str = '';
  }
  return createHash('md5').update(str).digest('hex');
}

export function duplicateDeduper(
  messages: unknown[],
  config: DuplicateDeduperConfig,
  _preserveRecentTurns: number,
  logger: ILogger,
): ReducerResult {
  if (!config.enabled) return { tokensSaved: 0, itemsProcessed: 0, details: [] };

  // First pass: build a map from toolCallId → { toolName, argsHash } from assistant messages.
  const callMeta = new Map<
    string,
    { toolName: string; argsHash: string }
  >();
  for (const msg of messages) {
    const m = msg as Record<string, unknown>;
    if (m.role !== 'assistant') continue;
    const content = m.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      const b = block as Record<string, unknown>;
      if (b.type === 'toolCall' && typeof b.id === 'string') {
        callMeta.set(b.id as string, {
          toolName: (b.name as string) ?? '',
          argsHash: hashArgs(b.arguments),
        });
      }
    }
  }

  // Second pass: find all toolResult messages and group by dedup key.
  const groups = new Map<string, number[]>();
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i] as Record<string, unknown>;
    if (m.role !== 'toolResult') continue;
    const callId = m.toolCallId as string | undefined;
    if (!callId) continue;
    const meta = callMeta.get(callId);
    if (!meta) continue;
    const key = `${meta.toolName}::${meta.argsHash}`;
    const list = groups.get(key) ?? [];
    list.push(i);
    groups.set(key, list);
  }

  let tokensSaved = 0;
  let itemsProcessed = 0;
  const details: ReductionDetail[] = [];

  // For each group with >1 occurrence, keep the latest (last index) and replace earlier ones.
  for (const [, indices] of groups) {
    if (indices.length <= 1) continue;
    for (let k = 0; k < indices.length - 1; k++) {
      const idx = indices[k];
      const msg = messages[idx] as Record<string, unknown>;
      const originalText = getTextContent(msg.content);
      const callId = msg.toolCallId as string | undefined;
      const meta = callId ? callMeta.get(callId) : undefined;
      const toolName = meta?.toolName ?? 'unknown';
      const placeholder = `[duplicate result — see latest ${toolName} call]`;

      replaceContent(msg, placeholder);
      const saved =
        estimateTokens(originalText) - estimateTokens(placeholder);
      if (saved > 0) {
        tokensSaved += saved;
        itemsProcessed++;
        details.push({
          toolName,
          toolCallId: callId,
          contentBefore: truncateForLog(originalText),
          contentAfter: placeholder,
        });
      }
    }
  }

  if (itemsProcessed > 0) {
    logger.info(
      `[context-reducer] duplicateDeduper: deduplicated ${itemsProcessed} results, saved ~${tokensSaved} tokens`,
    );
  }

  return { tokensSaved, itemsProcessed, details };
}
