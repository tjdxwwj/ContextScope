import type { AnalysisInsight } from './analyzer.js';
import type { SubagentLinkData, ToolCallData } from './storage.js';

export interface AnalysisStats {
  totalRequests: number;
  todayRequests: number;
  weekRequests: number;
  averageTokens: number;
  totalCost: number;
  byProvider: Record<string, number>;
  byModel: Record<string, number>;
  hourlyDistribution: number[];
}

export interface AlertContext {
  runId: string;
  sessionId: string;
  usage: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
  };
  provider: string;
  model: string;
}

export interface TokenVisualization {
  labels: string[];
  values: number[];
  colors: string[];
  total: number;
}

export interface HeatmapData {
  messages: Array<{
    id: string;
    role: string;
    content: string;
    tokens: number;
    impact: number;
    timestamp: number;
  }>;
  maxImpact: number;
}

export interface TimelineData {
  points: Array<{
    timestamp: number;
    tokens: number;
    messages: number;
    utilization: number;
    summaryApplied: boolean;
  }>;
  contextWindow: number;
}

export interface DependencyGraphData {
  nodes: Array<{
    id: string;
    label: string;
    type: 'tool' | 'response' | 'llm';
    duration: number;
    tokens: number;
    status: 'success' | 'error' | 'pending';
  }>;
  edges: Array<{
    source: string;
    target: string;
    weight: number;
  }>;
}

export interface DetailedAnalysis {
  runId: string;
  sessionId: string;
  provider: string;
  model: string;
  timestamp: number;
  subagentLinks: SubagentLinkData[];
  tokenBreakdown: TokenVisualization;
  heatmap: HeatmapData;
  timeline: TimelineData;
  dependencyGraph: DependencyGraphData;
  insights: AnalysisInsight[];
  topicClusters: Array<{
    topic: string;
    messageCount: number;
    percentage: number;
    keywords: string[];
  }>;
  contextSimilarities: Array<{
    message1: string;
    message2: string;
    similarity: number;
    commonTopic: string;
  }>;
  compressionSuggestions: Array<{
    type: 'remove' | 'summarize' | 'keep';
    messageId: string;
    reason: string;
    tokenSavings: number;
    impact: string;
  }>;
  attentionDistribution: {
    systemPrompt: number;
    recentMessages: number;
    olderMessages: number;
    toolResponses: number;
  };
  keyMessages: Array<{
    id: string;
    role: string;
    content: string;
    impactScore: number;
  }>;
  contextHealth: {
    score: number;
    issues: string[];
    recommendations: string[];
  };
}

export interface ContextDistributionResponse {
  runId: string;
  sessionId: string;
  provider: string;
  model: string;
  timestamp: number;
  context: {
    systemPrompt: string;
    userPrompt: string;
    history: any[];
    toolCalls: ToolCallData[];
    subagentLinks: SubagentLinkData[];
  };
  tokenDistribution: TokenDistribution;
  modelInfo: {
    name: string;
    provider: string;
    contextWindow: number;
    estimatedCost: number;
  };
  stats: {
    totalMessages: number;
    totalTokens: number;
    systemPromptPercentage: number;
    historyPercentage: number;
    userPromptPercentage: number;
    toolResponsesPercentage: number;
  };
}

export interface TokenDistribution {
  total: number;
  breakdown: Record<string, number>;
  percentages: Record<string, number>;
}

export interface OpenRouterModelPricing {
  id: string;
  name: string;
  created?: number;
  description?: string;
  context_length?: number;
  architecture?: {
    modality?: string;
    tokenizer?: string;
    instruct_type?: string;
  };
  pricing?: {
    prompt?: string;
    completion?: string;
    image?: string;
    request?: string;
    web_search?: string;
    internal_reasoning?: string;
    input_cache_read?: string;
    input_cache_write?: string;
  };
  top_provider?: {
    max_completion_tokens?: number;
    is_moderated?: boolean;
  };
}

export interface OpenRouterModelsResponse {
  data: OpenRouterModelPricing[];
}

export interface ModelCostInfo {
  modelId: string;
  modelName: string;
  promptPricePer1M: number;
  completionPricePer1M: number;
  contextLength?: number;
  provider?: string;
}
