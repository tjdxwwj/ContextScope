/**
 * Shared Types for ContextScope Plugin
 */

export interface PluginLogger {
  debug?: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

// ==================== Task Types (任务树架构) ====================

export type TaskStatus = 'running' | 'completed' | 'error' | 'timeout' | 'aborted';

// Token 统计（从 Requests 表实时聚合）
export interface TaskTokenStats {
  totalInput: number;
  totalOutput: number;
  totalTokens: number;
  estimatedCost: number;
}

// Task 元数据（不包含冗余的 token 统计）
export interface TaskMeta {
  taskId: string;
  sessionId: string;
  sessionKey?: string;
  parentTaskId?: string;
  parentSessionId?: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: TaskStatus;
  endReason?: string;
  error?: string;
  // 只保留计数，token 统计从 Requests 表实时聚合
  llmCalls: number;
  toolCalls: number;
  subagentSpawns: number;
  runIds: string[];
  childTaskIds?: string[];
  childSessionIds?: string[];
  metadata: {
    agentId?: string;
    channelId?: string;
    trigger?: string;
    messageProvider?: string;
    depth?: number;
  };
}

// TaskData 保持向后兼容，但 stats 字段标记为 deprecated
export interface TaskData extends TaskMeta {
  /** @deprecated 使用 TaskTokenStats 实时计算 */
  stats?: {
    llmCalls: number;
    toolCalls: number;
    subagentSpawns: number;
    totalInput: number;
    totalOutput: number;
    totalTokens: number;
    estimatedCost: number;
  };
  /** 实时计算的 token 统计 */
  tokenStats?: TaskTokenStats;
}

export interface ActiveTask {
  taskId: string;
  sessionId: string;
  sessionKey?: string;
  parentTaskId?: string;
  parentSessionId?: string;
  startTime: number;
  runIds: Set<string>;
  llmCalls: number;
  toolCalls: number;
  subagentSpawns: number;
  totalInput: number;
  totalOutput: number;
  metadata: TaskData['metadata'];
}

export interface TaskTreeNode {
  task: TaskData;
  children: TaskTreeNode[];
  aggregatedStats: (TaskMeta & TaskTokenStats) & {
    depth: number;
    descendantCount: number;
  };
}

export interface PluginConfig {
  storage?: {
    maxRequests?: number;
    retentionDays?: number;
    compression?: boolean;
  };
  visualization?: {
    theme?: 'light' | 'dark' | 'auto';
    autoRefresh?: boolean;
    refreshInterval?: number;
    charts?: string[];
  };
  capture?: {
    includeSystemPrompts?: boolean;
    includeMessageHistory?: boolean;
    anonymizeContent?: boolean;
    maxPromptLength?: number;
  };
  alerts?: {
    enabled?: boolean;
    tokenThreshold?: number;
    costThreshold?: number;
  };
}

/**
 * Model pricing data (per 1K tokens)
 * Centralized pricing configuration
 */
export const MODEL_PRICING: Record<string, number> = {
  'gpt-4': 0.06,
  'gpt-4-turbo': 0.03,
  'gpt-3.5-turbo': 0.002,
  'claude-3-opus': 0.075,
  'claude-3-sonnet': 0.015,
  'claude-3-haiku': 0.003,
  'qwen': 0.008,
  'qwen2': 0.004,
  'default': 0.01
};

/**
 * Model context windows
 * Centralized context window configuration
 */
export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-4': 8192,
  'gpt-4-turbo': 128000,
  'gpt-3.5-turbo': 16385,
  'claude-3': 200000,
  'qwen': 32768,
  'qwen2': 128000,
  'default': 8192
};

/**
 * Get pricing for a model
 */
export function getModelPricing(model: string): number {
  const modelKey = Object.keys(MODEL_PRICING).find(key => model.toLowerCase().includes(key)) || 'default';
  return MODEL_PRICING[modelKey];
}

/**
 * Get context window for a model
 */
export function getModelContextWindow(model: string): number {
  const modelLower = model.toLowerCase();
  for (const [key, value] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (modelLower.includes(key)) {
      return value;
    }
  }
  return MODEL_CONTEXT_WINDOWS['default'];
}

/**
 * Estimate cost based on token usage
 */
export function estimateCost(usage: {
  input?: number;
  output?: number;
  total?: number;
}, provider: string, model: string): number {
  const totalTokens = usage.total || (usage.input || 0) + (usage.output || 0);
  const costPer1K = getModelPricing(model);
  return (totalTokens / 1000) * costPer1K;
}
