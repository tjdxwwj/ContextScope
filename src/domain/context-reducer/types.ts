/**
 * Context Reducer 配置类型 + 结果类型
 */

import type { ILogger } from '../../shared/logger.js';

// --- Plugin configuration types ---

export type ToolInputTrimmerConfig = {
  enabled: boolean;
  maxInputChars: number;
};

export type ToolResultPrioritizerConfig = {
  enabled: boolean;
  lowPriorityMaxChars: number;
};

export type ContentPreviewerConfig = {
  enabled: boolean;
  minContentChars: number;
  headLines: number;
  tailLines: number;
};

export type DuplicateDeduperConfig = {
  enabled: boolean;
};

export type LoggingConfig = {
  enabled: boolean;
};

export type ContextReducerConfig = {
  enabled: boolean;
  preserveRecentTurns: number;
  toolInputTrimmer: ToolInputTrimmerConfig;
  toolResultPrioritizer: ToolResultPrioritizerConfig;
  contentPreviewer: ContentPreviewerConfig;
  duplicateDeduper: DuplicateDeduperConfig;
  logging: LoggingConfig;
};

// --- Reducer result types ---

export const MAX_DETAIL_CHARS = 5000;

/** Truncate text for logging — append "..." when content exceeds limit. */
export function truncateForLog(text: string, limit = MAX_DETAIL_CHARS): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + '\n...';
}

export type ReductionDetail = {
  toolName: string;
  toolCallId?: string;
  contentBefore: string;
  contentAfter: string;
};

export type ReducerResult = {
  tokensSaved: number;
  itemsProcessed: number;
  details: ReductionDetail[];
};

// --- Log entry types ---

export type ReductionEntry = {
  reducer: string;
  tokensSaved: number;
  itemsProcessed: number;
  details?: ReductionDetail[];
};

export type ReductionLogEntry = {
  timestamp: string;
  sessionId: string;
  stage: string;
  messageCountBefore: number;
  messageCountAfter: number;
  tokensBefore: number;
  tokensAfter: number;
  tokensSaved: number;
  reductions: ReductionEntry[];
  durationMs: number;
};

// --- Pipeline result ---

export type PipelineResult = {
  tokensBefore: number;
  tokensAfter: number;
  tokensSaved: number;
  reductions: ReductionEntry[];
  durationMs: number;
};

// --- Reducer function type ---

export type ReducerFn = (
  messages: unknown[],
  config: any,
  preserveRecentTurns: number,
  logger: ILogger,
) => ReducerResult;

// --- Config defaults ---

export const DEFAULT_CONFIG: ContextReducerConfig = {
  enabled: true,
  preserveRecentTurns: 2,
  toolInputTrimmer: { enabled: true, maxInputChars: 200 },
  toolResultPrioritizer: { enabled: true, lowPriorityMaxChars: 100 },
  contentPreviewer: { enabled: true, minContentChars: 500, headLines: 10, tailLines: 5 },
  duplicateDeduper: { enabled: true },
  logging: { enabled: true },
};

export function resolveConfig(raw: unknown): ContextReducerConfig {
  const cfg = (raw ?? {}) as Record<string, unknown>;
  const defaults = DEFAULT_CONFIG;

  const resolve = <T extends Record<string, unknown>>(
    key: string,
    def: T,
  ): T => {
    const sub = (cfg[key] ?? {}) as Record<string, unknown>;
    const result = {} as Record<string, unknown>;
    for (const k of Object.keys(def)) {
      result[k] = sub[k] ?? def[k as keyof T];
    }
    return result as T;
  };

  return {
    enabled: (cfg.enabled as boolean) ?? defaults.enabled,
    preserveRecentTurns:
      (cfg.preserveRecentTurns as number) ?? defaults.preserveRecentTurns,
    toolInputTrimmer: resolve('toolInputTrimmer', defaults.toolInputTrimmer),
    toolResultPrioritizer: resolve(
      'toolResultPrioritizer',
      defaults.toolResultPrioritizer,
    ),
    contentPreviewer: resolve('contentPreviewer', defaults.contentPreviewer),
    duplicateDeduper: resolve('duplicateDeduper', defaults.duplicateDeduper),
    logging: resolve('logging', defaults.logging),
  };
}
