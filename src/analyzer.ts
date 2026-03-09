/**
 * Context Analyzer Module
 * 
 * Provides deep analysis of request contexts including:
 * - Token distribution analysis
 * - Attention heatmap calculation
 * - Context evolution tracking
 * - Tool call dependency graph
 */

import type { RequestData } from './storage.js';

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
  impactScore: number; // 0-100
  timestamp: number;
}

export interface ContextEvolution {
  timestamp: number;
  totalTokens: number;
  messageCount: number;
  compressionRatio: number;
  summaryApplied: boolean;
  windowUtilization: number; // 0-1
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

export interface AnalysisResult {
  runId: string;
  sessionId: string;
  tokenBreakdown: TokenBreakdown;
  messageImpacts: MessageImpact[];
  contextEvolution: ContextEvolution[];
  dependencyGraph: DependencyGraph;
  insights: AnalysisInsight[];
}

export interface AnalysisInsight {
  type: 'warning' | 'info' | 'optimization';
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
}

export class ContextAnalyzer {
  private readonly MODEL_CONTEXT_WINDOWS: Record<string, number> = {
    'gpt-4': 8192,
    'gpt-4-turbo': 128000,
    'gpt-4-32k': 32768,
    'gpt-3.5-turbo': 16385,
    'gpt-3.5-turbo-16k': 16385,
    'claude-3-opus': 200000,
    'claude-3-sonnet': 200000,
    'claude-3-haiku': 200000,
    'claude-2': 100000,
    'qwen': 32768,
    'qwen2': 128000,
    'default': 8192
  };

  analyzeRequest(request: RequestData, relatedRequests: RequestData[]): AnalysisResult {
    const tokenBreakdown = this.analyzeTokenDistribution(request);
    const messageImpacts = this.analyzeMessageImpacts(request);
    const contextEvolution = this.analyzeContextEvolution(relatedRequests);
    const dependencyGraph = this.analyzeToolDependencies(relatedRequests);
    const insights = this.generateInsights(tokenBreakdown, messageImpacts, contextEvolution);

    return {
      runId: request.runId,
      sessionId: request.sessionId,
      tokenBreakdown,
      messageImpacts,
      contextEvolution,
      dependencyGraph,
      insights
    };
  }

  private analyzeTokenDistribution(request: RequestData): TokenBreakdown {
    const breakdown: TokenBreakdown = {
      systemPrompt: 0,
      historyMessages: 0,
      currentPrompt: 0,
      toolResponses: 0,
      totalInput: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0
    };

    // Estimate token counts based on content length
    if (request.systemPrompt) {
      breakdown.systemPrompt = this.estimateTokens(request.systemPrompt);
    }

    if (request.historyMessages) {
      const historyContent = JSON.stringify(request.historyMessages);
      breakdown.historyMessages = this.estimateTokens(historyContent);
    }

    if (request.prompt) {
      breakdown.currentPrompt = this.estimateTokens(request.prompt);
    }

    // Analyze tool responses in history
    if (request.historyMessages) {
      for (const msg of request.historyMessages) {
        const msgAny = msg as any;
        if (msgAny?.role === 'tool' || msgAny?.type === 'tool_response') {
          const content = typeof msgAny.content === 'string' ? msgAny.content : JSON.stringify(msgAny.content);
          breakdown.toolResponses += this.estimateTokens(content);
        }
      }
    }

    breakdown.totalInput = breakdown.systemPrompt + breakdown.historyMessages + 
                           breakdown.currentPrompt + breakdown.toolResponses;

    if (request.usage) {
      breakdown.output = request.usage.output || 0;
      breakdown.cacheRead = request.usage.cacheRead || 0;
      breakdown.cacheWrite = request.usage.cacheWrite || 0;
    }

    return breakdown;
  }

