export interface TokenBreakdown {
  systemPrompt: number;
  historyMessages: number;
  currentPrompt: number;
  toolResponses: number;
  totalInput: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface MessageImpact {
  messageId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokenCount: number;
  impactScore: number;
  timestamp: number;
}

export interface ContextEvolution {
  timestamp: number;
  totalTokens: number;
  messageCount: number;
  compressionRatio: number;
  summaryApplied: boolean;
  windowUtilization: number;
}

export interface ToolCallNode {
  id: string;
  name: string;
  duration: number;
  tokensUsed: number;
  dependencies: string[];
  status: 'success' | 'error' | 'pending';
  children: string[];
}

export interface DependencyGraph {
  nodes: ToolCallNode[];
  edges: Array<{ from: string; to: string; weight: number }>;
}

export interface AnalysisInsight {
  type: 'warning' | 'info' | 'optimization';
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
}

export interface ContextSimilarity {
  messageId: string;
  similarTo: string;
  similarityScore: number;
  topic: string;
}

export interface TopicCluster {
  topic: string;
  messageIds: string[];
  keywords: string[];
  percentage: number;
}

export interface ContextCompressionSuggestion {
  type: 'remove' | 'summarize' | 'keep';
  messageId: string;
  reason: string;
  tokenSavings: number;
  impact: 'low' | 'medium' | 'high';
}

export interface AttentionDistribution {
  systemPrompt: number;
  recentMessages: number;
  olderMessages: number;
  toolResponses: number;
}

export interface AnalysisResult {
  runId: string;
  sessionId: string;
  tokenBreakdown: TokenBreakdown;
  messageImpacts: MessageImpact[];
  contextEvolution: ContextEvolution[];
  dependencyGraph: DependencyGraph;
  insights: AnalysisInsight[];
  topicClusters: TopicCluster[];
  contextSimilarities: ContextSimilarity[];
  compressionSuggestions: ContextCompressionSuggestion[];
  attentionDistribution: AttentionDistribution;
  keyMessages: MessageImpact[];
  contextHealth: {
    score: number;
    issues: string[];
    recommendations: string[];
  };
}
