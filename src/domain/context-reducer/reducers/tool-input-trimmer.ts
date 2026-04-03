/**
 * Tool Input Trimmer
 *
 * 裁剪旧 turn 中 tool call 的 arguments，替换为简短摘要。
 * 跳过最近 N 个 turn 和与 error 结果配对的 tool call。
 */

import type { ILogger } from '../../../shared/logger.js';
import type { ToolInputTrimmerConfig, ReducerResult, ReductionDetail } from '../types.js';
import { truncateForLog } from '../types.js';
import { estimateTokens } from '../token-estimator.js';

export function toolInputTrimmer(
  messages: unknown[],
  config: ToolInputTrimmerConfig,
  preserveRecentTurns: number,
  logger: ILogger,
): ReducerResult {
  if (!config.enabled) return { tokensSaved: 0, itemsProcessed: 0, details: [] };

  // Build a set of toolCallIds that have an error result so we preserve them.
  const errorCallIds = new Set<string>();
  for (const msg of messages) {
    const m = msg as Record<string, unknown>;
    if (m.role !== 'toolResult') continue;
    if ((m as Record<string, unknown>).isError === true) {
      const id = (m as Record<string, unknown>).toolCallId;
      if (typeof id === 'string') errorCallIds.add(id);
    }
  }

  // Identify the boundary: skip the last `preserveRecentTurns` assistant messages.
  const assistantIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i] as Record<string, unknown>;
    if (m.role === 'assistant') assistantIndices.push(i);
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
    if (msg.role !== 'assistant') continue;
    const content = msg.content;
    if (!Array.isArray(content)) continue;

    for (let j = 0; j < content.length; j++) {
      const block = content[j] as Record<string, unknown>;
      if (block.type !== 'toolCall') continue;

      const callId = block.id as string | undefined;
      if (callId && errorCallIds.has(callId)) continue;

      const args = block.arguments;
      let argsStr: string;
      try {
        argsStr =
          typeof args === 'string' ? args : JSON.stringify(args ?? {});
      } catch {
        continue;
      }

      if (argsStr.length <= config.maxInputChars) continue;

      // Build a short summary of the argument keys.
      let argKeys = '…';
      try {
        const parsed = typeof args === 'string' ? JSON.parse(args) : args;
        if (parsed && typeof parsed === 'object') {
          argKeys = Object.keys(parsed as Record<string, unknown>).join(',');
        }
      } catch {
        // keep "…"
      }

      const toolName = (block.name as string) ?? 'unknown';
      const placeholder = `[trimmed input: ${toolName}(${argKeys})]`;
      const savedChars = argsStr.length - placeholder.length;
      if (savedChars <= 0) continue;

      // Mutate in-place.
      content[j] = { ...block, arguments: placeholder };
      tokensSaved += estimateTokens(argsStr) - estimateTokens(placeholder);
      itemsProcessed++;
      details.push({
        toolName,
        toolCallId: callId,
        contentBefore: truncateForLog(argsStr),
        contentAfter: placeholder,
      });
    }
  }

  if (itemsProcessed > 0) {
    logger.info(
      `[context-reducer] toolInputTrimmer: trimmed ${itemsProcessed} tool calls, saved ~${tokensSaved} tokens`,
    );
  }

  return { tokensSaved, itemsProcessed, details };
}
