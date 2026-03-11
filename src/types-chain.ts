/**
 * Chain API Types
 * 
 * Types for the chain endpoint that returns raw call chain data
 * without any analysis.
 */

export type ChainItemType = 
  | 'input'
  | 'output'
  | 'tool_call'
  | 'tool_result'
  | 'subagent_spawn'
  | 'subagent_result';

export interface ChainItem {
  id: string;
  runId: string;
  parentRunId?: string;
  type: ChainItemType;
  timestamp: number;
  duration?: number;
  
  input?: {
    prompt?: string;
    systemPrompt?: string;
    historyMessages?: any[];
    params?: any;
    task?: string;
  };
  
  output?: {
    text?: string;
    assistantTexts?: string[];
    result?: any;
    outcome?: string;
  };
  
  usage?: {
    input: number;
    output: number;
    total: number;
  };
  
  metadata?: {
    provider?: string;
    model?: string;
    toolName?: string;
    agentId?: string;
    status?: 'success' | 'error' | 'pending';
    error?: string;
  };
}

export interface ChainPagination {
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
}

export interface ChainStats {
  totalItems: number;
  inputCount: number;
  outputCount: number;
  toolCallCount: number;
  subagentCount: number;
  totalTokens: number;
}

export interface ChainResponse {
  runId: string;
  sessionId: string;
  provider: string;
  model: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  pagination: ChainPagination;
  chain: ChainItem[];
  stats: ChainStats;
}