  private analyzeMessageImpacts(request: RequestData): MessageImpact[] {
    const impacts: MessageImpact[] = [];

    if (!request.historyMessages) return impacts;

    const now = request.timestamp;
    const halfLife = 30 * 60 * 1000; // 30 minutes half-life

    request.historyMessages.forEach((msg: any, index: number) => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      const tokenCount = this.estimateTokens(content);
      
      // Calculate impact score based on:
      // - Recency (exponential decay)
      // - Content length (longer = potentially more important)
      // - Position (later messages often more relevant)
      const timeDecay = Math.exp(-(now - (msg.timestamp || now)) / halfLife);
      const lengthFactor = Math.log10(tokenCount + 10);
      const positionFactor = (index + 1) / request.historyMessages!.length;

      const impactScore = Math.round(
        (timeDecay * 0.5 + lengthFactor * 0.3 + positionFactor * 0.2) * 100
      );

      impacts.push({
        messageId: msg.id || `msg-${index}`,
        role: msg.role || 'user',
        content: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
        tokenCount,
        impactScore: Math.min(100, Math.max(0, impactScore)),
        timestamp: msg.timestamp || now
      });
    });

    // Sort by impact score descending
    impacts.sort((a, b) => b.impactScore - a.impactScore);

    return impacts;
  }

  private analyzeContextEvolution(requests: RequestData[]): ContextEvolution[] {
    const evolution: ContextEvolution[] = [];
    const sortedRequests = [...requests].sort((a, b) => a.timestamp - b.timestamp);

    let cumulativeTokens = 0;
    let messageCount = 0;

    sortedRequests.forEach((request, index) => {
      const tokens = request.usage?.total || 
                     this.estimateTokens(request.prompt || '') + 
                     this.estimateTokens(request.systemPrompt || '');
      
      cumulativeTokens += tokens;
      messageCount++;

      const modelWindow = this.getModelContextWindow(request.model);
      const compressionRatio = cumulativeTokens / modelWindow;
      const summaryApplied = compressionRatio > 0.8;

      evolution.push({
        timestamp: request.timestamp,
        totalTokens: cumulativeTokens,
        messageCount,
        compressionRatio: Math.min(1, compressionRatio),
        summaryApplied,
        windowUtilization: compressionRatio
      });

      // If compression ratio exceeded, simulate context compression
      if (compressionRatio > 1) {
        cumulativeTokens = Math.round(modelWindow * 0.7); // Compress to 70% after summary
      }
    });

    return evolution;
  }

  private analyzeToolDependencies(requests: RequestData[]): DependencyGraph {
    const nodes: Map<string, ToolCallNode> = new Map();
    const edges: Array<{ from: string; to: string; weight: number }> = [];

    requests.forEach((request, index) => {
      // Extract tool calls from history messages
      if (request.historyMessages) {
        request.historyMessages.forEach((msg: any) => {
          if (msg.tool_call_id || msg.type === 'tool_call') {
            const nodeId = msg.tool_call_id || `tool-${Date.now()}-${Math.random()}`;
            const toolName = msg.name || msg.tool_name || 'unknown';
            
            if (!nodes.has(nodeId)) {
              nodes.set(nodeId, {
                id: nodeId,
                name: toolName,
                duration: msg.duration || 0,
                tokensUsed: this.estimateTokens(JSON.stringify(msg)),
                dependencies: [],
                status: msg.status || 'success',
                children: []
              });
            }
          }

          // Track tool call relationships
          if (msg.tool_call_id && msg.role === 'tool') {
            // This is a tool response, link to the original call
            const responseId = `response-${msg.tool_call_id}`;
            nodes.set(responseId, {
              id: responseId,
              name: `${msg.name || 'tool'}-response`,
              duration: 0,
              tokensUsed: this.estimateTokens(typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)),
              dependencies: [msg.tool_call_id],
              status: 'success',
              children: []
            });

            edges.push({
              from: msg.tool_call_id,
              to: responseId,
              weight: 1
            });
          }
        });
      }

      // Track sequential tool calls as dependencies
      if (request.metadata && (request.metadata as any).toolCalls) {
        const toolCalls = (request.metadata as any).toolCalls as any[];
        toolCalls.forEach((call: any, idx: number) => {
          const callId = call.id || `call-${index}-${idx}`;
          
          if (!nodes.has(callId)) {
            nodes.set(callId, {
              id: callId,
              name: call.name || 'unknown',
              duration: call.duration || 0,
              tokensUsed: call.tokens || 0,
              dependencies: idx > 0 ? [toolCalls[idx - 1].id || `call-${index}-${idx - 1}`] : [],
              status: call.status || 'success',
              children: []
            });
          }

          // Add edge from previous tool call
          if (idx > 0) {
            const prevId = toolCalls[idx - 1].id || `call-${index}-${idx - 1}`;
            edges.push({
              from: prevId,
              to: callId,
              weight: 1
            });
          }
        });
      }
    });

