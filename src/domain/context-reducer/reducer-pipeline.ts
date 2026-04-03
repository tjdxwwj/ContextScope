/**
 * Reducer Pipeline
 *
 * 按顺序运行 reduction pipeline：
 *   1. duplicateDeduper       — 先去重，让后续 reducer 看到唯一结果
 *   2. toolInputTrimmer       — 裁剪旧 tool call 参数
 *   3. contentPreviewer       — 对大型 tool 结果进行 head+tail 预览
 *   4. toolResultPrioritizer  — 替换写操作结果 + 截断剩余内容
 *
 * 所有 reducer 原地修改 messages（引用语义）。
 */

import type { ILogger } from '../../shared/logger.js';
import type { ContextReducerConfig, PipelineResult, ReductionEntry } from './types.js';
import { estimateMessagesTokens } from './token-estimator.js';
import {
  duplicateDeduper,
  toolInputTrimmer,
  contentPreviewer,
  toolResultPrioritizer,
} from './reducers/index.js';

export function runPipeline(
  messages: unknown[],
  config: ContextReducerConfig,
  logger: ILogger,
): PipelineResult {
  const start = performance.now();
  const tokensBefore = estimateMessagesTokens(messages);
  const reductions: ReductionEntry[] = [];

  // 1. Deduplicate
  const dedupResult = duplicateDeduper(
    messages,
    config.duplicateDeduper,
    config.preserveRecentTurns,
    logger,
  );
  if (dedupResult.itemsProcessed > 0) {
    reductions.push({
      reducer: 'duplicateDeduper',
      tokensSaved: dedupResult.tokensSaved,
      itemsProcessed: dedupResult.itemsProcessed,
      details: dedupResult.details,
    });
  }

  // 2. Trim tool inputs
  const trimResult = toolInputTrimmer(
    messages,
    config.toolInputTrimmer,
    config.preserveRecentTurns,
    logger,
  );
  if (trimResult.itemsProcessed > 0) {
    reductions.push({
      reducer: 'toolInputTrimmer',
      tokensSaved: trimResult.tokensSaved,
      itemsProcessed: trimResult.itemsProcessed,
      details: trimResult.details,
    });
  }

  // 3. Preview large content
  const previewResult = contentPreviewer(
    messages,
    config.contentPreviewer,
    config.preserveRecentTurns,
    logger,
  );
  if (previewResult.itemsProcessed > 0) {
    reductions.push({
      reducer: 'contentPreviewer',
      tokensSaved: previewResult.tokensSaved,
      itemsProcessed: previewResult.itemsProcessed,
      details: previewResult.details,
    });
  }

  // 4. Prioritize tool results
  const prioResult = toolResultPrioritizer(
    messages,
    config.toolResultPrioritizer,
    config.preserveRecentTurns,
    logger,
  );
  if (prioResult.itemsProcessed > 0) {
    reductions.push({
      reducer: 'toolResultPrioritizer',
      tokensSaved: prioResult.tokensSaved,
      itemsProcessed: prioResult.itemsProcessed,
      details: prioResult.details,
    });
  }

  const tokensAfter = estimateMessagesTokens(messages);
  const durationMs = Math.round(performance.now() - start);

  return {
    tokensBefore,
    tokensAfter,
    tokensSaved: tokensBefore - tokensAfter,
    reductions,
    durationMs,
  };
}