    // Build children arrays from dependencies
    edges.forEach(edge => {
      const fromNode = nodes.get(edge.from);
      if (fromNode) {
        fromNode.children.push(edge.to);
      }
    });

    return {
      nodes: Array.from(nodes.values()),
      edges
    };
  }

  private generateInsights(
    tokenBreakdown: TokenBreakdown,
    messageImpacts: MessageImpact[],
    contextEvolution: ContextEvolution[]
  ): AnalysisInsight[] {
    const insights: AnalysisInsight[] = [];

    // Check for high token usage in system prompt
    if (tokenBreakdown.systemPrompt > tokenBreakdown.totalInput * 0.3) {
      insights.push({
        type: 'optimization',
        title: '系统提示占用过高',
        description: `系统提示占用了 ${Math.round(tokenBreakdown.systemPrompt / tokenBreakdown.totalInput * 100)}% 的输入 token，考虑优化或压缩系统提示`,
        severity: 'medium'
      });
    }

    // Check for context window pressure
    const latestEvolution = contextEvolution[contextEvolution.length - 1];
    if (latestEvolution && latestEvolution.windowUtilization > 0.8) {
      insights.push({
        type: 'warning',
        title: '上下文窗口压力大',
        description: `上下文窗口使用率已达 ${Math.round(latestEvolution.windowUtilization * 100)}%，可能触发自动摘要或截断`,
        severity: latestEvolution.windowUtilization > 0.95 ? 'high' : 'medium'
      });
    }

    // Check for low-impact messages consuming tokens
    const lowImpactHighToken = messageImpacts.filter(
      m => m.impactScore < 30 && m.tokenCount > 100
    );
    if (lowImpactHighToken.length > 0) {
      insights.push({
        type: 'optimization',
        title: '低价值消息占用上下文',
        description: `发现 ${lowImpactHighToken.length} 条低影响力但占用较多 token 的消息，考虑从上下文中移除`,
        severity: 'low'
      });
    }

    // Check for cache efficiency
    if (tokenBreakdown.cacheRead > 0 && tokenBreakdown.cacheWrite > 0) {
      const cacheHitRate = tokenBreakdown.cacheRead / (tokenBreakdown.cacheRead + tokenBreakdown.cacheWrite);
      if (cacheHitRate < 0.5) {
        insights.push({
          type: 'info',
          title: '缓存命中率较低',
          description: `缓存命中率仅为 ${Math.round(cacheHitRate * 100)}%，考虑优化提示结构以提高缓存效率`,
          severity: 'low'
        });
      }
    }

    return insights;
  }

  private estimateTokens(text: string): number {
    // Simple estimation: ~4 characters per token for English
    // For Chinese, ~1.5 characters per token
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    
    return Math.round(chineseChars / 1.5 + otherChars / 4);
  }

  private getModelContextWindow(model: string): number {
    const modelLower = model.toLowerCase();
    for (const [key, value] of Object.entries(this.MODEL_CONTEXT_WINDOWS)) {
      if (modelLower.includes(key)) {
        return value;
      }
    }
    return this.MODEL_CONTEXT_WINDOWS['default'];
  }
}
